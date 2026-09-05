import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getStripe, stripeActif, baseUrl } from "@/lib/stripe";

/**
 * Stripe Connect (comptes Express) — encaissement des loyers.
 * Modèle « destination charge » : le chauffeur paie la plateforme, Stripe
 * reverse automatiquement au loueur son loyer moins la commission
 * (application_fee). La caution n'est JAMAIS dans ce flux (empreinte séparée).
 */

/** Commission plateforme lue depuis les règles administrables. */
export async function commissionPct(): Promise<number> {
  const db = await getDb();
  const regle = await db.query.platformRules.findFirst({
    where: eq(schema.platformRules.code, "COMMISSION_PLATEFORME_PCT"),
  });
  if (!regle || !regle.actif) return 10;
  const pct = Number((regle.valeur as { pct?: number }).pct);
  return Number.isFinite(pct) && pct >= 0 && pct <= 50 ? pct : 10;
}

/** Le loueur peut-il encaisser ? (compte Connect actif, charges activées) */
export async function loueurPeutEncaisser(ownerUserId: string): Promise<boolean> {
  if (!stripeActif()) return false;
  const db = await getDb();
  const profil = await db.query.ownerProfiles.findFirst({ where: eq(schema.ownerProfiles.userId, ownerUserId) });
  return Boolean(profil?.stripeAccountId && profil.stripeChargesEnabled);
}

/** Crée (ou réutilise) le compte Express du loueur et retourne un lien d'onboarding. */
export async function lienOnboarding(ownerUserId: string, email: string): Promise<string> {
  const stripe = getStripe();
  const db = await getDb();
  const profil = await db.query.ownerProfiles.findFirst({ where: eq(schema.ownerProfiles.userId, ownerUserId) });
  if (!profil) throw new Error("Profil loueur introuvable.");

  let accountId = profil.stripeAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "FR",
      email,
      capabilities: { transfers: { requested: true } },
      metadata: { forvtcUserId: ownerUserId },
    });
    accountId = account.id;
    await db.update(schema.ownerProfiles).set({ stripeAccountId: accountId }).where(eq(schema.ownerProfiles.userId, ownerUserId));
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl()}/dashboard/paiements?retour=refresh`,
    return_url: `${baseUrl()}/dashboard/paiements?retour=stripe`,
    type: "account_onboarding",
  });
  return link.url;
}

/** Resynchronise le statut du compte Connect depuis Stripe (source de vérité). */
export async function rafraichirStatutConnect(ownerUserId: string): Promise<{ chargesEnabled: boolean } | null> {
  if (!stripeActif()) return null;
  const db = await getDb();
  const profil = await db.query.ownerProfiles.findFirst({ where: eq(schema.ownerProfiles.userId, ownerUserId) });
  if (!profil?.stripeAccountId) return null;
  const account = await getStripe().accounts.retrieve(profil.stripeAccountId);
  const chargesEnabled = Boolean(account.charges_enabled);
  await db
    .update(schema.ownerProfiles)
    .set({ stripeChargesEnabled: chargesEnabled })
    .where(eq(schema.ownerProfiles.userId, ownerUserId));
  return { chargesEnabled };
}
