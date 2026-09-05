/**
 * Point d'échange unique de la couche données.
 * - Production / Vercel : DATABASE_URL défini → PostgreSQL managé (node-postgres),
 *   migrations appliquées au démarrage (verrou advisory anti-concurrence).
 * - Dev sandbox : pas de DATABASE_URL → PGlite (PostgreSQL embarqué, fichiers ./pgdata).
 * Le schéma (dialecte PostgreSQL) est strictement identique dans les deux cas.
 */
import { sql } from "drizzle-orm";
import path from "path";
import * as schema from "./schema";

// Type structurel commun aux deux drivers (mêmes query/insert/update/execute)
import type { drizzle as drizzlePgliteT } from "drizzle-orm/pglite";
export type Db = ReturnType<typeof drizzlePgliteT<typeof schema>>;

const globalForDb = globalThis as unknown as { __forvtcDb?: Promise<Db> };

/** Règles réglementaires sourcées (configuration admin, PAS des données fictives).
 *  À re-vérifier sur les textes officiels avant production. */
const RULE_SEED = [
  { code: "VEH_PUISSANCE_MIN_KW", categorie: "VEHICLE", libelle: "Puissance nette minimale du véhicule VTC", valeur: { min: 84, unite: "kW" }, sourceUrl: "https://bvtc.fr/bible-du-vtc/actualites-vtc/obligation-vtc/" },
  { code: "VEH_PORTES_MIN", categorie: "VEHICLE", libelle: "Nombre minimal de portes", valeur: { min: 4 }, sourceUrl: "https://bvtc.fr/bible-du-vtc/actualites-vtc/obligation-vtc/" },
  { code: "VEH_PLACES_MIN", categorie: "VEHICLE", libelle: "Nombre minimal de places (conducteur compris)", valeur: { min: 4 }, sourceUrl: "https://bvtc.fr/bible-du-vtc/actualites-vtc/obligation-vtc/" },
  { code: "VEH_PLACES_MAX", categorie: "VEHICLE", libelle: "Nombre maximal de places (conducteur compris)", valeur: { max: 9 }, sourceUrl: "https://bvtc.fr/bible-du-vtc/actualites-vtc/obligation-vtc/" },
  { code: "VEH_LONGUEUR_MIN_MM", categorie: "VEHICLE", libelle: "Longueur minimale", valeur: { min: 4500, unite: "mm" }, sourceUrl: "https://droovi.com/fr/blog/reglementation-vtc-2026-carte-vehicule-et-registre/" },
  { code: "VEH_LARGEUR_MIN_MM", categorie: "VEHICLE", libelle: "Largeur minimale", valeur: { min: 1700, unite: "mm" }, sourceUrl: "https://droovi.com/fr/blog/reglementation-vtc-2026-carte-vehicule-et-registre/" },
  { code: "VEH_AGE_MAX_THERMIQUE", categorie: "VEHICLE", libelle: "Ancienneté maximale (thermique) — pas de limite électrique/hybride", valeur: { maxAnnees: 7, exemptions: ["electrique", "hybride", "hybride_rechargeable"] }, sourceUrl: "https://droovi.com/fr/blog/reglementation-vtc-2026-carte-vehicule-et-registre/" },
  { code: "VEH_CT_ANNUEL", categorie: "DOCUMENT", libelle: "Contrôle technique annuel obligatoire", valeur: { frequenceMois: 12 }, sourceUrl: "https://bvtc.fr/bible-du-vtc/actualites-vtc/obligation-vtc/" },
  { code: "ASSURANCE_TITRE_ONEREUX", categorie: "INSURANCE", libelle: "L'assurance doit couvrir explicitement le transport de personnes à titre onéreux — jamais déduit d'une RC standard", valeur: { obligatoire: true }, sourceUrl: "https://ajpassurance.com/blog/assurance-vtc-location-vehicule" },
  { code: "REVTC_LOCATION_6_MOIS", categorie: "CONTRACT", libelle: "Véhicule loué : contrat > 6 mois exigé au REVTC, sinon garantie financière 1500 €/véhicule", valeur: { dureeMinMois: 6, garantieCents: 150000 }, sourceUrl: "https://www.vtcprotect.com/blog/devenir-chauffeur-vtc/revtc-registre-exploitants-vtc" },
  { code: "DRIVER_CARTE_VTC", categorie: "DRIVER", libelle: "Carte professionnelle VTC en cours de validité (5 ans)", valeur: { validiteAnnees: 5 }, sourceUrl: "https://bvtc.fr/bible-du-vtc/actualites-vtc/obligation-vtc/" },
  // Paramètre BUSINESS (pas une règle légale) : commission plateforme prélevée sur le loyer versé au loueur.
  { code: "COMMISSION_PLATEFORME_PCT", categorie: "PLATFORM", libelle: "Commission plateforme (% du loyer, prélevée côté loueur au versement)", valeur: { pct: 10 }, sourceUrl: null as unknown as string },
];

