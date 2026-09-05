import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { annulerDemande } from "@/actions/bookings";
import { genererContrat } from "@/actions/contracts";
import { payerLocation, enregistrerCaution } from "@/actions/payments";
import { laisserAvis } from "@/actions/reviews";
import { STATUT_LABELS } from "@/lib/booking";
import { stripeActif } from "@/lib/stripe";
import { Empty, ErrorNote, OkNote } from "@/components/ui";
import { dateFr, euros } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MesLocations({ searchParams }: { searchParams: { erreur?: string; ok?: string } }) {
  const user = await requireUser(["chauffeur"]);
  const db = await getDb();
  const bookings = await db.query.bookings.findMany({
    where: eq(schema.bookings.driverId, user.id),
    orderBy: desc(schema.bookings.createdAt),
  });
  const listingIds = Array.from(new Set(bookings.map((b) => b.listingId)));
  const listings = listingIds.length
    ? await db.query.listings.findMany({ where: inArray(schema.listings.id, listingIds) })
    : [];
  const lMap = new Map(listings.map((l) => [l.id, l]));
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
  const recus = bookings.length
    ? await db.query.receipts.findMany({ where: inArray(schema.receipts.bookingId, bookings.map((b) => b.id)) })
    : [];
  const rMap = new Map(recus.map((r) => [r.bookingId, r]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-black">Mes locations</h1>
      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>
      <div className="mt-4 space-y-3">
        {bookings.length === 0 ? (
          <Empty
            titre="Aucune demande de location."
            sous="Trouvez un véhicule adapté à votre activité et envoyez votre première demande."
            cta="TROUVER UNE VOITURE"
            href="/recherche"
          />
        ) : (
          bookings.map((b) => {
            const l = lMap.get(b.listingId);
            const badge = STATUT_LABELS[b.statut] ?? { txt: b.statut, cls: "bg-slate-200 text-slate-700" };
            return (
              <div key={b.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{l ? <Link href={`/annonce/${l.id}`} className="hover:underline">{l.titre}</Link> : "Annonce supprimée"}</p>
                    <p className="text-sm text-slate-500">
                      Du {dateFr(b.dateDebut)} au {dateFr(b.dateFin)} · Location : <strong>{euros(b.prixTotalCents)}</strong> · Caution : {euros(b.cautionCents)}
                    </p>
                    {b.message && <p className="mt-1 text-xs text-slate-500">Votre message : « {b.message} »</p>}
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}>{badge.txt}</span>
                </div>
                {(() => {
                  const contrat = cMap.get(b.id);
                  return (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {["requested", "accepted"].includes(b.statut) && (
                        <form action={annulerDemande}>
                          <input type="hidden" name="bookingId" value={b.id} />
                          <button className="btn-secondary text-red-600">Annuler</button>
                        </form>
                      )}
                      {stripeActif() && ["accepted", "payment_pending"].includes(b.statut) && (
                        <form action={payerLocation}>
                          <input type="hidden" name="bookingId" value={b.id} />
                          <button className="btn-primary">💳 PAYER LA LOCATION ({euros(b.prixTotalCents)})</button>
                        </form>
                      )}
                      {((!stripeActif() && b.statut === "accepted") || b.statut === "contract_pending") && !contrat && (
                        <form action={genererContrat}>
                          <input type="hidden" name="bookingId" value={b.id} />
                          <input type="hidden" name="retour" value="/dashboard/locations" />
                          <button className="btn-primary">GÉNÉRER LE CONTRAT</button>
                        </form>
                      )}
                      {stripeActif() &&
                        Boolean(b.cautionCents) &&
                        !b.cautionPaymentMethodId &&
                        ["paid", "contract_pending", "signed"].includes(b.statut) && (
                          <form action={enregistrerCaution}>
                            <input type="hidden" name="bookingId" value={b.id} />
                            <button className="btn-secondary">🛡️ Enregistrer l&apos;empreinte de caution ({euros(b.cautionCents)})</button>
                          </form>
                        )}
                      {Boolean(b.cautionPaymentMethodId) && (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          🛡️ Caution : empreinte enregistrée (aucun débit)
                        </span>
                      )}
                      {(() => {
                        const recu = rMap.get(b.id);
                        return recu ? (
                          <a href={`/api/fichiers/${encodeURIComponent(recu.pdfPath)}`} className="btn-secondary" target="_blank">
                            🧾 Reçu {recu.numero}
                          </a>
                        ) : null;
                      })()}
                      {contrat && (
                        <Link href={`/dashboard/contrats/${contrat.id}`} className="btn-secondary">
                          Contrat {contrat.numero} {contrat.statut === "actif" ? "✔" : "— à signer"}
                        </Link>
                      )}
                      {contrat?.statut === "actif" && ["accepted", "signed", "active"].includes(b.statut) && (
                        <Link href={`/dashboard/etat-des-lieux/${b.id}`} className="btn-secondary">
                          État des lieux
                        </Link>
                      )}
                      {["return_pending", "returned", "completed"].includes(b.statut) && (
                        <Link href={`/dashboard/etat-des-lieux/${b.id}`} className="btn-secondary">
                          États des lieux (avant/après)
                        </Link>
                      )}
                      {["active", "return_pending", "returned", "completed"].includes(b.statut) && (
                        <Link href={`/dashboard/litiges/nouveau?bookingId=${b.id}`} className="btn-secondary text-amber-700">
                          Signaler un problème
                        </Link>
                      )}
                    </div>
                  );
                })()}
                {b.statut === "accepted" && !cMap.get(b.id) && (
                  <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                    Étapes : contrat → signatures des deux parties → état des lieux de départ → location active.
                    Le paiement en ligne (Stripe) sera intégré à ce parcours dès son activation — aucun paiement ne vous sera demandé hors plateforme.
                  </p>
                )}
                {b.statut === "completed" && !avisFaits.has(b.id) && (
                  <form action={laisserAvis} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <input type="hidden" name="bookingId" value={b.id} />
                    <input type="hidden" name="retour" value="/dashboard/locations" />
                    <p className="text-sm font-semibold">Laisser un avis sur le loueur</p>
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
