"use server";

import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { periodeDisponible, transitionBooking } from "@/lib/booking";
import { calculerDevis } from "@/lib/pricing";
import { emailVerifieRequis } from "@/lib/email-gate";
import { stripeActif } from "@/lib/stripe";
import { loueurPeutEncaisser } from "@/lib/connect";
import { joursEntre } from "@/lib/format";

const demandeSchema = z.object({
  listingId: z.string().uuid(),
  dateDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de début invalide."),
  dateFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de fin invalide."),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
});

function err(path: string, m: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}erreur=${encodeURIComponent(m)}`);
}

export async function demanderLocation(formData: FormData): Promise<void> {
  const user = await requireUser(["chauffeur"]);
  const parsed = demandeSchema.safeParse(Object.fromEntries(formData.entries()));
  const listingId = String(formData.get("listingId") ?? "");
  {
    const gate = emailVerifieRequis(user);
    if (gate) err(`/annonce/${listingId}`, gate);
  }
  const back = `/annonce/${listingId}`;
  if (!parsed.success) err(back, parsed.error.errors[0].message);
  const d = parsed.data;

  const debut = new Date(d.dateDebut + "T00:00:00Z");
  const fin = new Date(d.dateFin + "T00:00:00Z");
  const aujourdhui = new Date();
  aujourdhui.setUTCHours(0, 0, 0, 0);
  if (debut < aujourdhui) err(back, "La date de début ne peut pas être dans le passé.");
  if (fin <= debut) err(back, "La date de fin doit être après la date de début.");

  const db = await getDb();
  const listing = await db.query.listings.findFirst({
    where: and(eq(schema.listings.id, d.listingId), eq(schema.listings.statut, "publiee")),
  });
  if (!listing) err(back, "Annonce introuvable ou non publiée.");

  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;
  if (vehicle.ownerId === user.id) err(back, "Vous ne pouvez pas réserver votre propre véhicule.");

  const jours = joursEntre(debut, fin);
  if (jours < listing.dureeMinJours)
    err(back, `Durée minimale de location : ${listing.dureeMinJours} jours (demande : ${jours} jours).`);
  if (listing.dureeMaxJours && jours > listing.dureeMaxJours)
    err(back, `Durée maximale de location : ${listing.dureeMaxJours} jours.`);

  const devis = calculerDevis(listing, jours);
  if (!devis) err(back, "Impossible de calculer le prix : tarifs incomplets sur cette annonce.");

  // Pas de double demande active du même chauffeur sur la même annonce
  const dejaActive = await db.query.bookings.findMany({
    where: and(
      eq(schema.bookings.listingId, listing.id),
      eq(schema.bookings.driverId, user.id)
    ),
  });
  if (dejaActive.some((b) => ["requested", "accepted", "payment_pending", "paid", "contract_pending", "signed", "active"].includes(b.statut)))
    err(back, "Vous avez déjà une demande ou une location en cours sur cette annonce.");

  // Anti-double réservation : verrou transactionnel (advisory lock par annonce) + re-vérification
  const lockKey = BigInt("0x" + listing.id.replace(/-/g, "").slice(0, 15));
  await db.execute(sql`SELECT pg_advisory_lock(${lockKey})`);
  try {
    const dispo = await periodeDisponible(listing.id, vehicle.id, debut, fin);
    if (!dispo.libre) err(back, dispo.raison!);

    const [booking] = await db
      .insert(schema.bookings)
      .values({
        listingId: listing.id,
        driverId: user.id,
        dateDebut: debut,
        dateFin: fin,
        statut: "requested",
        prixTotalCents: devis.totalCents,
        cautionCents: listing.cautionCents,
        message: d.message || null,
      })
      .returning();

    await audit(user.id, "booking.demande", { type: "booking", id: booking.id }, { listingId: listing.id, jours, totalCents: devis.totalCents });

    // Comme sur les grandes plateformes : la demande ouvre (ou retrouve) la conversation
    // avec le loueur, et le message d'accompagnement y est posté pour permettre l'échange.
    let conv = await db.query.conversations.findFirst({
      where: and(
        eq(schema.conversations.listingId, listing.id),
        or(
          and(eq(schema.conversations.participantA, user.id), eq(schema.conversations.participantB, vehicle.ownerId)),
          and(eq(schema.conversations.participantA, vehicle.ownerId), eq(schema.conversations.participantB, user.id))
        )
      ),
    });
    if (!conv) {
      [conv] = await db
        .insert(schema.conversations)
        .values({ listingId: listing.id, participantA: user.id, participantB: vehicle.ownerId })
        .returning();
      await audit(user.id, "conversation.creee", { type: "conversation", id: conv.id }, { via: "demande_location" });
    }
    await db.insert(schema.messages).values({
      conversationId: conv.id,
      senderId: user.id,
      contenu:
        d.message?.trim() ||
        `Bonjour, je souhaite louer « ${listing.titre} » du ${d.dateDebut} au ${d.dateFin}.`,
    });

    await notify(
      vehicle.ownerId,
      "booking",
      "Nouvelle demande de location",
      `${user.prenom} ${user.nom.charAt(0)}. souhaite louer « ${listing.titre} » du ${d.dateDebut} au ${d.dateFin} (${jours} jours, ${(devis.totalCents / 100).toFixed(2)} €).`
    );
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${lockKey})`);
  }
  redirect(`/dashboard/locations?ok=${encodeURIComponent("Demande envoyée au loueur. Vous serez notifié de sa réponse.")}`);
}

