import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { traiterLitige } from "@/actions/disputes";
import { Empty, ErrorNote, OkNote } from "@/components/ui";
import { dateFr, euros } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminLitiges({ searchParams }: { searchParams: { erreur?: string; ok?: string } }) {
  await requireUser(["admin"]);
  const db = await getDb();
  const litiges = await db.query.disputes.findMany({ orderBy: desc(schema.disputes.createdAt), limit: 50 });

  const bookingIds = Array.from(new Set(litiges.map((l) => l.bookingId)));
  const bookings = bookingIds.length
    ? await db.query.bookings.findMany({ where: inArray(schema.bookings.id, bookingIds) })
    : [];
  const bMap = new Map(bookings.map((b) => [b.id, b]));
  const listingIds = Array.from(new Set(bookings.map((b) => b.listingId)));
  const listings = listingIds.length
    ? await db.query.listings.findMany({ where: inArray(schema.listings.id, listingIds) })
    : [];
  const lMap = new Map(listings.map((l) => [l.id, l]));
  const userIds = Array.from(new Set(litiges.map((l) => l.ouvertPar)));
  const usersList = userIds.length ? await db.query.users.findMany({ where: inArray(schema.users.id, userIds) }) : [];
  const uMap = new Map(usersList.map((u) => [u.id, u]));
  // Pièces du dossier : contrats et états des lieux liés
  const contrats = bookingIds.length
    ? await db.query.contracts.findMany({ where: inArray(schema.contracts.bookingId, bookingIds) })
    : [];
  const cByBooking = new Map(contrats.filter((c) => c.statut === "actif").map((c) => [c.bookingId, c]));
  const inspections = bookingIds.length
    ? await db.query.inspections.findMany({
        where: inArray(schema.inspections.bookingId, bookingIds),
        orderBy: asc(schema.inspections.createdAt),
      })
    : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-black">Litiges</h1>
      <p className="mt-1 text-sm text-slate-500">
        Chaque décision doit être motivée ; elle est journalisée et notifiée aux deux parties.
      </p>
      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>
      <div className="mt-4 space-y-4">
        {litiges.length === 0 ? (
          <Empty titre="Aucun litige." />
        ) : (
          litiges.map((l) => {
            const b = bMap.get(l.bookingId);
            const listing = b ? lMap.get(b.listingId) : null;
            const ouvreur = uMap.get(l.ouvertPar);
            const contrat = cByBooking.get(l.bookingId);
            const edls = inspections.filter((i) => i.bookingId === l.bookingId);
            return (
              <div key={l.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold capitalize">{l.categorie.replace(/_/g, " ")} — {l.statut.replace(/_/g, " ")}</p>
                    <p className="text-sm text-slate-500">
                      {listing?.titre ?? "—"} · ouvert par {ouvreur ? `${ouvreur.prenom} ${ouvreur.nom} (${ouvreur.role})` : "—"} le {dateFr(l.createdAt)}
                    </p>
                    {b && (
                      <p className="text-xs text-slate-400">
                        Location {dateFr(b.dateDebut)} → {dateFr(b.dateFin)} · {euros(b.prixTotalCents)} · caution {euros(b.cautionCents)} · statut {b.statut}
                      </p>
                    )}
                  </div>
                </div>
                <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{l.description}</p>

                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {contrat?.pdfPath && (
                    <a href={`/api/fichiers/${encodeURIComponent(contrat.pdfPath)}`} target="_blank" className="font-semibold text-brand-600 hover:underline">
                      Contrat {contrat.numero} (PDF) ↗
                    </a>
                  )}
                  {b && edls.length > 0 && (
                    <Link href={`/dashboard/etat-des-lieux/${b.id}`} className="font-semibold text-brand-600 hover:underline">
                      États des lieux ({edls.map((e) => e.type).join(" + ")}) →
                    </Link>
                  )}
                  {edls.length === 0 && <span className="text-slate-400">Aucun état des lieux déposé</span>}
                </div>

                {l.resolution && (
                  <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900"><strong>Décision :</strong> {l.resolution}</p>
                )}

                {l.statut === "ouvert" && (
                  <form action={traiterLitige} className="mt-3">
                    <input type="hidden" name="disputeId" value={l.id} />
                    <input type="hidden" name="action" value="prendre_en_charge" />
                    <button className="btn-secondary">Prendre en charge</button>
                  </form>
                )}
                {["ouvert", "en_analyse"].includes(l.statut) && (
                  <form action={traiterLitige} className="mt-3 flex items-end gap-2">
                    <input type="hidden" name="disputeId" value={l.id} />
                    <input type="hidden" name="action" value="resoudre" />
                    <div className="flex-1">
                      <label className="label">Résolution motivée (obligatoire, notifiée aux parties)</label>
                      <input name="resolution" className="input" placeholder="Ex. Au vu des états des lieux contradictoires, la rayure est antérieure à la location…" />
                    </div>
                    <button className="btn-primary shrink-0 bg-emerald-600 hover:bg-emerald-700">Résoudre</button>
                  </form>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
