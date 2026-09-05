import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { deposerDocument } from "@/actions/documents";
import { DocBadge, Empty, ErrorNote, OkNote } from "@/components/ui";
import { dateFr } from "@/lib/format";

export const dynamic = "force-dynamic";

const TYPES_CHAUFFEUR = [
  ["identite", "Pièce d'identité"],
  ["permis_conduire", "Permis de conduire"],
  ["carte_vtc", "Carte professionnelle VTC"],
  ["kbis_sirene", "Kbis / avis SIRENE"],
  ["assurance_rc_pro", "Assurance RC professionnelle"],
  ["autre", "Autre document"],
] as const;

const TYPES_LOUEUR = [
  ["identite", "Pièce d'identité"],
  ["kbis_sirene", "Kbis / avis SIRENE"],
  ["assurance_rc_pro", "Assurance RC professionnelle"],
  ["garantie_financiere", "Garantie financière"],
  ["autre", "Autre document"],
] as const;

export default async function Documents({ searchParams }: { searchParams: { erreur?: string; ok?: string } }) {
  const user = await requireUser();
  const db = await getDb();
  const docs = await db.query.documents.findMany({
    where: eq(schema.documents.ownerUserId, user.id),
    orderBy: desc(schema.documents.createdAt),
  });
  const types = user.role === "chauffeur" ? TYPES_CHAUFFEUR : TYPES_LOUEUR;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-black">Coffre documentaire</h1>
      <p className="mt-1 text-sm text-slate-500">
        Un document déposé n&apos;est <strong>jamais</strong> automatiquement validé : chaque pièce est examinée par notre équipe. Vos documents restent privés (jamais visibles publiquement).
      </p>
      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>

      <form action={deposerDocument} className="card mt-4 grid gap-3 sm:grid-cols-4">
        <input type="hidden" name="retour" value="/dashboard/documents" />
        <div>
          <label className="label" htmlFor="type">Type</label>
          <select id="type" name="type" className="input" required>
            {types.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="dateExpiration">Expire le (si applicable)</label>
          <input id="dateExpiration" name="dateExpiration" type="date" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="fichier">Fichier (PDF/JPG/PNG, 10 Mo max)</label>
          <input id="fichier" name="fichier" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required className="input" />
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full">Déposer</button>
        </div>
      </form>

      <div className="mt-6 space-y-2">
        {docs.length === 0 ? (
          <Empty titre="Aucun document dans votre coffre." sous="Commencez par votre pièce d'identité." />
        ) : (
          docs.map((d) => (
            <div key={d.id} className="card flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold">{d.type.replace(/_/g, " ")}</p>
                <p className="text-xs text-slate-500">
                  {d.nomFichier} · déposé le {dateFr(d.createdAt)}
                  {d.dateExpiration && <> · expire le {dateFr(d.dateExpiration)}</>}
                  {d.verifieLe && <> · vérifié le {dateFr(d.verifieLe)}</>}
                </p>
                {d.motifRefus && <p className="text-xs font-medium text-red-600">Motif de refus : {d.motifRefus}</p>}
              </div>
              <div className="flex items-center gap-3">
                <a href={`/api/fichiers/${encodeURIComponent(d.fichierPath)}`} target="_blank" className="text-sm font-semibold text-brand-600">Voir</a>
                <DocBadge statut={d.statut} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
