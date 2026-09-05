"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { saveUpload } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { transitionBooking } from "@/lib/booking";

function err(path: string, m: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}erreur=${encodeURIComponent(m)}`);
}

const ETATS = ["bon", "rayures_legeres", "dommages_visibles"] as const;

const inspSchema = z.object({
  bookingId: z.string().uuid(),
  type: z.enum(["depart", "retour"]),
  kilometrage: z.coerce.number().int().min(0).max(2000000),
  carburantPct: z.coerce.number().int().min(0).max(100).optional(),
  batteriePct: z.coerce.number().int().min(0).max(100).optional(),
  carrosserie: z.enum(ETATS, { errorMap: () => ({ message: "Indiquez l'état de la carrosserie." }) }),
  interieur: z.enum(ETATS, { errorMap: () => ({ message: "Indiquez l'état de l'intérieur." }) }),
  pneus: z.enum(ETATS, { errorMap: () => ({ message: "Indiquez l'état des pneus." }) }),
  degats: z.string().trim().max(4000).optional().or(z.literal("")),
});

async function chargerContexte(bookingId: string, userId: string) {
  const db = await getDb();
  const booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, bookingId) });
  if (!booking) return null;
  const listing = (await db.query.listings.findFirst({ where: eq(schema.listings.id, booking.listingId) }))!;
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;
  const estChauffeur = booking.driverId === userId;
  const estLoueur = vehicle.ownerId === userId;
  if (!estChauffeur && !estLoueur) return null;
  return { db, booking, listing, vehicle, estChauffeur, estLoueur };
}

/**
 * Création de l'état des lieux (départ : contrat actif requis ; retour : location active).
 * Horodatage serveur ; photos par zones ; validation contradictoire par l'autre partie.
 */
export async function creerEtatDesLieux(formData: FormData): Promise<void> {
  const user = await requireUser();
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of ["carburantPct", "batteriePct"]) if (raw[k] === "") delete raw[k];
  const parsed = inspSchema.safeParse(raw);
  const bookingId = String(formData.get("bookingId") ?? "");
  const back = `/dashboard/etat-des-lieux/${bookingId}`;
  if (!parsed.success) err(back, parsed.error.errors[0].message);
  const d = parsed.data;

  const ctx = await chargerContexte(d.bookingId, user.id);
  if (!ctx) err("/dashboard", "Réservation introuvable ou non autorisée.");
  const { db, booking, vehicle } = ctx;

  // Prérequis réels selon le type
  const contrat = await db.query.contracts.findFirst({
    where: and(eq(schema.contracts.bookingId, booking.id), eq(schema.contracts.statut, "actif")),
  });
  if (d.type === "depart") {
    if (!contrat) err(back, "L'état des lieux de départ nécessite un contrat signé par les deux parties.");
    if (!["accepted", "signed", "active"].includes(booking.statut))
      err(back, "La réservation n'est pas à un stade permettant l'état des lieux de départ.");
  } else {
    const depart = await db.query.inspections.findFirst({
      where: and(eq(schema.inspections.bookingId, booking.id), eq(schema.inspections.type, "depart")),
    });
    if (!depart || !depart.valideParAutrePartie)
      err(back, "L'état des lieux de retour nécessite un état des lieux de départ validé par les deux parties.");
    if (d.kilometrage < depart.kilometrage)
      err(back, `Kilométrage incohérent : ${d.kilometrage} km < ${depart.kilometrage} km relevés au départ.`);
  }

  const existant = await db.query.inspections.findFirst({
    where: and(eq(schema.inspections.bookingId, booking.id), eq(schema.inspections.type, d.type)),
  });
  if (existant) err(back, `Un état des lieux de ${d.type} existe déjà pour cette location.`);

  const [insp] = await db
    .insert(schema.inspections)
    .values({
      bookingId: booking.id,
      type: d.type,
      kilometrage: d.kilometrage,
      carburantPct: d.carburantPct ?? null,
      batteriePct: d.batteriePct ?? null,
      carrosserie: d.carrosserie,
      interieur: d.interieur,
      pneus: d.pneus,
      degats: d.degats || null,
      faitPar: user.id,
    })
    .returning();

  await audit(user.id, `etat_des_lieux.${d.type}`, { type: "inspection", id: insp.id }, { bookingId: booking.id, km: d.kilometrage });
  const autre = user.id === booking.driverId ? vehicle.ownerId : booking.driverId;
  await notify(autre, "etat_des_lieux", `État des lieux de ${d.type} à valider`, "L'autre partie a rempli l'état des lieux. Vérifiez-le et validez-le pour qu'il devienne contradictoire.");
  redirect(`${back}?ok=${encodeURIComponent("État des lieux enregistré (horodaté). Ajoutez les photos puis faites-le valider par l'autre partie.")}`);
}

export async function ajouterPhotoInspection(formData: FormData): Promise<void> {
  const user = await requireUser();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const zone = String(formData.get("zone") ?? "autre");
  const db = await getDb();
  const insp = await db.query.inspections.findFirst({ where: eq(schema.inspections.id, inspectionId) });
  if (!insp) err("/dashboard", "État des lieux introuvable.");
  const back = `/dashboard/etat-des-lieux/${insp.bookingId}`;
  const ctx = await chargerContexte(insp.bookingId, user.id);
  if (!ctx) err("/dashboard", "Non autorisé.");
  if (insp.faitPar !== user.id) err(back, "Seul l'auteur de l'état des lieux peut y ajouter des photos.");
  if (insp.valideParAutrePartie) err(back, "État des lieux déjà validé : il ne peut plus être modifié.");
  if (!["avant", "arriere", "gauche", "droite", "interieur", "compteur", "autre"].includes(zone))
    err(back, "Zone invalide.");
  try {
    const stored = await saveUpload(formData.get("photo") as File, "photos");
    await db.insert(schema.inspectionPhotos).values({ inspectionId: insp.id, path: stored.storagePath, zone });
  } catch (e) {
    err(back, e instanceof Error ? e.message : "Photo invalide.");
  }
  await audit(user.id, "etat_des_lieux.photo", { type: "inspection", id: insp.id }, { zone });
  redirect(`${back}?ok=${encodeURIComponent("Photo horodatée ajoutée.")}`);
}

/** Validation contradictoire par l'AUTRE partie. Au retour validé : la location avance. */
export async function validerEtatDesLieux(formData: FormData): Promise<void> {
  const user = await requireUser();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const db = await getDb();
  const insp = await db.query.inspections.findFirst({ where: eq(schema.inspections.id, inspectionId) });
  if (!insp) err("/dashboard", "État des lieux introuvable.");
  const back = `/dashboard/etat-des-lieux/${insp.bookingId}`;
  const ctx = await chargerContexte(insp.bookingId, user.id);
  if (!ctx) err("/dashboard", "Non autorisé.");
  if (insp.faitPar === user.id) err(back, "L'auteur ne peut pas valider son propre état des lieux : la validation revient à l'autre partie.");
  if (insp.valideParAutrePartie) err(back, "Déjà validé.");

  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await db
    .update(schema.inspections)
    .set({ valideParAutrePartie: true, valideLe: new Date(), valideIp: ip })
    .where(eq(schema.inspections.id, insp.id));
  await audit(user.id, "etat_des_lieux.valide", { type: "inspection", id: insp.id }, { type_edl: insp.type });

  const { booking } = ctx;
  if (insp.type === "depart") {
    // Départ validé : la location devient active (via signed si nécessaire)
    if (booking.statut === "accepted") {
      // Sans module de paiement : passage explicite documenté dans l'audit
      await ctx.db.update(schema.bookings).set({ statut: "active", updatedAt: new Date() }).where(eq(schema.bookings.id, booking.id));
      await audit(user.id, "booking.active_sans_paiement", { type: "booking", id: booking.id }, { note: "module paiement non activé — passage direct documenté" });
    } else if (booking.statut === "signed") {
      await transitionBooking(booking.id, "active", user.id);
    }
    await notify(booking.driverId, "location", "Location démarrée", "L'état des lieux de départ est validé par les deux parties : la location est en cours.");
  } else {
    // Retour validé : returned puis completed
    if (booking.statut === "active") {
      await transitionBooking(booking.id, "return_pending", user.id);
      await transitionBooking(booking.id, "returned", user.id);
      await transitionBooking(booking.id, "completed", user.id);
    }
    await notify(booking.driverId, "location", "Location terminée", "L'état des lieux de retour est validé : la location est terminée. Vous pouvez laisser un avis.");
    await notify(ctx.vehicle.ownerId, "location", "Location terminée", "L'état des lieux de retour est validé. Vous pouvez laisser un avis sur le chauffeur.");
  }
  redirect(`${back}?ok=${encodeURIComponent("État des lieux validé contradictoirement.")}`);
}
