import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { notify } from "./notify";

type Criteres = { ville: string | null; budgetMoisCents: number | null; energie: string | null };

/**
 * MATCHING D'ALERTES — appelé à chaque publication réelle d'annonce.
 * Compare les critères sauvegardés aux données réelles de l'annonce ; notifie si correspondance.
 */
export async function notifierAlertesCorrespondantes(listingId: string): Promise<number> {
  const db = await getDb();
  const listing = await db.query.listings.findFirst({ where: eq(schema.listings.id, listingId) });
  if (!listing || listing.statut !== "publiee") return 0;
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;

  const alertes = await db.query.savedSearches.findMany({});
  let notifies = 0;
  for (const a of alertes) {
    const c = a.criteres as Criteres;
    if (c.ville) {
      const v = c.ville.toLowerCase();
      const matchVille =
        vehicle.ville.toLowerCase().includes(v) || vehicle.codePostal.startsWith(v.slice(0, 2));
      if (!matchVille) continue;
    }
    if (c.budgetMoisCents !== null) {
      if (listing.prixMoisCents === null || listing.prixMoisCents > c.budgetMoisCents) continue;
    }
    if (c.energie && vehicle.energie !== c.energie) continue;

    await notify(
      a.userId,
      "alerte",
      "Une nouvelle annonce correspond à votre alerte",
      `« ${listing.titre} » — ${vehicle.marque} ${vehicle.modele}, ${vehicle.ville}${listing.prixMoisCents !== null ? `, ${(listing.prixMoisCents / 100).toFixed(0)} €/mois` : ""}.`
    );
    notifies++;
  }
  return notifies;
}
