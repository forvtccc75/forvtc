"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { BOOSTS } from "@/lib/boosts";
import { getStripe, stripeActif, baseUrl } from "@/lib/stripe";

function err(path: string, m: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}erreur=${encodeURIComponent(m)}`);
}

const achatSchema = z.object({
  listingId: z.string().uuid(),
  type: z.enum(["remontee", "urgent", "a_la_une"]),
});

/**
 * Achat d'un boost : crée une session Stripe Checkout et redirige vers la page
 * de paiement Stripe. Le boost reste « attente_paiement » tant que le webhook
 * signé n'a pas confirmé le paiement — AUCUNE activation sans paiement réel.
 */
export async function acheterBoost(formData: FormData): Promise<void> {
  const user = await requireUser(["loueur", "entreprise", "gestionnaire_flotte"]);
  const parsed = achatSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) err("/dashboard/vehicules", "Requête invalide.");
  const { listingId, type } = parsed.data;
  const back = `/dashboard/annonces/${listingId}/booster`;

  if (!stripeActif())
    err(back, "Le paiement n'est pas encore activé sur la plateforme. Les options de visibilité seront disponibles dès son activation.");

  const db = await getDb();
  const listing = await db.query.listings.findFirst({ where: eq(schema.listings.id, listingId) });
  if (!listing) err("/dashboard/vehicules", "Annonce introuvable.");
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;
  if (vehicle.ownerId !== user.id) err("/dashboard/vehicules", "Cette annonce ne vous appartient pas.");
  if (listing.statut !== "publiee") err(back, "Seule une annonce publiée peut être boostée.");

  const def = BOOSTS[type];

  // Garde anti-doublon : pas de deuxième boost identique déjà actif
  const existants = await db.query.listingBoosts.findMany({ where: eq(schema.listingBoosts.listingId, listingId) });
  const dejaActif = existants.some(
    (b) => b.type === type && b.statut === "actif" && (b.dateFin === null ? type !== "remontee" : b.dateFin > new Date())
  );
  if (dejaActif) err(back, `L'option « ${def.nom} » est déjà active sur cette annonce.`);

  const [boost] = await db
    .insert(schema.listingBoosts)
    .values({ listingId, ownerId: user.id, type, prixCents: def.prixCents })
    .returning();

  const stripe = getStripe();
  let sessionUrl: string;
  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              unit_amount: def.prixCents,
              product_data: {
                name: `FORVTC — ${def.nom}`,
                description: `Annonce : ${listing.titre}`,
              },
            },
          },
        ],
        metadata: { boostId: boost.id, listingId, type, ownerId: user.id },
        customer_email: user.email,
        success_url: `${baseUrl()}/dashboard/annonces/${listingId}/booster?paiement=succes`,
        cancel_url: `${baseUrl()}/dashboard/annonces/${listingId}/booster?paiement=annule`,
      },
      { idempotencyKey: `boost-${boost.id}` }
    );
    if (!session.url) throw new Error("Session sans URL");
    sessionUrl = session.url;
    await db.update(schema.listingBoosts).set({ stripeSessionId: session.id }).where(eq(schema.listingBoosts.id, boost.id));
  } catch (e) {
    await db.update(schema.listingBoosts).set({ statut: "annule" }).where(eq(schema.listingBoosts.id, boost.id));
    console.error("[stripe] création session échouée", e);
    err(back, "Le paiement n'a pas pu être initialisé. Réessayez dans quelques instants.");
  }

  await audit(user.id, "boost.checkout_cree", { type: "listing_boost", id: boost.id }, { listingId, type, prixCents: def.prixCents });
  redirect(sessionUrl);
}
