/** Dev only : ajoute un booking ACTIF (dates passées réelles du cycle de test) pour tester les litiges. */
import { getDb, schema } from "../src/db";
import { eq } from "drizzle-orm";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("dev only");
  const db = await getDb();
  const listing = await db.query.listings.findFirst({ where: eq(schema.listings.statut, "publiee") });
  const driver = await db.query.users.findFirst({ where: eq(schema.users.email, "chauffeur.test@example.com") });
  if (!listing || !driver) throw new Error("seed de base manquant");
  const dateDebut = new Date("2026-07-01");
  const dateFin = new Date("2026-08-31");
  const [b] = await db.insert(schema.bookings).values({
    listingId: listing.id, driverId: driver.id, dateDebut, dateFin,
    statut: "active", prixTotalCents: 230000, cautionCents: 150000,
  }).returning();
  await db.insert(schema.availability).values({ vehicleId: listing.vehicleId, dateDebut, dateFin, statut: "reserve" });
  console.log(JSON.stringify({ activeBookingId: b.id, listingId: listing.id }));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
