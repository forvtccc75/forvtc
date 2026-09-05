import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { deciderDocument } from "@/actions/documents";
import { DocBadge, Empty, ErrorNote, OkNote } from "@/components/ui";
import { dateFr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminDocuments({ searchParams }: { searchParams: { erreur?: string; ok?: string } }) {
  await requireUser(["admin"]);
  const db = await getDb();
  const docs = await db.query.documents.findMany({
    where: inArray(schema.documents.statut, ["depose", "en_verification"]),
    orderBy: asc(schema.documents.createdAt),
    limit: 50,
  });
  const owners = docs.length
    ? await db.query.users.findMany({ where: inArray(schema.users.id, Array.from(new Set(docs.map((d) => d.ownerUserId)))) })
    : [];
  const ownerMap = new Map(owners.map((o) => [o.id, o]));
  const vehIds = Array.from(new Set(docs.map((d) => d.vehicleId).filter(Boolean))) as string[];
  const vehs = vehIds.length ? await db.query.vehicles.findMany({ where: inArray(schema.vehicles.id, vehIds) }) : [];
  const vehMap = new Map(vehs.map((v) => [v.id, v]));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-black">Vérification documentaire</h1>
      <p className="mt-1 text-sm text-slate-500">
        Chaque décision est journalisée (audit trail) et notifiée à l&apos;utilisateur. Un refus exige un motif.
      </p>
      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>
      <div className="mt-4 space-y-4">
        {docs.length === 0 ? (
          <Empty titre="Aucun document en attente de vérification." />
        ) : (
          docs.map((d) => {
            const owner = ownerMap.get(d.ownerUserId);
            const veh = d.vehicleId ? vehMap.get(d.vehicleId) : null;
            return (
              <div key={d.id} className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold">{d.type.replace(/_/g, " ")}</p>
                    <p className="text-sm text-slate-500">
                      {owner ? `${owner.prenom} ${owner.nom} (${owner.email}, ${owner.role})` : "—"}
                      {veh && <> · Véhicule : {veh.marque} {veh.modele} {veh.annee}</>}
                    </p>
                    <p className="text-xs text-slate-400">Déposé le {dateFr(d.createdAt)} · {d.nomFichier}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <a href={`/api/fichiers/${encodeURIComponent(d.fichierPath)}`} target="_blank" className="text-sm font-semibold text-brand-600">
                      Ouvrir le fichier
                    </a>
                    <DocBadge statut={d.statut} />
                  </div>
                </div>
                <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                  <form action={deciderDocument} className="flex items-end gap-2">
                    <input type="hidden" name="documentId" value={d.id} />
                    <input type="hidden" name="decision" value="valide" />
                    <div className="flex-1">
                      <label className="label">Date d&apos;expiration (si applicable)</label>
                      <input name="dateExpiration" type="date" className="input" />
                    </div>
                    <button className="btn-primary bg-emerald-600 hover:bg-emerald-700">Valider</button>
                  </form>
                  <form action={deciderDocument} className="flex items-end gap-2">
                    <input type="hidden" name="documentId" value={d.id} />
                    <input type="hidden" name="decision" value="refuse" />
                    <div className="flex-1">
                      <label className="label">Motif de refus (obligatoire)</label>
                      <input name="motifRefus" className="input" placeholder="Ex. document illisible, date expirée…" />
                    </div>
                    <button className="btn-primary bg-red-600 hover:bg-red-700">Refuser</button>
                  </form>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
