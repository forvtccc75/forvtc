"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

function err(path: string, m: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}erreur=${encodeURIComponent(m)}`);
}

const reviewSchema = z.object({
  bookingId: z.string().uuid(),
  note: z.coerce.number().int().min(1, "Note entre 1 et 5.").max(5, "Note entre 1 et 5."),
  commentaire: z.string().trim().max(2000).optional().or(z.literal("")),
});

/**
 * ANTI-FAUX-AVIS : un avis n'est possible que
 * 1) par une partie réelle à la réservation,
 * 2) sur une location réellement TERMINÉE (statut completed),
 * 3) une seule fois par auteur et par location (contrainte unique en base).
 */
export async function laisserAvis(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData.entries()));
  const bookingId = String(formData.get("bookingId") ?? "");
  const back = String(formData.get("retour") ?? "/dashboard");
  if (!parsed.success) err(back, parsed.error.errors[0].message);
  const d = parsed.data;

  const db = await getDb();
  const booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, d.bookingId) });
  if (!booking) err(back, "Réservation introuvable.");
  if (booking.statut !== "completed")
    err(back, "Un avis ne peut être laissé que sur une location terminée.");

  const listing = (await db.query.listings.findFirst({ where: eq(schema.listings.id, booking.listingId) }))!;
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;

  let cibleId: string;
  if (user.id === booking.driverId) cibleId = vehicle.ownerId;
  else if (user.id === vehicle.ownerId) cibleId = booking.driverId;
  else err(back, "Vous n'êtes pas partie à cette location.");

  const deja = await db.query.reviews.findFirst({
    where: and(eq(schema.reviews.bookingId, booking.id), eq(schema.reviews.auteurId, user.id)),
  });
  if (deja) err(back, "Vous avez déjà laissé un avis sur cette location.");

  const [avis] = await db
    .insert(schema.reviews)
    .values({
      bookingId: booking.id,
      auteurId: user.id,
      cibleId,
      note: d.note,
      commentaire: d.commentaire || null,
    })
    .returning();

  await audit(user.id, "avis.cree", { type: "review", id: avis.id }, { bookingId: booking.id, note: d.note });
  await notify(cibleId, "avis", "Nouvel avis reçu", `${user.prenom} ${user.nom.charAt(0)}. vous a laissé un avis (${d.note}/5).`);
  redirect(`${back}?ok=${encodeURIComponent("Avis publié. Merci !")}`);
}
