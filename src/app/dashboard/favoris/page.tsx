import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { basculerFavori, supprimerRecherche } from "@/actions/favorites";
import { Empty, ErrorNote, OkNote } from "@/components/ui";
import { euros } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Favoris({ searchParams }: { searchParams: { erreur?: string; ok?: string } }) {
  const user = await requireUser(["chauffeur"]);
  const db = await getDb();

  const favs = await db.query.favorites.findMany({
    where: eq(schema.favorites.userId, user.id),
    orderBy: desc(schema.favorites.createdAt),
  });
  const listings = favs.length
    ? await db.query.listings.findMany({ where: inArray(schema.listings.id, favs.map((f) => f.listingId)) })
    : [];
  const lMap = new Map(listings.map((l) => [l.id, l]));
  const vehicles = listings.length
    ? await db.query.vehicles.findMany({ where: inArray(schema.vehicles.id, listings.map((l) => l.vehicleId)) })
    : [];
  const vMap = new Map(vehicles.map((v) => [v.id, v]));

  const alertes = await db.query.savedSearches.findMany({
    where: eq(schema.savedSearches.userId, user.id),
    orderBy: desc(schema.savedSearches.createdAt),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-black">Favoris &amp; alertes</h1>
      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>

      <h2 className="mt-6 font-bold">Annonces favorites ({favs.length})</h2>
      <div className="mt-3 space-y-2">
        {favs.length === 0 ? (
          <Empty titre="Aucun favori." sous="Ajoutez des annonces à vos favoris depuis la recherche." cta="Rechercher" href="/recherche" />
        ) : (
          favs.map((f) => {
            const l = lMap.get(f.listingId);
            if (!l) return null;
            const v = vMap.get(l.vehicleId);
            const retiree = l.statut !== "publiee";
            return (
              <div key={f.id} className="card flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">
                    {retiree ? l.titre : <Link href={`/annonce/${l.id}`} className="hover:underline">{l.titre}</Link>}
                    {retiree && <span className="ml-2 rounded bg-slate-200 px-1.5 text-xs">annonce retirée</span>}
                  </p>
                  <p className="text-sm text-slate-500">
                    {v ? `${v.marque} ${v.modele} · ${v.ville}` : ""} {l.prixMoisCents !== null && <>· <strong>{euros(l.prixMoisCents)}</strong>/mois</>}
                  </p>
                </div>
                <form action={basculerFavori}>
                  <input type="hidden" name="listingId" value={l.id} />
                  <input type="hidden" name="retour" value="/dashboard/favoris" />
                  <button className="btn-secondary text-red-600">Retirer</button>
                </form>
              </div>
            );
          })
        )}
      </div>

      <h2 className="mt-8 font-bold">Alertes de recherche ({alertes.length}/10)</h2>
      <p className="mt-1 text-xs text-slate-500">Vous êtes notifié dès qu&apos;une nouvelle annonce publiée correspond à vos critères.</p>
      <div className="mt-3 space-y-2">
        {alertes.length === 0 ? (
          <Empty titre="Aucune alerte." sous="Créez une alerte depuis la page de recherche : vos critères actuels seront sauvegardés." cta="Créer une alerte" href="/recherche" />
        ) : (
          alertes.map((a) => {
            const c = a.criteres as { ville: string | null; budgetMoisCents: number | null; energie: string | null };
            return (
              <div key={a.id} className="card flex items-center justify-between py-3">
                <p className="text-sm">
                  {[
                    c.ville && `📍 ${c.ville}`,
                    c.budgetMoisCents !== null && `≤ ${euros(c.budgetMoisCents)}/mois`,
                    c.energie && `⚡ ${c.energie.replace(/_/g, " ")}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <form action={supprimerRecherche}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="btn-secondary text-red-600">Supprimer</button>
                </form>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