const decisionSchema = z.object({
  bookingId: z.string().uuid(),
  decision: z.enum(["accepter", "refuser"]),
});

export async function deciderDemande(formData: FormData): Promise<void> {
  const user = await requireUser(["loueur", "entreprise", "gestionnaire_flotte"]);
  const parsed = decisionSchema.safeParse(Object.fromEntries(formData.entries()));
  const back = "/dashboard/demandes";
  if (!parsed.success) err(back, "Requête invalide.");
  const d = parsed.data;

  const db = await getDb();
  const booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, d.bookingId) });
  if (!booking) err(back, "Demande introuvable.");
  const listing = (await db.query.listings.findFirst({ where: eq(schema.listings.id, booking.listingId) }))!;
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;
  if (vehicle.ownerId !== user.id) err(back, "Vous n'êtes pas le loueur de cette annonce.");
  if (booking.statut !== "requested") err(back, "Cette demande n'est plus en attente.");

  // Paiement en ligne actif : le loueur doit pouvoir encaisser AVANT d'accepter
  // (sinon le chauffeur paierait sans destinataire des fonds).
  if (d.decision === "accepter" && stripeActif() && !(await loueurPeutEncaisser(user.id)))
    err(back, "Activez d'abord l'encaissement des loyers (menu Encaissement) pour accepter des demandes payées en ligne.");

  if (d.decision === "refuser") {
    const t = await transitionBooking(booking.id, "cancelled", user.id);
    if (!t.ok) err(back, t.erreur);
    await notify(booking.driverId, "booking", "Demande refusée", `Le loueur a refusé votre demande pour « ${listing.titre} ».`);
    redirect(`${back}?ok=${encodeURIComponent("Demande refusée. Le chauffeur a été notifié.")}`);
  }

  // Acceptation : verrou + re-vérification de disponibilité (une autre demande a pu être acceptée entre-temps)
  const lockKey = BigInt("0x" + listing.id.replace(/-/g, "").slice(0, 15));
  await db.execute(sql`SELECT pg_advisory_lock(${lockKey})`);
  try {
    const dispo = await periodeDisponible(listing.id, vehicle.id, booking.dateDebut, booking.dateFin, booking.id);
    if (!dispo.libre)
      err(back, "Impossible d'accepter : la période n'est plus disponible (autre réservation acceptée entre-temps).");
    const t = await transitionBooking(booking.id, "accepted", user.id);
    if (!t.ok) err(back, t.erreur);
    // Bloquer le calendrier
    await db.insert(schema.availability).values({
      vehicleId: vehicle.id,
      dateDebut: booking.dateDebut,
      dateFin: booking.dateFin,
      statut: "reserve",
    });
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${lockKey})`);
  }

  await notify(
    booking.driverId,
    "booking",
    "Votre demande a été acceptée 🎉",
    `Le loueur a accepté votre demande pour « ${listing.titre} ». Prochaine étape : paiement sécurisé et contrat (modules en cours d'activation — vous serez notifié dès l'ouverture).`
  );
  redirect(`${back}?ok=${encodeURIComponent("Demande acceptée : la période est bloquée au calendrier. Le chauffeur a été notifié.")}`);
}

export async function annulerDemande(formData: FormData): Promise<void> {
  const user = await requireUser(["chauffeur"]);
  const bookingId = String(formData.get("bookingId") ?? "");
  const back = "/dashboard/locations";
  const db = await getDb();
  const booking = await db.query.bookings.findFirst({
    where: and(eq(schema.bookings.id, bookingId), eq(schema.bookings.driverId, user.id)),
  });
  if (!booking) err(back, "Réservation introuvable.");
  if (!["requested", "accepted"].includes(booking.statut))
    err(back, "Cette réservation ne peut plus être annulée directement — contactez le support.");
  const t = await transitionBooking(booking.id, "cancelled", user.id);
  if (!t.ok) err(back, t.erreur);

  // Libérer le calendrier si la période avait été bloquée
  const listing = (await db.query.listings.findFirst({ where: eq(schema.listings.id, booking.listingId) }))!;
  await db
    .delete(schema.availability)
    .where(
      and(
        eq(schema.availability.vehicleId, listing.vehicleId),
        eq(schema.availability.statut, "reserve"),
        eq(schema.availability.dateDebut, booking.dateDebut),
        eq(schema.availability.dateFin, booking.dateFin)
      )
    );
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;
  await notify(vehicle.ownerId, "booking", "Demande annulée", `Le chauffeur a annulé sa demande pour « ${listing.titre} ».`);
  redirect(`${back}?ok=${encodeURIComponent("Réservation annulée.")}`);
}
