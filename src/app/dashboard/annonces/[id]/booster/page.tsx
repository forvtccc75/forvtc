import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { euros } from "@/lib/format";
import { BOOSTS, expirerBoosts } from "@/lib/boosts";
import { stripeActif } from "@/lib/stripe";
import { acheterBoost } from "@/actions/boosts";
import { ErrorNote, OkNote } from "@/components/ui";

export const metadata = { title: "Booster mon annonce — FORVTC" };
export const dynamic = "force-dynamic";

const STATUTS: Record<string, { txt: string; cls: string }> = {
  attente_paiement: { txt: "En attente de paiement", cls: "bg-amber-100 text-amber-800" },
  actif: { txt: "Actif", cls: "bg-emerald-100 text-emerald-800" },
  expire: { txt: "Expiré", cls: "bg-slate-100 text-slate-600" },
  annule: { txt: "Annulé", cls: "bg-slate-100 text-slate-600" },
};

export default async function BoosterAnnonce({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erreur?: string; paiement?: string };
}) {
  const user = await requireUser(["loueur", "entreprise", "gestionnaire_flotte"]);
  const db = await getDb();
  await expirerBoosts();

  const listing = await db.query.listings.findFirst({ where: eq(schema.listings.id, params.id) });
  if (!listing) notFound();
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;
  if (vehicle.ownerId !== user.id) notFound();

  const achats = await db.query.listingBoosts.findMany({
    where: eq(schema.listingBoosts.listingId, listing.id),
    orderBy: [desc(schema.listingBoosts.createdAt)],
  });
  const actifs = new Set(achats.filter((b) => b.statut === "actif" && (b.dateFin ? b.dateFin > new Date() : false)).map((b) => b.type));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href={`/dashboard/vehicules/${vehicle.id}`} className="text-sm text-brand-600">← Retour au véhicule</Link>
      <h1 className="mt-2 text-2xl font-black">Booster mon annonce</h1>
      <p className="mt-1 text-sm text-slate-500">{listing.titre}</p>

      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        {searchParams.paiement === "succes" && (
          <OkNote msg="Paiement reçu par Stripe. Votre option est activée dès la confirmation du paiement (quelques secondes en général) — rechargez la page si elle n'apparaît pas encore ci-dessous." />
        )}
        {searchParams.paiement === "annule" && <ErrorNote msg="Paiement annulé — aucune somme n'a été débitée." />}
      </div>

      {listing.statut !== "publiee" && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Cette annonce n&apos;est pas publiée : les options de visibilité ne sont disponibles que pour les annonces en ligne.
        </p>
      )}

      {!stripeActif() && (
        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Le paiement en ligne n&apos;est pas encore activé sur la plateforme. Les options ci-dessous seront
          achetables dès son activation — aucun paiement n&apos;est simulé.
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {Object.values(BOOSTS).map((b) => {
          const dejaActif = actifs.has(b.code);
          const achetable = stripeActif() && listing.statut === "publiee" && !dejaActif;
          return (
            <div key={b.code} className="card flex flex-col">
              <h2 className="font-bold">{b.nom}</h2>
              <p className="mt-1 flex-1 text-sm text-slate-600">{b.description}</p>
              <p className="mt-3 text-lg font-black">{euros(b.prixCents)}</p>
              {b.dureeJours && <p className="text-xs text-slate-500">pendant {b.dureeJours} jours</p>}
              {dejaActif ? (
                <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-center text-sm font-semibold text-emerald-700">Déjà actif</p>
              ) : (
                <form action={acheterBoost} className="mt-3">
                  <input type="hidden" name="listingId" value={listing.id} />
                  <input type="hidden" name="type" value={b.code} />
                  <button className="btn-primary w-full" disabled={!achetable}>
                    {stripeActif() ? "Payer avec Stripe" : "Bientôt disponible"}
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Paiement sécurisé par Stripe. L&apos;option est activée uniquement après confirmation du paiement
        (webhook signé). Les boosts modifient la visibilité de l&apos;annonce, jamais son contenu ni les
        statuts de vérification.
      </p>

      {achats.length > 0 && (
        <section className="mt-8">
          <h2 className="font-bold">Historique des achats</h2>
          <div className="mt-3 space-y-2">
            {achats.map((b) => {
              const s = STATUTS[b.statut] ?? STATUTS.annule;
              return (
                <div key={b.id} className="card flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-semibold">{BOOSTS[b.type]?.nom ?? b.type}</p>
                    <p className="text-xs text-slate-500">
                      {b.createdAt.toLocaleString("fr-FR")} · {euros(b.prixCents)}
                      {b.dateFin && b.statut === "actif" && <> · jusqu&apos;au {b.dateFin.toLocaleDateString("fr-FR")}</>}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.txt}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
