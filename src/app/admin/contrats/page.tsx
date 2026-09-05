import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { enregistrerTemplate } from "@/actions/contracts";
import { templateActif } from "@/lib/contract";
import { ErrorNote, OkNote } from "@/components/ui";
import { dateFr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminContrats({ searchParams }: { searchParams: { erreur?: string; ok?: string } }) {
  await requireUser(["admin"]);
  const db = await getDb();
  const actif = await templateActif();
  const versions = await db.query.contractTemplates.findMany({ orderBy: desc(schema.contractTemplates.version) });
  const contrats = await db.query.contracts.findMany({ orderBy: desc(schema.contracts.createdAt), limit: 50 });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-black">Contrats — modèles &amp; suivi</h1>
      <p className="mt-1 text-sm text-slate-500">
        Toute modification d&apos;un modèle crée une <strong>nouvelle version</strong> ; les anciennes sont conservées
        (les contrats déjà générés référencent leur version d&apos;origine). Faites valider le contenu par un conseil
        juridique avant production — la plateforme n&apos;invente aucune clause « juridiquement garantie ».
      </p>
      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>

      <section className="card mt-5">
        <h2 className="font-bold">Modèle actif : {actif.nom} (v{actif.version})</h2>
        <form action={enregistrerTemplate} className="mt-3 space-y-3">
          <input type="hidden" name="code" value={actif.code} />
          <div>
            <label className="label">Nom du modèle</label>
            <input name="nom" defaultValue={actif.nom} required className="input" />
          </div>
          <div>
            <label className="label">Corps du modèle (placeholders : {"{{numero}}, {{chauffeur_nom}}, {{prix_total}}"}…)</label>
            <textarea name="corps" rows={16} defaultValue={actif.corps} required className="input font-mono text-xs" />
          </div>
          <button className="btn-primary">Enregistrer comme nouvelle version (v{actif.version + 1})</button>
        </form>
      </section>

      <section className="card mt-5">
        <h2 className="font-bold">Historique des versions du modèle</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {versions.map((v) => (
            <li key={v.id} className="flex justify-between border-b border-slate-100 py-1.5">
              <span>v{v.version} — {v.nom}</span>
              <span className="text-xs text-slate-500">{dateFr(v.createdAt)} {v.actif && <strong className="text-emerald-700">· active</strong>}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card mt-5">
        <h2 className="font-bold">Contrats générés ({contrats.length})</h2>
        {contrats.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Aucun contrat généré pour l&apos;instant.</p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-400">
                <th className="py-2 pr-3">Numéro</th><th className="py-2 pr-3">Version</th><th className="py-2 pr-3">Statut</th><th className="py-2 pr-3">Empreinte</th><th className="py-2">Généré le</th>
              </tr>
            </thead>
            <tbody>
              {contrats.map((c) => (
                <tr key={c.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3 font-mono text-xs">{c.numero}</td>
                  <td className="py-1.5 pr-3">v{c.version}</td>
                  <td className="py-1.5 pr-3">{c.statut}</td>
                  <td className="py-1.5 pr-3 font-mono text-[10px] text-slate-400">{c.pdfHash?.slice(0, 16)}…</td>
                  <td className="py-1.5 text-xs text-slate-500">{dateFr(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
