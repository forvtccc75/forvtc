import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { stripeActif } from "@/lib/stripe";
import { commissionPct } from "@/lib/connect";
import { demarrerOnboardingConnect, actualiserStatutConnect } from "@/actions/payments";
import { ErrorNote, OkNote } from "@/components/ui";
import { euros, dateFr } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Encaissement des loyers (Stripe Connect) — page loueur. */
export default async function Paiements({ searchParams }: { searchParams: { erreur?: string; ok?: string; retour?: string } }) {
  const user = await requireUser(["loueur", "entreprise", "gestionnaire_flotte"]);
  const db = await getDb();
  const profil = await db.query.ownerProfiles.findFirst({ where: eq(schema.ownerProfiles.userId, user.id) });
  const pct = await commissionPct();

  // Paiements reçus sur mes locations (réels uniquement)
  const mesVehicules = await db.query.vehicles.findMany({ where: eq(schema.vehicles.ownerId, user.id) });
  const vehIds = new Set(mesVehicules.map((v) => v.id));
  const listings = (await db.query.listings.findMany()).filter((l) => vehIds.has(l.vehicleId));
  const listingIds = new Set(listings.map((l) => l.id));
  const bookings = (await db.query.bookings.findMany()).filter((b) => listingIds.has(b.listingId));
  const bookingIds = new Set(bookings.map((b) => b.id));
  const paiements = (await db.query.payments.findMany()).filter(
    (p) => bookingIds.has(p.bookingId) && p.type === "paiement" && p.statut === "reussi"
  );

  const actif = Boolean(profil?.stripeAccountId && profil.stripeChargesEnabled);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/dashboard" className="text-sm text-brand-600">← Tableau de bord</Link>
      <h1 className="mt-2 text-2xl font-black">Encaissement des loyers</h1>
      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>

      <div className="card mt-5">
        <h2 className="font-bold">Compte de versement Stripe</h2>
        <p className="mt-1 text-sm text-slate-500">
          Les chauffeurs paient en ligne ; Stripe vous reverse le loyer moins la commission plateforme ({pct}%). La caution est une empreinte séparée — elle ne transite jamais par vos versements.
        </p>
        {!stripeActif() ? (
          <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
            Le paiement en ligne n&apos;est pas activé sur cette instance.
          </p>
        ) : actif ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
            ✔ Compte actif — vous pouvez encaisser les loyers.
          </p>
        ) : profil?.stripeAccountId ? (
          <div className="mt-3 space-y-3">
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Compte Stripe créé mais activation incomplète : finalisez-la (identité, IBAN) pour encaisser.
            </p>
            <div className="flex flex-wrap gap-2">
              <form action={demarrerOnboardingConnect}>
                <button className="btn-primary">Reprendre l&apos;activation</button>
              </form>
              <form action={actualiserStatutConnect}>
                <button className="btn-secondary">J&apos;ai terminé — actualiser</button>
              </form>
            </div>
          </div>
        ) : (
          <form action={demarrerOnboardingConnect} className="mt-3">
            <button className="btn-primary">ACTIVER L&apos;ENCAISSEMENT</button>
            <p className="mt-2 text-xs text-slate-400">
              Vous serez redirigé vers Stripe (identité + IBAN). Aucune donnée bancaire ne transite par FORVTC.
            </p>
          </form>
        )}
      </div>

      <div className="card mt-5">
        <h2 className="font-bold">Loyers encaissés</h2>
        {paiements.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Aucun paiement reçu pour l&apos;instant.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {paiements.map((p) => {
              const b = bookings.find((x) => x.id === p.bookingId)!;
              const l = listings.find((x) => x.id === b.listingId);
              const commission = Math.round((p.montantCents * pct) / 100);
              return (
                <div key={p.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <p className="font-semibold">{l?.titre ?? "Annonce"} · {euros(p.montantCents)}</p>
                  <p className="text-xs text-slate-500">
                    {dateFr(p.createdAt)} · commission plateforme {euros(commission)} ({pct}%) · net reversé par Stripe : {euros(p.montantCents - commission)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
