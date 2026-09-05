import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, eq, ilike, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { villeParSlug, VILLES_SEO } from "@/lib/seo-villes";
import { euros } from "@/lib/format";

export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const ville = villeParSlug(params.slug);
  if (!ville) return {};
  return {
    title: `Location voiture VTC ${ville.nom} — véhicules vérifiés | FORVTC`,
    description: `Louez une voiture adaptée à l'activité VTC à ${ville.nom} : documents vérifiés (carte grise, assurance, contrôle technique), prix et caution transparents, contrat et état des lieux via la plateforme.`,
    alternates: { canonical: `/location-voiture-vtc-${ville.slug}` },
  };
}

export default async function PageVille({ params }: { params: { slug: string } }) {
  const ville = villeParSlug(params.slug);
  if (!ville) notFound();

  const db = await getDb();
  const rows = await db
    .select({ listing: schema.listings, vehicle: schema.vehicles })
    .from(schema.listings)
    .innerJoin(schema.vehicles, eq(schema.listings.vehicleId, schema.vehicles.id))
    .where(
      and(
        eq(schema.listings.statut, "publiee"),
        or(ilike(schema.vehicles.codePostal, `${ville.filtre}%`), ilike(schema.vehicles.ville, `%${ville.nom.split(" ")[0]}%`))
      )
    )
    .limit(30);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <nav className="text-xs text-slate-400">
        <Link href="/" className="hover:underline">Accueil</Link> › <Link href="/location-vtc" className="hover:underline">Location VTC</Link> › {ville.nom}
      </nav>
      <h1 className="mt-2 text-3xl font-black">Location de voiture VTC — {ville.nom}</h1>
      <p className="mt-3 max-w-3xl text-slate-600">{ville.description}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={`/recherche?ville=${encodeURIComponent(ville.filtre)}`} className="btn-primary">
          RECHERCHER À {ville.nom.toUpperCase().split(" (")[0]}
        </Link>
        <Link href="/inscription?role=loueur" className="btn-secondary">LOUER MON VÉHICULE</Link>
      </div>

      <h2 className="mt-10 text-xl font-bold">
        {rows.length > 0
          ? `${rows.length} annonce${rows.length > 1 ? "s" : ""} publiée${rows.length > 1 ? "s" : ""} actuellement`
          : "Annonces dans cette zone"}
      </h2>
      {rows.length === 0 ? (
        <div className="card mt-4">
          <p className="text-sm text-slate-600">
            Aucune annonce publiée dans cette zone pour l&apos;instant — nous n&apos;affichons jamais d&apos;annonces fictives.
            Créez une <Link href="/recherche" className="font-semibold text-brand-600">alerte de recherche</Link> pour être notifié dès la première publication,
            ou <Link href="/inscription?role=loueur" className="font-semibold text-brand-600">publiez votre véhicule</Link> si vous êtes loueur.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ listing, vehicle }) => (
            <Link key={listing.id} href={`/annonce/${listing.id}`} className="card block transition hover:shadow-md">
              <p className="font-bold">{listing.titre}</p>
              <p className="text-sm text-slate-500">{vehicle.marque} {vehicle.modele} · {vehicle.annee} · {vehicle.ville}</p>
              <p className="mt-1 text-sm">{listing.prixMoisCents !== null && <><strong>{euros(listing.prixMoisCents)}</strong>/mois</>}</p>
            </Link>
          ))}
        </div>
      )}

      <section className="mt-12 grid gap-5 sm:grid-cols-3">
        {[
          ["Documents vérifiés", "Carte grise, assurance et contrôle technique examinés par notre équipe avant toute publication. Le statut exact de chaque vérification est affiché."],
          ["Coûts transparents", "Prix jour/semaine/mois, caution distincte du loyer, kilométrage inclus et statut réel de l'assurance : tout est affiché avant la demande."],
          ["Location encadrée", "Demande, contrat généré depuis les données réelles, signature électronique, état des lieux contradictoire avec photos horodatées, centre de résolution."],
        ].map(([t, s]) => (
          <div key={t} className="card">
            <h3 className="font-bold">{t}</h3>
            <p className="mt-2 text-sm text-slate-600">{s}</p>
          </div>
        ))}
      </section>

      <section className="mt-10 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <h2 className="font-bold">Rappel réglementaire</h2>
        <p className="mt-2">
          Louer un véhicule ne confère pas le droit d&apos;exercer comme chauffeur VTC. L&apos;activité exige notamment une
          carte professionnelle VTC en cours de validité, l&apos;inscription de l&apos;exploitant au registre des VTC (REVTC)
          et une assurance couvrant explicitement le transport de personnes à titre onéreux. Le véhicule doit respecter
          les critères en vigueur (puissance, dimensions, ancienneté, contrôle technique annuel).
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-bold">Autres zones</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {VILLES_SEO.filter((v) => v.slug !== ville.slug).map((v) => (
            <Link key={v.slug} href={`/location-voiture-vtc-${v.slug}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-brand-500 hover:text-brand-600">
              {v.nom}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
