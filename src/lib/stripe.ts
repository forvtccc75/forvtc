import Stripe from "stripe";

/**
 * Client Stripe — instancié uniquement si STRIPE_SECRET_KEY est défini.
 * Sans clé : les fonctionnalités payantes sont affichées comme « non activées »
 * (jamais simulées).
 */
let client: Stripe | null = null;

export function stripeActif(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe non configuré (STRIPE_SECRET_KEY manquant).");
  if (!client) client = new Stripe(key); // version API par défaut du SDK installé
  return client;
}

/** URL publique de l'app (Vercel : à définir explicitement). */
export function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    "http://localhost:3000"
  );
}
