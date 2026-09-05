import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { deciderDemande } from "@/actions/bookings";
import { genererContrat } from "@/actions/contracts";
import { laisserAvis } from "@/actions/reviews";
import { STATUT_LABELS } from "@/lib/booking";
import { syntheseVerificationChauffeur, VERIF_LABELS } from "@/lib/verif";
import { stripeActif } from "@/lib/stripe";
import { Empty, ErrorNote, OkNote } from "@/components/ui";
import { dateFr, euros } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Demandes({ searchParams }: { searchParams: { erreur?: string; ok?: string } }) {
  const user = await requireUser(["loueur", "entreprise", "gestionnaire_flotte"]);
  const db = await getDb();

  const myVehicles = await db.query.vehicles.findMany({ where: eq(schema.vehicles.ownerId, user.id) });
  const vehIds = myVehicles.map((v) => v.id);
  const listings = vehIds.length
    ? await db.query.listings.findMany({ where: inArray(schema.listings.vehicleId, vehIds) })
    : [];
  const lMap = new Map(listings.map((l) => [l.id, l]));
  const bookings = listings.length
    ? await db.query.bookings.findMany({
        where: inArray(schema.bookings.listingId, listings.map((l) => l.id)),
        orderBy: desc(schema.bookings.createdAt),
      })
    : [];
  const driverIds = Array.from(new Set(bookings.map((b) => b.driverId)));
  const drivers = driverIds.length
    ? await db.query.users.findMany({ where: inArray(schema.users.id, driverIds) })
    : [];
  const dMap = new Map(drivers.map((d) => [d.id, d]));
  const verifs = new Map(
    await Promise.all(driverIds.map(async (id) => [id, await syntheseVerificationChauffeur(id)] as const))
  );
  const contrats = bookings.length
    ? await db.query.contracts.findMany({ where: inArray(schema.contracts.bookingId, bookings.map((b) => b.id)) })
    : [];
  const cMap = new Map(contrats.filter((c) => c.statut !== "annule").map((c) => [c.bookingId, c]));
  const mesAvis = bookings.length
    ? await db.query.reviews.findMany({
        where: and(inArray(schema.reviews.bookingId, bookings.map((b) => b.id)), eq(schema.reviews.auteurId, user.id)),
      })
    : [];
  const avisFaits = new Set(mesAvis.map((a) => a.bookingId));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-black">Demandes de location</h1>
      <p className="mt-1 text-sm text-slate-500">
        L&apos;état de vérification du chauffeur est affiché tel quel (validé / déposé / non fourni) — à vous de décider en connaissance de cause.
      </p>
      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>
      <div className="mt-4 space-y-3">
        {bookings.length === 0 ? (
          <Empty
            titre="Aucune demande reçue."
            sous="Les demandes des chauffeurs sur vos annonces publiées apparaîtront ici."
            cta="Voir mes véhicules"
            href="/dashboard/vehicules"
          />
        ) : (
          bookings.map((b) => {
            const l = lMap.get(b.listingId);
            const driver = dMap.get(b.driverId);
            const v = verifs.get(b.driverId);
            const badge = STATUT_LABELS[b.statut] ?? { txt: b.statut, cls: "bg-slate-200 text-slate-700" };
            return (
              <div key={b.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{l?.titre ?? "Annonce"}</p>
                    <p className="text-sm text-slate-500">
                      {driver ? `${driver.prenom} ${driver.nom.charAt(0)}.` : "—"} · du {dateFr(b.dateDebut)} au {dateFr(b.dateFin)} ·{" "}
                      <strong>{euros(b.prixTotalCents)}</strong> (+ caution {euros(b.cautionCents)})
                    </p>
                    {b.message && <p className="mt-1 text-xs text-slate-600">Message : « {b.message} »</p>}
                    {v && (
                      <p className="mt-1 text-xs">
                        Vérifications chauffeur :{" "}
                        <span className={VERIF_LABELS[v.identite].cls}>identité {VERIF_LABELS[v.identite].txt}</span> ·{" "}
                        <span className={VERIF_LABELS[v.permis].cls}>permis {VERIF_LABELS[v.permis].txt}</span> ·{" "}
                        <span className={VERIF_LABELS[v.carteVtc].cls}>carte VTC {VERIF_LABELS[v.carteVtc].txt}</span>
                      </p>
                    )}
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}>{badge.txt}</span>
                </div>
                {b.statut === "requested" && (
                  <div className="mt-3 flex gap-2">
                    <form action={deciderDemande}>
                      <input type="hidden" name="bookingId" value={b.id} />
                      <input type="hidden" name="decision" value="accepter" />
                      <button className="btn-primary bg-emerald-600 hover:bg-emerald-700">ACCEPTER</button>
                    </form>
                    <form action={deciderDemande}>
                      <input type="hidden" name="bookingId" value={b.id} />
                      <input type="hidden" name="decision" value="refuser" />
                      <button className="btn-secondary text-red-600">REFUSER</button>
                    </form>
                  </div>
                )}
                {(() => {
                  const contrat = cMap.get(b.id);
                  return (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {stripeActif() && ["accepted", "payment_pending"].includes(b.statut) && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          ⏳ En attente du paiement du chauffeur
                        </span>
                      )}
                      {((!stripeActif() && b.statut === "accepted") || b.statut === "contract_pending") && !contrat && (
                        <form action={genererContrat}>
                          <input type="hidden" name="bookingId" value={b.id} />
                          <input type="hidden" name="retour" value="/dashboard/demandes" />
                          <button className="btn-primary">GÉNÉRER LE CONTRAT</button>
                        </form>
                      )}
                      {contrat && (
                        <Link href={`/dashboard/contrats/${contrat.id}`} className="btn-secondary">
                          Contrat {contrat.numero} {contrat.statut === "actif" ? "✔" : "— à signer"}
                        </Link>
                      )}
                      {contrat?.statut === "actif" && ["accepted", "signed", "active", "return_pending", "returned", "completed"].includes(b.statut) && (
                        <Link href={`/dashboard/etat-des-lieux/${b.id}`} className="btn-secondary">État des lieux</Link>
                      )}
                    </div>
                  );
                })()}
                {b.statut === "completed" && !avisFaits.has(b.id) && (
                  <form action={laisserAvis} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <input type="hidden" name="bookingId" value={b.id} />
                    <input type="hidden" name="retour" value="/dashboard/demandes" />
                    <p className="text-sm font-semibold">Laisser un avis sur le chauffeur</p>
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <div>
                        <label className="label">Note</label>
                        <select name="note" required className="input w-24">
                          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}/5</option>)}
                        </select>
                      </div>
                      <input name="commentaire" maxLength={2000} placeholder="Votre commentaire (optionnel)" className="input flex-1" />
                      <button className="btn-primary shrink-0">Publier</button>
                    </div>
                  </form>
                )}
                {b.statut === "completed" && avisFaits.has(b.id) && (
                  <p className="mt-2 text-xs text-emerald-700">✓ Avis publié sur cette location.</p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
