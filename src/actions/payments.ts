"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getStripe, stripeActif, baseUrl } from "@/lib/stripe";
import { commissionPct, lienOnboarding, loueurPeutEncaisser, rafraichirStatutConnect } from "@/lib/connect";
import { transitionBooking } from "@/lib/booking";

function err(path: string, m: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}erreur=${encodeURIComponent(m)}`);
}

const OWNER_ROLES = ["loueur", "entreprise", "gestionnaire_flotte"];

/* ------------------- Loueur : onboarding Stripe Connect ------------------- */

export async function demarrerOnboardingConnect(): Promise<void> {
  const user = await requireUser(OWNER_ROLES);
  if (!stripeActif()) err("/dashboard/paiements", "Stripe n'est pas configuré sur cette instance.");
  let url: string;
  try {
    url = await lienOnboarding(user.id, user.email);
  } catch (e) {
    console.error("[connect onboarding]", e);
    err("/dashboard/paiements", "Impossible de créer le lien d'activation Stripe. Réessayez.");
  }
  await audit(user.id, "connect.onboarding_demarre", { type: "user", id: user.id });
  redirect(url);
}

export async function actualiserStatutConnect(): Promise<void> {
  const user = await requireUser(OWNER_ROLES);
  const res = await rafraichirStatutConnect(user.id);
  if (!res) err("/dashboard/paiements", "Aucun compte Stripe à actualiser.");
  await audit(user.id, "connect.statut_actualise", { type: "user", id: user.id }, { chargesEnabled: res.chargesEnabled });
  redirect(
    `/dashboard/paiements?ok=${encodeURIComponent(
      res.chargesEnabled ? "Compte Stripe actif : vous pouvez encaisser les loyers." : "Compte Stripe créé mais pas encore activé — finalisez l'activation chez Stripe."
    )}`
  );
}

/* ---------------------- Chauffeur : payer la location ---------------------- */

const payerSchema = z.object({ bookingId: z.string().uuid() });

/**
 * Paiement du loyer via Stripe Checkout en « destination charge » :
 * le loueur reçoit loyer − commission, la caution n'est PAS dans ce flux.
 * Aucun statut ne change sans le webhook signé.
 */
export async function payerLocation(formData: FormData): Promise<void> {
  const user = await requireUser(["chauffeur"]);
  const parsed = payerSchema.safeParse(Object.fromEntries(formData.entries()));
  const back = "/dashboard/locations";
  if (!parsed.success) err(back, "Requête invalide.");
  if (!stripeActif()) err(back, "Le paiement en ligne n'est pas activé sur cette instance.");

  const db = await getDb();
  const booking = await db.query.bookings.findFirst({
    where: and(eq(schema.bookings.id, parsed.data.bookingId), eq(schema.bookings.driverId, user.id)),
  });
  if (!booking) err(back, "Réservation introuvable.");
  if (!["accepted", "payment_pending"].includes(booking.statut))
    err(back, "Cette réservation n'est pas en attente de paiement.");
  if (!booking.prixTotalCents || booking.prixTotalCents < 100)
    err(back, "Montant de la location invalide — contactez le support.");

  const listing = (await db.query.listings.findFirst({ where: eq(schema.listings.id, booking.listingId) }))!;
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;
  const ownerProfile = await db.query.ownerProfiles.findFirst({ where: eq(schema.ownerProfiles.userId, vehicle.ownerId) });
  if (!ownerProfile?.stripeAccountId || !ownerProfile.stripeChargesEnabled)
    err(back, "Le loueur n'a pas encore activé l'encaissement — il en a été informé. Réessayez plus tard.");

  const pct = await commissionPct();
  const commission = Math.round((booking.prixTotalCents * pct) / 100);

  // Enregistrement idempotent du paiement (1 seul paiement de loyer par réservation)
  let paymentId: string;
  const idem = `location-${booking.id}`;
  const existant = await db.query.payments.findFirst({ where: eq(schema.payments.idempotencyKey, idem) });
  if (existant) {
    if (existant.statut === "reussi") err(back, "Cette location est déjà payée.");
    paymentId = existant.id;
  } else {
    const [p] = await db
      .insert(schema.payments)
      .values({
        bookingId: booking.id,
        type: "paiement",
        montantCents: booking.prixTotalCents,
        idempotencyKey: idem,
        statut: "cree",
      })
      .returning();
    paymentId = p.id;
  }

  let sessionUrl: string;
  try {
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: `Location — ${listing.titre}`,
                description: `Du ${booking.dateDebut.toLocaleDateString("fr-FR")} au ${booking.dateFin.toLocaleDateString("fr-FR")} (caution gérée séparément)`,
              },
              unit_amount: booking.prixTotalCents,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: commission,
          transfer_data: { destination: ownerProfile.stripeAccountId },
          metadata: { bookingId: booking.id, paymentId },
        },
        metadata: { paiementLocationId: paymentId, bookingId: booking.id },
        success_url: `${baseUrl()}/dashboard/locations?ok=${encodeURIComponent("Paiement confirmé — il sera validé définitivement dans quelques secondes.")}`,
        cancel_url: `${baseUrl()}/dashboard/locations?erreur=${encodeURIComponent("Paiement abandonné. Vous pouvez réessayer.")}`,
      },
      { idempotencyKey: `checkout-${paymentId}` }
    );
    sessionUrl = session.url!;
  } catch (e) {
    console.error("[payerLocation] checkout", e);
    err(back, "Impossible de créer la session de paiement. Réessayez.");
  }

  if (booking.statut === "accepted") {
    const t = await transitionBooking(booking.id, "payment_pending", user.id);
    if (!t.ok) err(back, t.erreur);
  }
  await db.update(schema.payments).set({ statut: "en_attente" }).where(eq(schema.payments.id, paymentId));
  await audit(user.id, "paiement.checkout_cree", { type: "payment", id: paymentId }, { bookingId: booking.id, montantCents: booking.prixTotalCents, commissionCents: commission, pct });
  redirect(sessionUrl);
}

/* ------------------ Chauffeur : empreinte de caution ------------------ */

/**
 * Caution = EMPREINTE bancaire (carte enregistrée via Checkout mode "setup").
 * Aucun débit : la carte ne peut être débitée que sur décision d'arbitrage
 * d'un litige, à hauteur de la retenue décidée. Jamais un revenu plateforme.
 */
export async function enregistrerCaution(formData: FormData): Promise<void> {
  const user = await requireUser(["chauffeur"]);
  const parsed = payerSchema.safeParse(Object.fromEntries(formData.entries()));
  const back = "/dashboard/locations";
  if (!parsed.success) err(back, "Requête invalide.");
  if (!stripeActif()) err(back, "Le paiement en ligne n'est pas activé sur cette instance.");

  const db = await getDb();
  const booking = await db.query.bookings.findFirst({
    where: and(eq(schema.bookings.id, parsed.data.bookingId), eq(schema.bookings.driverId, user.id)),
  });
  if (!booking) err(back, "Réservation introuvable.");
  if (!booking.cautionCents || booking.cautionCents <= 0) err(back, "Aucune caution n'est prévue pour cette location.");
  if (booking.cautionPaymentMethodId) err(back, "L'empreinte de caution est déjà enregistrée.");
  if (!["paid", "contract_pending", "signed"].includes(booking.statut))
    err(back, "L'empreinte de caution s'enregistre après le paiement de la location.");

  let sessionUrl: string;
  try {
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "setup",
        payment_method_types: ["card"],
        customer_creation: "always",
        metadata: { cautionBookingId: booking.id },
        success_url: `${baseUrl()}/dashboard/locations?ok=${encodeURIComponent("Empreinte de caution enregistrée — aucun débit n'a été effectué.")}`,
        cancel_url: `${baseUrl()}/dashboard/locations?erreur=${encodeURIComponent("Enregistrement de la caution abandonné.")}`,
      },
      { idempotencyKey: `caution-${booking.id}-${booking.cautionSetupIntentId ?? "1"}` }
    );
    sessionUrl = session.url!;
  } catch (e) {
    console.error("[enregistrerCaution] checkout", e);
    err(back, "Impossible de créer la session d'empreinte. Réessayez.");
  }
  await audit(user.id, "caution.empreinte_demandee", { type: "booking", id: booking.id }, { cautionCents: booking.cautionCents });
  redirect(sessionUrl);
}