async function seedRules(db: Db) {
  for (const r of RULE_SEED) {
    await db.execute(sql`
      INSERT INTO platform_rules (id, code, categorie, libelle, valeur, source_url, actif)
      VALUES (${crypto.randomUUID()}, ${r.code}, ${r.categorie}, ${r.libelle}, ${JSON.stringify(r.valeur)}::jsonb, ${r.sourceUrl}, true)
      ON CONFLICT (code) DO NOTHING
    `);
  }
}

/* ------------------- Production : PostgreSQL managé ------------------- */

async function initPostgres(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");

  const pool = new Pool({
    connectionString: url,
    max: 3, // serverless : pool minimal par instance
    ssl: url.includes("sslmode=disable") ? undefined : { rejectUnauthorized: false },
  });
  const db = drizzle(pool, { schema }) as unknown as Db;

  // Verrou advisory : une seule instance applique les migrations à la fois
  const lock = await pool.connect();
  try {
    await lock.query("SELECT pg_advisory_lock(714289001)");
    await migrate(drizzle(pool, { schema }), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    await seedRules(db);
  } finally {
    await lock.query("SELECT pg_advisory_unlock(714289001)").catch(() => {});
    lock.release();
  }
  return db;
}

/* ---------------------- Dev : PGlite embarqué ---------------------- */

async function initPglite(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  // FORVTC_PGDATA : datadir alternatif (tests d'intégration isolés du dev)
  const dataDir = process.env.FORVTC_PGDATA || path.join(process.cwd(), "pgdata");
  const open = async () => {
    const client = new PGlite(dataDir);
    const db = drizzle(client, { schema });
    await db.execute(sql`SELECT 1`); // sonde datadir
    return db;
  };
  let db: Db;
  try {
    db = await open();
  } catch (e) {
    // DEV UNIQUEMENT : datadir corrompu (snapshot sandbox incomplet) → reset propre
    console.error("[db] datadir PGlite illisible — réinitialisation (dev uniquement)", e);
    const fs = await import("fs/promises");
    await fs.rm(dataDir, { recursive: true, force: true });
    db = await open();
  }
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await seedRules(db);
  return db;
}

async function init(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (!url && process.env.VERCEL) {
    // Sur Vercel, PGlite serait éphémère (données perdues à chaque requête) :
    // on refuse explicitement plutôt que de perdre des données en silence.
    throw new Error(
      "DATABASE_URL manquant : connectez une base PostgreSQL (Neon) au projet Vercel — voir docs/DEPLOIEMENT.md §2."
    );
  }
  return url ? initPostgres(url) : initPglite();
}

export function getDb(): Promise<Db> {
  if (!globalForDb.__forvtcDb) globalForDb.__forvtcDb = init();
  return globalForDb.__forvtcDb;
}

export { schema };
