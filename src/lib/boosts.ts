import { and, eq, gt, isNotNull, lte, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * Catalogue des boosts (type Leboncoin). Prix en centimes, TTC.
 * Modifiable ici ; à terme administrable via platform_rules.
 * Un boost n'est activé QUE par le webhook Stripe après paiement réel.
 */
export const BOOSTS: Record<
  string,
  { code: "remontee" | "urgent" | "a_la_une"; nom: string; description: string; prixCents: number; dureeJours: number | null }
> = {
  remontee: {
    code: "remontee",
    nom: "Remontée en tête de liste",
    description:
      "Votre annonce repasse immédiatement en tête des résultats de recherche, comme si elle venait d'être publiée. Effet ponctuel.",
    prixCents: 499,
    dureeJours: null, // effet instantané (boostedAt = now)
  },
  urgent: {
    code: "urgent",
    nom: "Badge Urgent",
    description:
      "Un badge « Urgent » orange s'affiche sur votre annonce dans les résultats et sur sa page pendant 7 jours.",
    prixCents: 999,
    dureeJours: 7,
  },
  a_la_une: {
    code: "a_la_une",
    nom: "À la une",
    description:
      "Votre annonce apparaît dans le bloc « À la une » en haut de la recherche et des pages ville pendant 7 jours, en plus de son classement normal.",
    prixCents: 1999,
    dureeJours: 7,
  },
};

/** Applique l'effet d'un boost payé sur l'annonce. Appelé UNIQUEMENT par le webhook. */
export async function appliquerBoost(boostId: string): Promise<void> {
  const db = await getDb();
  const boost = await db.query.listingBoosts.findFirst({ where: eq(schema.listingBoosts.id, boostId) });
  if (!boost || boost.statut !== "attente_paiement") return; // déjà traité ou inexistant
  const def = BOOSTS[boost.type];
  const now = new Date();
  const fin = def.dureeJours ? new Date(now.getTime() + def.dureeJours * 86400_000) : null;

  await db
    .update(schema.listingBoosts)
    .set({ statut: "actif", dateDebut: now, dateFin: fin })
    .where(eq(schema.listingBoosts.id, boostId));

  const patch: Record<string, Date | null> = {};
  if (boost.type === "remontee") patch.boostedAt = now;
  if (boost.type === "urgent") patch.urgentJusqu = fin;
  if (boost.type === "a_la_une") patch.uneJusqu = fin;
  await db.update(schema.listings).set(patch).where(eq(schema.listings.id, boost.listingId));
}

/** Expiration paresseuse : marque expirés les boosts datés dépassés (idempotent). */
export async function expirerBoosts(): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db
    .update(schema.listingBoosts)
    .set({ statut: "expire" })
    .where(
      and(
        eq(schema.listingBoosts.statut, "actif"),
        isNotNull(schema.listingBoosts.dateFin),
        lte(schema.listingBoosts.dateFin, now)
      )
    );
}

/** Tri de recherche : plus récent entre publication et dernière remontée, en premier. */
export const ordreRecherche = sql`GREATEST(COALESCE(${schema.listings.boostedAt}, 'epoch'::timestamptz), COALESCE(${schema.listings.publishedAt}, 'epoch'::timestamptz)) DESC`;

/** Condition « À la une » active. */
export function estALaUne(l: { uneJusqu: Date | null }): boolean {
  return Boolean(l.uneJusqu && l.uneJusqu > new Date());
}

/** Condition badge Urgent actif. */
export function estUrgent(l: { urgentJusqu: Date | null }): boolean {
  return Boolean(l.urgentJusqu && l.urgentJusqu > new Date());
}

/** Annonces « À la une » actives (pour la recherche et les pages ville). */
export async function annoncesALaUne(limit = 4) {
  const db = await getDb();
  return db
    .select({ listing: schema.listings, vehicle: schema.vehicles })
    .from(schema.listings)
    .innerJoin(schema.vehicles, eq(schema.listings.vehicleId, schema.vehicles.id))
    .where(and(eq(schema.listings.statut, "publiee"), gt(schema.listings.uneJusqu, new Date())))
    .limit(limit);
}
