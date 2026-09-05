import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { getDb, schema } from "@/db";
import type { Db } from "@/db";
import { getStripe, stripeActif } from "@/lib/stripe";
import { appliquerBoost } from "@/lib/boosts";
import { notify } from "@/lib/notify";
import { genererRecu } from "@/lib/receipts";
import { dateFr, euros } from "@/lib/format";

/** Loyer payé et confirmé par Stripe : paiement validé, machine à états avancée, reçu émis. */
async function traiterPaiementLocation(db: Db, paymentId: string, session: Stripe.Checkout.Session, eventId: string) {
  const payment = await db.query.payments.findFirst({ where: eq(schema.payments.id, paymentId) });
  if (!payment || payment.statut === "reussi") return; // déjà traité

  const booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, payment.bookingId) });
  if (!booking) return;
  const listing = (await db.query.listings.findFirst({ where: eq(schema.listings.id, booking.listingId) }))!;
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;

  await db
    .update(schema.payments)
    .set({ statut: "reussi", providerRef: typeof session.payment_intent === "string" ? session.payment_intent : null })
    .where(eq(schema.payments.id, payment.id));

  // Machine à états : payment_pending → paid → contract_pending
  if (["accepted", "payment_pending"].includes(booking.statut)) {
    await db.update(schema.bookings).set({ statut: "contract_pending", updatedAt: new Date() }).where(eq(schema.bookings.id, booking.id));
  }

  await db.insert(schema.auditLogs).values({
    acteurId: booking.driverId,
    action: "paiement.loyer_confirme",
    cibleType: "payment",
    cibleId: payment.id,
    details: { bookingId: booking.id, montantCents: payment.montantCents, stripeEvent: eventId },
  });

  // Reçu PDF pour le chauffeur
  try {
    const recu = await genererRecu({
      userId: booking.driverId,
      type: "location",
      montantCents: payment.montantCents,
      libelle: `Location — ${listing.titre}`,
      details: [
        `Période : du ${dateFr(booking.dateDebut)} au ${dateFr(booking.dateFin)}`,
        `Loyer total : ${euros(payment.montantCents)}`,
        booking.cautionCents ? `Caution prévue : ${euros(booking.cautionCents)} (empreinte séparée, jamais débitée sans arbitrage)` : "Aucune caution prévue.",
      ],
      bookingId: booking.id,
    });
    await db.insert(schema.auditLogs).values({
      acteurId: booking.driverId,
      action: "recu.emis",
      cibleType: "booking",
      cibleId: booking.id,
      details: { numero: recu.numero },
    });
  } catch (e) {
    console.error("[webhook] reçu non généré (paiement OK)", e);
  }

  await notify(booking.driverId, "paiement", "Paiement confirmé ✔", `Votre loyer pour « ${listing.titre} » est payé. Prochaine étape : le contrat (votre reçu est disponible dans Mes locations).`);
  await notify(vehicle.ownerId, "paiement", "Location payée", `Le chauffeur a payé la location « ${listing.titre} ». Le loyer (moins la commission plateforme) vous sera reversé par Stripe. Générez le contrat.`);
}

/** Empreinte de caution enregistrée (mode setup) : carte sauvegardée, AUCUN débit. */
async function traiterEmpreinteCaution(db: Db, bookingId: string, session: Stripe.Checkout.Session, eventId: string) {
  const booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, bookingId) });
  if (!booking || booking.cautionPaymentMethodId) return; // déjà traité

  const setupIntentId = typeof session.setup_intent === "string" ? session.setup_intent : null;
  let paymentMethodId: string | null = null;
  if (setupIntentId) {
    const si = await getStripe().setupIntents.retrieve(setupIntentId);
    paymentMethodId = typeof si.payment_method === "string" ? si.payment_method : null;
  }
  if (!paymentMethodId) return;

  await db
    .update(schema.bookings)
    .set({
      cautionSetupIntentId: setupIntentId,
      cautionPaymentMethodId: paymentMethodId,
      cautionCustomerId: typeof session.customer === "string" ? session.customer : null,
    })
    .where(eq(schema.bookings.id, booking.id));

  await db.insert(schema.auditLogs).values({
    acteurId: booking.driverId,
    action: "caution.empreinte_enregistree",
    cibleType: "booking",
    cibleId: booking.id,
    details: { cautionCents: booking.cautionCents, stripeEvent: eventId, note: "empreinte seule — aucun débit" },
  });
  await notify(booking.driverId, "caution", "Empreinte de caution enregistrée", "Votre carte est enregistrée en garantie. Aucun débit n'a été effectué : la caution ne peut être prélevée que sur décision d'arbitrage d'un litige.");
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook Stripe — SEUL point d'activation des paiements.
 * - Signature vérifiée (STRIPE_WEBHOOK_SECRET) : requête non signée = rejetée.
 * - Idempotent : chaque event Stripe est enregistré (table stripe_events) et
 *   traité une seule fois, même si Stripe le renvoie.
 */
