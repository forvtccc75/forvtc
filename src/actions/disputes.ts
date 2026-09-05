"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { transitionBooking, TRANSITIONS } from "@/lib/booking";

function err(path: string, m: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}erreur=${encodeURIComponent(m)}`);
}

const ouvrirSchema = z.object({
  bookingId: z.string().uuid(),
  categorie: z.enum(schema.disputeCategory.enumValues),
  description: z.string().trim().min(30, "Décrivez le problème (30 caractères minimum).").max(4000),
});

/** Seule une partie réelle à une location engagée (contrat/EDL/terminée) peut ouvrir un litige. */
export async function ouvrirLitige(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = ouvrirSchema.safeParse(Object.fromEntries(formData.entries()));
  const back = "/dashboard/litiges";
  if (!parsed.success) err(`${back}/nouveau?bookingId=${formData.get("bookingId")}`, parsed.error.errors[0].message);
  const d = parsed.data;

  const db = await getDb();
  const booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, d.bookingId) });
  if (!booking) err(back, "Réservation introuvable.");
  const listing = (await db.query.listings.findFirst({ where: eq(schema.listings.id, booking.listingId) }))!;
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;
  if (booking.driverId !== user.id && vehicle.ownerId !== user.id)
    err(back, "Vous n'êtes pas partie à cette location.");
  if (!["paid", "contract_pending", "signed", "active", "return_pending", "returned", "completed", "disputed"].includes(booking.statut))
    err(back, "Un litige ne peut être ouvert que sur une location engagée (contrat, en cours ou terminée).");

  const dejaOuvert = await db.query.disputes.findMany({ where: eq(schema.disputes.bookingId, booking.id) });
  if (dejaOuvert.some((l) => ["ouvert", "en_analyse"].includes(l.statut)))
    err(back, "Un litige est déjà en cours sur cette location.");

  const [litige] = await db
    .insert(schema.disputes)
    .values({ bookingId: booking.id, ouvertPar: user.id, categorie: d.categorie, description: d.description })
    .returning();

  // La location passe en "disputed" si la machine à états le permet (sinon le litige existe sans changer l'état)
  if ((TRANSITIONS[booking.statut] ?? []).includes("disputed")) {
    await transitionBooking(booking.id, "disputed", user.id);
  }

  await audit(user.id, "litige.ouvert", { type: "dispute", id: litige.id }, { bookingId: booking.id, categorie: d.categorie });
  const autre = user.id === booking.driverId ? vehicle.ownerId : booking.driverId;
  await notify(autre, "litige", "Un litige a été ouvert", `Un litige (${d.categorie}) a été ouvert sur la location « ${listing.titre} ». Notre équipe va l'examiner.`);
  redirect(`${back}?ok=${encodeURIComponent("Litige ouvert. Notre équipe va examiner le dossier (contrat, états des lieux, messages) et revenir vers les deux parties.")}`);
}

const decisionSchema = z.object({
  disputeId: z.string().uuid(),
  action: z.enum(["prendre_en_charge", "resoudre"]),
  resolution: z.string().trim().max(4000).optional().or(z.literal("")),
});

export async function traiterLitige(formData: FormData): Promise<void> {
  const admin = await requireUser(["admin"]);
  const parsed = decisionSchema.safeParse(Object.fromEntries(formData.entries()));
  const back = "/admin/litiges";
  if (!parsed.success) err(back, "Requête invalide.");
  const d = parsed.data;

  const db = await getDb();
  const litige = await db.query.disputes.findFirst({ where: eq(schema.disputes.id, d.disputeId) });
  if (!litige) err(back, "Litige introuvable.");

  if (d.action === "prendre_en_charge") {
    if (litige.statut !== "ouvert") err(back, "Ce litige n'est pas au statut « ouvert ».");
    await db.update(schema.disputes).set({ statut: "en_analyse" }).where(eq(schema.disputes.id, litige.id));
    await audit(admin.id, "litige.en_analyse", { type: "dispute", id: litige.id });
    redirect(`${back}?ok=${encodeURIComponent("Litige pris en charge.")}`);
  }

  if (!d.resolution?.trim() || d.resolution.trim().length < 20)
    err(back, "Une résolution motivée est obligatoire (20 caractères minimum).");
  if (!["ouvert", "en_analyse"].includes(litige.statut)) err(back, "Ce litige est déjà clos.");

  await db
    .update(schema.disputes)
    .set({ statut: "resolu", resolution: d.resolution.trim() })
    .where(eq(schema.disputes.id, litige.id));

  const booking = (await db.query.bookings.findFirst({ where: eq(schema.bookings.id, litige.bookingId) }))!;
  if (booking.statut === "disputed") {
    await transitionBooking(booking.id, "completed", admin.id);
  }
  const listing = (await db.query.listings.findFirst({ where: eq(schema.listings.id, booking.listingId) }))!;
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;

  await audit(admin.id, "litige.resolu", { type: "dispute", id: litige.id }, { resolution: d.resolution.trim().slice(0, 200) });
  for (const uid of [booking.driverId, vehicle.ownerId]) {
    await notify(uid, "litige", "Litige résolu", `Décision sur le litige de la location « ${listing.titre} » : ${d.resolution.trim()}`);
  }
  redirect(`${back}?ok=${encodeURIComponent("Litige résolu et parties notifiées.")}`);
}
