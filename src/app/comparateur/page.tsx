import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { euros } from "@/lib/format";
import { evaluerCompatibilite } from "@/lib/compat";
import { VerifBadge } from "@/components/ui";

export const metadata = { title: "Comparer des véhicules — FORVTC" };
export const dynamic = "force-dynamic";

/**
 * Comparateur : jusqu'à 4 annonces publiées côte à côte.
 * Uniquement des données réelles des annonces — aucune note inventée.
 */
export default async function Comparateur({ searchParams }: { searchParams: { ids?: string } }) {
  const ids = (searchParams.ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/.test(s))
    .slice(0, 4);

  const db = await getDb();
  const listings = ids.length
    ? (await db.query.listings.findMany({ where: inArray(schema.listings.id, ids) })).filter((l) => l.statut === "publiee")
    : [];
  const colonnes = await Promise.all(
    listings.map(async (l) => {
      const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, l.vehicleId) }))!;
      const compat = await evaluerCompatibilite(vehicle);
      return { l, vehicle, compat };
    })
  );

  if (colonnes.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <h1 className="text-2xl font-black">Comparateur</h1>
        <p className="mt-2 text-sm text-slate-500">
          Sélectionnez jusqu&apos;à 4 annonces depuis la recherche (bouton « + Comparer » sur chaque annonce) pour les mettre côte à côte.
        </p>
        <Link href="/recherche" className="btn-primary mt-5 inline-block">Aller à la recherche</Link>
      </div>
    );
  }

  const lignes: { label: string; rend: (c: (typeof colonnes)[number]) => React.ReactNode }[] = [
    { label: "Prix / mois", rend: (c) => (c.l.prixMoisCents !== null ? <strong>{euros(c.l.prixMoisCents)}</strong> : "—") },
    { label: "Prix / semaine", rend: (c) => (c.l.prixSemaineCents !== null ? euros(c.l.prixSemaineCents) : "—") },
    { label: "Prix / jour", rend: (c) => (c.l.prixJourCents !== null ? euros(c.l.prixJourCents) : "—") },
    { label: "Caution", rend: (c) => euros(c.l.cautionCents) },
    { label: "Durée minimale", rend: (c) => `${c.l.dureeMinJours} jours` },
    { label: "Km inclus / mois", rend: (c) => (c.l.kmInclusMois !== null ? `${c.l.kmInclusMois} km` : "—") },
    { label: "Prix km supp.", rend: (c) => (c.l.prixKmSuppCents !== null ? euros(c.l.prixKmSuppCents) : "—") },
    {
      label: "Assurance",
      rend: (c) =>
        c.l.assurance === "incluse" ? (
          <span className="font-semibold text-emerald-700">Incluse (titre onéreux)</span>
        ) : c.l.assurance === "non_incluse" ? (
          <span className="font-semibold text-red-600">Non incluse</span>
        ) : (
          <span className="font-semibold text-amber-700">Conditions spécifiques</span>
        ),
    },
    { label: "Entretien inclus", rend: (c) => (c.l.entretienInclus ? "✅" : "—") },
    { label: "Assistance incluse", rend: (c) => (c.l.assistanceIncluse ? "✅" : "—") },
    { label: "Année", rend: (c) => c.vehicle.annee },
    { label: "Kilométrage", rend: (c) => `${c.vehicle.kilometrage.toLocaleString("fr-FR")} km` },
    { label: "Énergie", rend: (c) => c.vehicle.energie.replace(/_/g, " ") },
    { label: "Boîte", rend: (c) => c.vehicle.boite },
    { label: "Puissance", rend: (c) => `${c.vehicle.puissanceKw} kW` },
    { label: "Ville", rend: (c) => `${c.vehicle.ville} (${c.vehicle.codePostal})` },
    {
      label: "Analyse VTC",
      rend: (c) =>
        c.compat.global === "compatible_verifie" ? (
          <span className="font-semibold text-emerald-700">Critères vérifiés ✔</span>
        ) : c.compat.global === "non_valide" ? (
          <span className="font-semibold text-red-600">Critère(s) non conformes</span>
        ) : (
          <span className="font-semibold text-amber-700">Vérification incomplète</span>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-black">Comparateur ({colonnes.length}/4)</h1>
      <p className="mt-1 text-sm text-slate-500">Données réelles des annonces publiées — aucune note inventée.</p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white p-2 text-left align-bottom text-xs uppercase text-slate-400">Critère</th>
              {colonnes.map((c) => (
                <th key={c.l.id} className="min-w-[180px] rounded-t-xl border border-b-0 border-slate-200 bg-slate-50 p-3 text-left align-top">
                  <Link href={`/annonce/${c.l.id}`} className="font-bold text-brand-700 hover:underline">
                    {c.vehicle.marque} {c.vehicle.modele}
                  </Link>
                  <p className="mt-0.5 text-xs font-normal text-slate-500">{c.l.titre}</p>
                  <div className="mt-1"><VerifBadge statut={c.vehicle.statutVerification} /></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne, i) => (
              <tr key={ligne.label}>
                <td className="sticky left-0 z-10 bg-white p-2 text-xs font-semibold text-slate-500">{ligne.label}</td>
                {colonnes.map((c) => (
                  <td key={c.l.id} className={`border-x border-slate-200 p-3 ${i === lignes.length - 1 ? "rounded-b-xl border-b" : "border-b border-b-slate-100"}`}>
                    {ligne.rend(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {colonnes.map((c) => (
          <Link key={c.l.id} href={`/comparateur?ids=${ids.filter((x) => x !== c.l.id).join(",")}`} className="btn-secondary text-xs">
            ✕ Retirer {c.vehicle.marque} {c.vehicle.modele}
          </Link>
        ))}
        <Link href="/recherche" className="btn-secondary text-xs">+ Ajouter depuis la recherche</Link>
      </div>
    </div>
  );
}
