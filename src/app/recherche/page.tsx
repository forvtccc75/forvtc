import Link from "next/link";
import { and, count, eq, ilike, lte, or, SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { euros } from "@/lib/format";
import { currentUser } from "@/lib/auth";
import { sauvegarderRecherche } from "@/actions/favorites";
import { annoncesALaUne, estUrgent, ordreRecherche } from "@/lib/boosts";
import { Empty, ErrorNote, OkNote, VerifBadge } from "@/components/ui";
import { CarteAnnonces } from "@/components/carte";
import { ComparerBouton, ComparateurBarre } from "@/components/comparateur-bouton";

export const metadata = { title: "Rechercher un véhicule VTC — FORVTC" };
export const dynamic = "force-dynamic";

type Params = { ville?: string; budgetMois?: string; energie?: string; boite?: string; assurance?: string; erreur?: string; ok?: string; page?: string };

const PAR_PAGE = 24;

export default async function Recherche({ searchParams }: { searchParams: Params }) {
  const db = await getDb();
  const user = await currentUser();
  const conds: SQL[] = [eq(schema.listings.statut, "publiee")];

  if (searchParams.ville?.trim()) {
    const v = searchParams.ville.trim();
    conds.push(or(ilike(schema.vehicles.ville, `%${v}%`), ilike(schema.vehicles.codePostal, `${v.slice(0, 2)}%`))!);
  }
  if (searchParams.budgetMois && !isNaN(+searchParams.budgetMois))
    conds.push(lte(schema.listings.prixMoisCents, Math.round(+searchParams.budgetMois * 100)));
  if (searchParams.energie && (schema.energie.enumValues as string[]).includes(searchParams.energie))
    conds.push(eq(schema.vehicles.energie, searchParams.energie as (typeof schema.energie.enumValues)[number]));
  if (searchParams.boite && (schema.boite.enumValues as string[]).includes(searchParams.boite))
    conds.push(eq(schema.vehicles.boite, searchParams.boite as (typeof schema.boite.enumValues)[number]));
  if (searchParams.assurance === "incluse") conds.push(eq(schema.listings.assurance, "incluse"));

  const page = Math.max(1, Math.min(200, parseInt(searchParams.page ?? "1", 10) || 1));
  const [totalRow] = await db
    .select({ n: count() })
    .from(schema.listings)
    .innerJoin(schema.vehicles, eq(schema.listings.vehicleId, schema.vehicles.id))
    .where(and(...conds));
  const total = totalRow.n;
  const nbPages = Math.max(1, Math.ceil(total / PAR_PAGE));

  const rows = await db
    .select({ listing: schema.listings, vehicle: schema.vehicles })
    .from(schema.listings)
    .innerJoin(schema.vehicles, eq(schema.listings.vehicleId, schema.vehicles.id))
    .where(and(...conds))
    .orderBy(ordreRecherche)
    .limit(PAR_PAGE)
    .offset((page - 1) * PAR_PAGE);

  const lienPage = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (v && !["page", "erreur", "ok"].includes(k)) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `/recherche${s ? `?${s}` : ""}`;
  };

  const aLaUne = await annoncesALaUne(4);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-black">Rechercher un véhicule</h1>
      <div className="mt-3 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>
      <form className="card mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5" method="get">
        <div>
          <label className="label">Ville / dépt.</label>
          <input name="ville" defaultValue={searchParams.ville ?? ""} className="input" placeholder="Paris, 93…" />
        </div>
        <div>
          <label className="label">Budget €/mois</label>
          <input name="budgetMois" type="number" min="0" defaultValue={searchParams.budgetMois ?? ""} className="input" />
        </div>
        <div>
          <label className="label">Énergie</label>
          <select name="energie" defaultValue={searchParams.energie ?? ""} className="input">
            <option value="">Toutes</option>
            {schema.energie.enumValues.map((e) => (
              <option key={e} value={e}>{e.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Boîte</label>
          <select name="boite" defaultValue={searchParams.boite ?? ""} className="input">
            <option value="">Toutes</option>
            <option value="automatique">Automatique</option>
            <option value="manuelle">Manuelle</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-1.5 pb-2 text-xs font-medium text-slate-600">
            <input type="checkbox" name="assurance" value="incluse" defaultChecked={searchParams.assurance === "incluse"} />
            Assurance incluse
          </label>
          <button className="btn-primary">Filtrer</button>
        </div>
      </form>

      {user?.role === "chauffeur" && (searchParams.ville || searchParams.budgetMois || searchParams.energie) && (
        <form action={sauvegarderRecherche} className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2">
          <input type="hidden" name="ville" value={searchParams.ville ?? ""} />
          <input type="hidden" name="budgetMois" value={searchParams.budgetMois ?? ""} />
          <input type="hidden" name="energie" value={searchParams.energie ?? ""} />
          <p className="text-sm text-slate-700">
            🔔 Être notifié dès qu&apos;une nouvelle annonce correspond à ces critères :
          </p>
          <button className="btn-secondary py-1.5">Créer une alerte</button>
        </form>
      )}

      {aLaUne.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">À la une</h2>
          <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {aLaUne.map(({ listing, vehicle }) => (
              <Link key={listing.id} href={`/annonce/${listing.id}`} className="card block border-brand-200 bg-brand-50/50 transition hover:shadow-md">
                <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">À la une</span>
                <h3 className="mt-2 font-bold">{listing.titre}</h3>
                <p className="text-sm text-slate-500">{vehicle.marque} {vehicle.modele} · {vehicle.ville}</p>
                {listing.prixMoisCents !== null && (
                  <p className="mt-1 text-sm"><strong>{euros(listing.prixMoisCents)}</strong>/mois</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {(() => {
        const pts = rows
          .filter(({ vehicle }) => vehicle.lat && vehicle.lng)
          .map(({ listing, vehicle }) => ({
            id: listing.id,
            lat: Number(vehicle.lat),
            lng: Number(vehicle.lng),
            titre: listing.titre,
            prix: listing.prixMoisCents !== null ? `${Math.round(listing.prixMoisCents / 100)} €/mois` : "Voir",
            url: `/annonce/${listing.id}`,
          }));
        return pts.length > 0 ? (
          <div className="mt-6">
            <CarteAnnonces points={pts} />
            <p className="mt-1 text-[11px] text-slate-400">
              Positions affichées au niveau de la commune — jamais l&apos;adresse exacte.
            </p>
          </div>
        ) : null;
      })()}

      <div className="mt-6">
        {rows.length === 0 ? (
          <Empty
            titre="Aucune annonce publiée ne correspond à ces critères."
            sous="Les annonces n'apparaissent ici qu'après vérification des documents du véhicule par notre équipe. Aucune annonce fictive n'est affichée."
            cta="Proposer mon véhicule à la location"
            href="/inscription?role=loueur"
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(({ listing, vehicle }) => (
              <Link key={listing.id} href={`/annonce/${listing.id}`} className="card block transition hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-bold">
                    {estUrgent(listing) && (
                      <span className="mr-1.5 rounded bg-orange-500 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-white">Urgent</span>
                    )}
                    {listing.titre}
                  </h2>
                  <VerifBadge statut={vehicle.statutVerification} />
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {vehicle.marque} {vehicle.modele} · {vehicle.annee} · {vehicle.energie.replace(/_/g, " ")} · {vehicle.boite}
                </p>
                <p className="text-sm text-slate-500">📍 {vehicle.ville} ({vehicle.codePostal})</p>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                  {listing.prixJourCents !== null && <span><strong>{euros(listing.prixJourCents)}</strong>/jour</span>}
                  {listing.prixMoisCents !== null && <span><strong>{euros(listing.prixMoisCents)}</strong>/mois</span>}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Caution {euros(listing.cautionCents)} · Assurance : {listing.assurance === "incluse" ? "incluse" : listing.assurance === "non_incluse" ? "non incluse" : "conditions spécifiques"}
                </p>
                <div className="mt-2">
                  <ComparerBouton listingId={listing.id} />
                </div>
              </Link>
            ))}
          </div>
        )}
        {nbPages > 1 && (
          <nav className="mt-6 flex items-center justify-center gap-2 text-sm">
            {page > 1 && (
              <Link href={lienPage(page - 1)} className="btn-secondary py-1.5">← Précédent</Link>
            )}
            <span className="px-2 text-slate-500">
              Page {page} / {nbPages} · {total} annonce{total > 1 ? "s" : ""}
            </span>
            {page < nbPages && (
              <Link href={lienPage(page + 1)} className="btn-secondary py-1.5">Suivant →</Link>
            )}
          </nav>
        )}
      </div>
      <ComparateurBarre />
    </div>
  );
}
