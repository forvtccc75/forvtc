import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { dateFr } from "@/lib/format";
import { modifierRegle } from "@/actions/admin";
import { ErrorNote, OkNote } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Documentation pédagogique de chaque règle : explication en français simple,
 * conséquence concrète sur la plateforme, et rendu lisible de la valeur.
 * La valeur AFFICHÉE vient toujours de la base (jamais d'une constante).
 */
type Valeur = Record<string, unknown>;
const DOC: Record<
  string,
  {
    emoji: string;
    simple: string;
    consequence: string;
    lisible: (v: Valeur) => string;
  }
> = {
  VEH_PUISSANCE_MIN_KW: {
    emoji: "⚡",
    simple: "Pour être utilisé en VTC, un véhicule doit avoir un moteur d'au moins cette puissance. C'est la loi française qui fixe ce seuil.",
    consequence: "Un véhicule moins puissant est marqué « non conforme » et son annonce ne peut pas être publiée comme compatible VTC.",
    lisible: (v) => `${v.min} ${v.unite} minimum (≈ ${Math.round(Number(v.min) * 1.36)} chevaux)`,
  },
  VEH_PORTES_MIN: {
    emoji: "🚪",
    simple: "Un véhicule VTC doit avoir au minimum ce nombre de portes (les coupés 2 ou 3 portes sont exclus).",
    consequence: "Moins de portes = véhicule non conforme pour le VTC.",
    lisible: (v) => `${v.min} portes minimum`,
  },
  VEH_PLACES_MIN: {
    emoji: "🪑",
    simple: "Nombre minimum de places assises, chauffeur compris.",
    consequence: "Moins de places = véhicule non conforme pour le VTC.",
    lisible: (v) => `${v.min} places minimum (chauffeur compris)`,
  },
  VEH_PLACES_MAX: {
    emoji: "🪑",
    simple: "Au-delà de ce nombre de places, ce n'est plus du VTC mais du transport collectif (autre réglementation, autre licence).",
    consequence: "Plus de places = véhicule non conforme pour le VTC.",
    lisible: (v) => `${v.max} places maximum (chauffeur compris)`,
  },
  VEH_LONGUEUR_MIN_MM: {
    emoji: "📏",
    simple: "Le véhicule doit faire au moins cette longueur. C'est un critère de confort exigé par la réglementation VTC.",
    consequence: "Trop court = non conforme. Exemple : une Clio (4,05 m) est refusée, une Passat (4,87 m) passe.",
    lisible: (v) => `${(Number(v.min) / 1000).toFixed(2).replace(".", ",")} m minimum`,
  },
  VEH_LARGEUR_MIN_MM: {
    emoji: "📐",
    simple: "Largeur minimale du véhicule exigée par la réglementation VTC.",
    consequence: "Trop étroit = non conforme.",
    lisible: (v) => `${(Number(v.min) / 1000).toFixed(2).replace(".", ",")} m minimum`,
  },
  VEH_AGE_MAX_THERMIQUE: {
    emoji: "📅",
    simple: "Un véhicule essence ou diesel ne doit pas dépasser cet âge pour faire du VTC. Les électriques et hybrides n'ont PAS de limite d'âge.",
    consequence: "Un véhicule thermique trop ancien est non conforme. Un électrique/hybride du même âge reste conforme.",
    lisible: (v) => `${v.maxAnnees} ans maximum pour essence/diesel — aucune limite pour électrique et hybride`,
  },
  VEH_CT_ANNUEL: {
    emoji: "🔧",
    simple: "Un véhicule VTC doit passer le contrôle technique chaque année (au lieu de tous les 2 ans pour un véhicule normal).",
    consequence: "Sans contrôle technique valide déposé et validé, l'annonce ne peut pas être publiée.",
    lisible: (v) => `Contrôle technique tous les ${v.frequenceMois} mois`,
  },
  ASSURANCE_TITRE_ONEREUX: {
    emoji: "🛡️",
    simple: "L'assurance du véhicule doit couvrir EXPLICITEMENT le « transport de personnes à titre onéreux » (= transporter des clients payants). Une assurance classique, même « pro », ne suffit pas.",
    consequence: "FORVTC n'affiche jamais « assurance incluse » sans cette mention. C'est la protection n°1 du chauffeur : sans elle, il roule sans couverture en cas d'accident avec un client.",
    lisible: () => "Mention obligatoire dans le contrat d'assurance",
  },
  REVTC_LOCATION_6_MOIS: {
    emoji: "📋",
    simple: "Pour s'inscrire au registre des VTC (REVTC), un chauffeur qui loue son véhicule doit avoir un contrat de location de plus de 6 mois. Sinon, il doit fournir une garantie financière.",
    consequence: "FORVTC affiche un avertissement sur les locations courtes : elles peuvent ne pas suffire pour le dossier REVTC du chauffeur.",
    lisible: (v) => `Contrat > ${v.dureeMinMois} mois exigé au REVTC, sinon garantie de ${(Number(v.garantieCents) / 100).toLocaleString("fr-FR")} € par véhicule`,
  },
  DRIVER_CARTE_VTC: {
    emoji: "🪪",
    simple: "La carte professionnelle VTC est LE document qui autorise à exercer. Elle est valable 5 ans puis doit être renouvelée (avec formation continue).",
    consequence: "Un chauffeur sans carte VTC validée ne peut pas obtenir le statut « vérifié » sur FORVTC.",
    lisible: (v) => `Carte valable ${v.validiteAnnees} ans`,
  },
  COMMISSION_PLATEFORME_PCT: {
    emoji: "💶",
    simple: "Ce n'est PAS une règle légale : c'est le pourcentage que FORVTC prélève sur chaque loyer payé en ligne. Le loueur reçoit le loyer moins cette commission.",
    consequence: "Exemple avec 10 % : loyer de 1 400 € → le loueur reçoit 1 260 €, FORVTC garde 140 €. La caution n'est jamais concernée.",
    lisible: (v) => `${v.pct} % du loyer, prélevé automatiquement au versement`,
  },
};

const CATEGORIES: Record<string, { titre: string; emoji: string; intro: string }> = {
  VEHICLE: { titre: "Le véhicule", emoji: "🚗", intro: "Ce qu'un véhicule doit respecter pour être utilisable en VTC en France." },
  DOCUMENT: { titre: "Les documents", emoji: "📄", intro: "Les justificatifs obligatoires et leur fréquence de renouvellement." },
  INSURANCE: { titre: "L'assurance", emoji: "🛡️", intro: "La couverture minimale pour transporter des clients payants." },
  CONTRACT: { titre: "Le contrat de location", emoji: "📋", intro: "Les exigences liées à la durée de location et au registre VTC." },
  DRIVER: { titre: "Le chauffeur", emoji: "🪪", intro: "Ce qu'un chauffeur doit détenir pour exercer légalement." },
  PLATFORM: { titre: "Paramètres FORVTC", emoji: "⚙️", intro: "Réglages business de la plateforme — pas des règles légales." },
};

export default async function AdminRegles({ searchParams }: { searchParams: { erreur?: string; ok?: string } }) {
  await requireUser(["admin"]);
  const db = await getDb();
  const rules = await db.query.platformRules.findMany({ orderBy: asc(schema.platformRules.categorie) });

  const parCategorie = new Map<string, typeof rules>();
  for (const r of rules) {
    const arr = parCategorie.get(r.categorie) ?? [];
    arr.push(r);
    parCategorie.set(r.categorie, arr);
  }
  // Ordre pédagogique : véhicule → documents → assurance → contrat → chauffeur → plateforme
  const ordre = ["VEHICLE", "DOCUMENT", "INSURANCE", "CONTRACT", "DRIVER", "PLATFORM"];
  const categoriesTriees = [...parCategorie.entries()].sort(
    (a, b) => (ordre.indexOf(a[0]) === -1 ? 99 : ordre.indexOf(a[0])) - (ordre.indexOf(b[0]) === -1 ? 99 : ordre.indexOf(b[0]))
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-black">Règles de la plateforme</h1>
      <p className="mt-1 text-sm text-slate-500">
        Ces règles pilotent automatiquement les vérifications de FORVTC : conformité des véhicules, publication des annonces, statuts vérifiés.
      </p>

      {/* Encadré pédagogique */}
      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-bold">💡 Comment ça marche ?</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5">
          <li>Chaque règle légale est <strong>sourcée</strong> (lien vers l&apos;article qui la justifie) — aucune règle n&apos;est inventée.</li>
          <li>Quand vous modifiez une valeur, elle s&apos;applique <strong>immédiatement</strong> à toutes les vérifications.</li>
          <li>Chaque modification est <strong>journalisée</strong> (qui, quand, avant/après) dans le journal d&apos;audit.</li>
          <li>Avant de modifier une règle légale, vérifiez le texte officiel : la loi prime toujours sur la plateforme.</li>
        </ul>
      </div>

      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>

      {categoriesTriees.map(([cat, regles]) => {
        const meta = CATEGORIES[cat] ?? { titre: cat, emoji: "📌", intro: "" };
        return (
          <section key={cat} className="mt-8">
            <h2 className="text-lg font-black">{meta.emoji} {meta.titre}</h2>
            {meta.intro && <p className="mt-0.5 text-sm text-slate-500">{meta.intro}</p>}
            <div className="mt-3 space-y-3">
              {regles.map((r) => {
                const doc = DOC[r.code];
                const valeur = r.valeur as Valeur;
                return (
                  <div key={r.id} className={`card ${!r.actif ? "opacity-60" : ""}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">
                          {doc?.emoji ?? "📌"} {r.libelle}
                          {!r.actif && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500">DÉSACTIVÉE</span>}
                        </p>
                        {/* Valeur actuelle en langage humain */}
                        <p className="mt-1.5 inline-block rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-800">
                          {doc ? doc.lisible(valeur) : JSON.stringify(valeur)}
                        </p>
                      </div>
                    </div>

                    {doc && (
                      <div className="mt-3 space-y-2 text-sm">
                        <p className="text-slate-600">
                          <span className="font-semibold text-slate-800">En clair :</span> {doc.simple}
                        </p>
                        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          <span className="font-semibold">➡️ Effet sur FORVTC :</span> {doc.consequence}
                        </p>
                      </div>
                    )}

                    <p className="mt-2 text-xs text-slate-400">
                      {r.sourceUrl ? (
                        <>📖 Règle légale — <a href={r.sourceUrl} target="_blank" className="font-semibold text-brand-600 hover:underline">voir la source ↗</a></>
                      ) : (
                        "⚙️ Paramètre interne FORVTC (pas une obligation légale)"
                      )}
                      {" "}· mise à jour le {dateFr(r.updatedAt)}
                    </p>

                    {/* Édition avancée repliée : le JSON n'est visible que si on l'ouvre */}
                    <details className="mt-3 border-t border-slate-100 pt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-brand-600">
                        ✏️ Modifier cette règle (mode avancé)
                      </summary>
                      <form action={modifierRegle} className="mt-3 space-y-3">
                        <input type="hidden" name="ruleId" value={r.id} />
                        <div>
                          <label className="label">Valeur technique (format JSON — modifiez uniquement les chiffres)</label>
                          <textarea name="valeur" rows={2} required className="input font-mono text-xs" defaultValue={JSON.stringify(valeur)} />
                          <p className="mt-1 text-[11px] text-slate-400">
                            Exemple : pour passer la puissance minimale à 90 kW, remplacez <code className="rounded bg-slate-100 px-1">&quot;min&quot;: 84</code> par <code className="rounded bg-slate-100 px-1">&quot;min&quot;: 90</code>. Ne touchez pas aux guillemets ni aux accolades.
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" name="actif" defaultChecked={r.actif} /> Règle active
                          </label>
                          <button className="btn-primary">Enregistrer la modification</button>
                        </div>
                      </form>
                    </details>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
