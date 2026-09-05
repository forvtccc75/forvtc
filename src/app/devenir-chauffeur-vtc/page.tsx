import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Devenir chauffeur VTC en France : conditions et étapes | FORVTC",
  description:
    "Les étapes pour devenir chauffeur VTC : permis B, examen VTC, carte professionnelle, création d'entreprise, inscription au REVTC, assurance et véhicule conforme.",
  alternates: { canonical: "/devenir-chauffeur-vtc" },
};

/**
 * Contenu informatif SOURCÉ (sources listées en bas de page).
 * À faire relire avant production ; ne constitue pas un conseil juridique.
 */
export default function DevenirChauffeurVtc() {
  const etapes: [string, string][] = [
    ["1. Prérequis", "Permis B depuis au moins 3 ans (2 ans en conduite accompagnée), casier judiciaire compatible avec la profession et avis médical positif d'un médecin agréé."],
    ["2. Examen VTC", "Réussir l'examen organisé par les Chambres de Métiers et de l'Artisanat (épreuves théoriques et pratique) — ou justifier d'un an d'expérience de conducteur de transport de personnes dans les dix dernières années."],
    ["3. Carte professionnelle", "Demander la carte professionnelle VTC (validité 5 ans, renouvellement conditionné à une formation continue de 14 heures)."],
    ["4. Créer son entreprise", "Choisir un statut (micro-entreprise, EURL, SASU…) et immatriculer l'entreprise (code APE compatible, typiquement 49.32Z)."],
    ["5. Inscription au REVTC", "Inscrire l'exploitant au registre des VTC (170 €, à renouveler tous les 5 ans). Depuis juillet 2025, exercer sans inscription expose à une amende forfaitaire délictuelle de 400 à 1 500 € et à l'immobilisation du véhicule."],
    ["6. Assurance", "Souscrire une RC professionnelle et une assurance automobile couvrant explicitement le transport de personnes à titre onéreux."],
    ["7. Véhicule conforme", "4 à 9 places, ≥ 4 portes, ≥ 4,50 m × 1,70 m, ≥ 84 kW ; ancienneté maximale de 7 ans pour les thermiques (pas de limite pour électriques/hybrides selon la règle en vigueur) ; contrôle technique annuel."],
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-black">Devenir chauffeur VTC en France</h1>
      <p className="mt-3 text-slate-600">
        Les grandes étapes pour exercer légalement l&apos;activité de chauffeur VTC. Informations générales
        issues des sources listées en bas de page — vérifiez toujours les textes officiels en vigueur,
        cette page ne constitue pas un conseil juridique.
      </p>

      <div className="mt-8 space-y-4">
        {etapes.map(([t, s]) => (
          <div key={t} className="card">
            <h2 className="font-bold">{t}</h2>
            <p className="mt-1 text-sm text-slate-600">{s}</p>
          </div>
        ))}
      </div>

      <div className="card mt-8 border-brand-100 bg-brand-50">
        <h2 className="font-bold">Et pour le véhicule ?</h2>
        <p className="mt-1 text-sm text-slate-700">
          Une fois votre carte obtenue, FORVTC vous permet de trouver un véhicule adapté auprès de loueurs
          dont les documents (carte grise, assurance, contrôle technique) sont vérifiés — avec contrat,
          signature électronique et état des lieux directement sur la plateforme.
        </p>
        <div className="mt-3 flex gap-3">
          <Link href="/recherche" className="btn-primary">TROUVER UNE VOITURE</Link>
          <Link href="/inscription" className="btn-secondary">Créer mon compte chauffeur</Link>
        </div>
      </div>

      <p className="mt-8 text-xs text-slate-400">
        Sources consultées (sept. 2026) : registre des exploitants VTC (vtcprotect.com), obligations VTC 2026 (bvtc.fr),
        réglementation VTC (droovi.com), capital.fr. À re-vérifier sur les textes officiels (Légifrance, service-public.fr) avant toute décision.
      </p>
    </div>
  );
}