export async function POST(req: NextRequest) {
  if (!stripeActif() || !process.env.STRIPE_WEBHOOK_SECRET)
    return NextResponse.json({ error: "Stripe non configuré" }, { status: 503 });

  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Signature absente" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  const db = await getDb();

  // Idempotence : premier arrivé gagne, les relivraisons sont ignorées
  try {
    await db.insert(schema.stripeEvents).values({ id: event.id, type: event.type });
  } catch {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const boostId = session.metadata?.boostId;
      const paiementLocationId = session.metadata?.paiementLocationId;
      const cautionBookingId = session.metadata?.cautionBookingId;

      /* ----- Paiement du loyer d'une location ----- */
      if (paiementLocationId && session.payment_status === "paid") {
        await traiterPaiementLocation(db, paiementLocationId, session, event.id);
      }

      /* ----- Empreinte de caution (mode setup — AUCUN débit) ----- */
      if (cautionBookingId && session.mode === "setup") {
        await traiterEmpreinteCaution(db, cautionBookingId, session, event.id);
      }

      if (boostId && session.payment_status === "paid") {
        await db
          .update(schema.listingBoosts)
          .set({ stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null })
          .where(eq(schema.listingBoosts.id, boostId));
        await appliquerBoost(boostId);

        const boost = await db.query.listingBoosts.findFirst({ where: eq(schema.listingBoosts.id, boostId) });
        if (boost) {
          await db.insert(schema.auditLogs).values({
            acteurId: boost.ownerId,
            action: "boost.paye_et_active",
            cibleType: "listing_boost",
            cibleId: boost.id,
            details: { type: boost.type, prixCents: boost.prixCents, stripeEvent: event.id },
          });
          await notify(
            boost.ownerId,
            "boost",
            "Option de visibilité activée",
            `Votre option a été activée après confirmation du paiement.`
          );
          // Reçu PDF du boost
          try {
            await genererRecu({
              userId: boost.ownerId,
              type: "boost",
              montantCents: boost.prixCents,
              libelle: `Option de visibilité — ${boost.type.replace(/_/g, " ")}`,
              details: [`Annonce concernée : ${boost.listingId}`, `Activation : ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}`],
              boostId: boost.id,
            });
          } catch (e) {
            console.error("[webhook] reçu boost non généré (paiement OK)", e);
          }
        }
      }
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const boostId = session.metadata?.boostId;
      if (boostId) {
        const boost = await db.query.listingBoosts.findFirst({ where: eq(schema.listingBoosts.id, boostId) });
        if (boost && boost.statut === "attente_paiement")
          await db.update(schema.listingBoosts).set({ statut: "annule" }).where(eq(schema.listingBoosts.id, boostId));
      }
      const paiementLocationId = session.metadata?.paiementLocationId;
      if (paiementLocationId) {
        const p = await db.query.payments.findFirst({ where: eq(schema.payments.id, paiementLocationId) });
        if (p && p.statut === "en_attente")
          await db.update(schema.payments).set({ statut: "annule" }).where(eq(schema.payments.id, p.id));
      }
    } else if (event.type === "account.updated") {
      /* ----- Statut Connect du loueur (source de vérité : Stripe) ----- */
      const account = event.data.object as Stripe.Account;
      const profil = await db.query.ownerProfiles.findFirst({
        where: eq(schema.ownerProfiles.stripeAccountId, account.id),
      });
      if (profil) {
        await db
          .update(schema.ownerProfiles)
          .set({ stripeChargesEnabled: Boolean(account.charges_enabled) })
          .where(eq(schema.ownerProfiles.userId, profil.userId));
      }
    }
  } catch (e) {
    // Erreur de traitement : on retire l'event pour que Stripe relivre
    await db.delete(schema.stripeEvents).where(eq(schema.stripeEvents.id, event.id)).catch(() => {});
    console.error("[stripe webhook] traitement échoué", e);
    return NextResponse.json({ error: "Traitement échoué" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
