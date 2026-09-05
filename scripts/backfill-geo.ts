/** Backfill lat/lng (niveau commune, BAN) des véhicules sans coordonnées. */
import { isNull, or, eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { geocoderVille } from "../src/lib/geocode";

async function main() {
  const db = await getDb();
  const vehs = await db.query.vehicles.findMany({ where: or(isNull(schema.vehicles.lat), isNull(schema.vehicles.lng)) });
  let n = 0;
  for (const v of vehs) {
    const p = await geocoderVille(v.ville, v.codePostal);
    if (p) {
      await db.update(schema.vehicles).set({ lat: p.lat, lng: p.lng }).where(eq(schema.vehicles.id, v.id));
      n++;
      console.log(`${v.marque} ${v.modele} (${v.ville} ${v.codePostal}) → ${p.lat},${p.lng}`);
    }
  }
  console.log(`geocodés: ${n}/${vehs.length}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
