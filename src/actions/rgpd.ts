"use server";

import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { destroySession } from "@/lib/session";
import { audit } from "@/lib/audit";

function fail(m: string): never {
  redirect(`/dashboard/compte?erreur=${encodeURIComponent(m)}`);
}

/**
 * Suppression de compte (RGPD art. 17) — soft delete + anonymisation.
 * Les contrats et paiements sont CONSERVÉS (obligations légales de conservation),
 * mais le compte est anonymisé et inutilisable.
 * Refusée si une location est en cours (obligations contractuelles d'abord).
 */
export async function supprimerMonCompte(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role === "admin") fail("Un compte administrateur ne peut pas s'auto-supprimer.");

  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (confirmation !== "SUPPRIMER") fail("Tapez SUPPRIMER dans le champ de confirmation.");

  const db = await getDb();
  const complet = await db.query.users.findFirst({ where: eq(schema.users.id, user.id) });
  if (!complet || !(await bcrypt.compare(password, complet.passwordHash))) fail("Mot de passe incorrect.");

  // Locations actives ? (côté chauffeur ET côté loueur)
  const EN_COURS = ["accepted", "payment_pending", "paid", "contract_pending", "signed", "active", "return_pending", "returned", "disputed"];
  const commeChauffeur = await db.query.bookings.findMany({ where: eq(schema.bookings.driverId, user.id) });
  if (commeChauffeur.some((b) => EN_COURS.includes(b.statut)))
    fail("Suppression impossible : vous avez une location en cours. Terminez-la (ou annulez-la) d'abord.");

  const mesVehicules = await db.query.vehicles.findMany({ where: eq(schema.vehicles.ownerId, user.id) });
  if (mesVehicules.length > 0) {
    const mesListings = await db.query.listings.findMany({
      where: inArray(schema.listings.vehicleId, mesVehicules.map((v) => v.id)),
    });
    if (mesListings.length > 0) {
      const bookingsRecus = await db.query.bookings.findMany({
        where: inArray(schema.bookings.listingId, mesListings.map((l) => l.id)),
      });
      if (bookingsRecus.some((b) => EN_COURS.includes(b.statut)))
        fail("Suppression impossible : une location est en cours sur l'un de vos véhicules.");
      // Dépublier toutes les annonces
      await db
        .update(schema.listings)
        .set({ statut: "archivee" })
        .where(inArray(schema.listings.id, mesListings.map((l) => l.id)));
    }
  }

  // Anonymisation + soft delete (contrats/paiements conservés pour obligations légales)
  await db
    .update(schema.users)
    .set({
      email: `supprime-${user.id.slice(0, 8)}@anonyme.forvtc.fr`,
      prenom: "Compte",
      nom: "Supprimé",
      telephone: null,
      passwordHash: "supprime",
      suspendu: true,
      deletedAt: new Date(),
    })
    .where(eq(schema.users.id, user.id));

  await audit(user.id, "rgpd.compte_supprime", { type: "user", id: user.id }, { note: "soft delete + anonymisation ; contrats/paiements conservés (obligation légale)" });
  destroySession();
  redirect(`/?ok=${encodeURIComponent("Votre compte a été supprimé et vos données personnelles anonymisées.")}`);
}
