import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * MOTEUR DE COMPATIBILITÉ VTC — Règle de vérité :
 * - "non_valide" : au moins un critère déclaré échoue aux règles sourcées.
 * - "verification_necessaire" : caractéristiques déclarées conformes, mais documents non validés.
 * - "compatible_verifie" : critères conformes ET documents clés validés par un vérificateur.
 * On n'affiche JAMAIS "compatible VTC" sur la seule base des déclarations.
 */

export type RuleResult = {
  code: string;
  libelle: string;
  statut: "ok" | "echec" | "inconnu";
  detail: string;
  sourceUrl: string | null;
};

export type CompatResult = {
  global: "compatible_verifie" | "verification_necessaire" | "non_valide";
  resultats: RuleResult[];
  docsValides: boolean;
  docsManquants: string[];
};

type Vehicle = typeof schema.vehicles.$inferSelect;

const DOCS_REQUIS: { type: "carte_grise" | "assurance_vehicule" | "controle_technique"; label: string }[] = [
  { type: "carte_grise", label: "Carte grise" },
  { type: "assurance_vehicule", label: "Assurance véhicule (transport de personnes à titre onéreux)" },
  { type: "controle_technique", label: "Contrôle technique (annuel)" },
];

export async function evaluerCompatibilite(vehicle: Vehicle): Promise<CompatResult> {
  const db = await getDb();
  const rules = await db.query.platformRules.findMany({
    where: eq(schema.platformRules.actif, true),
  });
  const resultats: RuleResult[] = [];

  const num = (cond: boolean | null, okMsg: string, koMsg: string, unknownMsg: string) =>
    cond === null
      ? { statut: "inconnu" as const, detail: unknownMsg }
      : cond
        ? { statut: "ok" as const, detail: okMsg }
        : { statut: "echec" as const, detail: koMsg };

  for (const r of rules) {
    const v = r.valeur as Record<string, unknown>;
    let res: { statut: RuleResult["statut"]; detail: string } | null = null;

    switch (r.code) {
      case "VEH_PUISSANCE_MIN_KW":
        res = num(
          vehicle.puissanceKw === null ? null : vehicle.puissanceKw >= (v.min as number),
          `${vehicle.puissanceKw} kW déclarés (≥ ${v.min} kW)`,
          `${vehicle.puissanceKw} kW déclarés — minimum ${v.min} kW`,
          "Puissance non renseignée"
        );
        break;
      case "VEH_PORTES_MIN":
        res = num(vehicle.portes >= (v.min as number), `${vehicle.portes} portes`, `${vehicle.portes} portes — minimum ${v.min}`, "");
        break;
      case "VEH_PLACES_MIN":
        res = num(vehicle.places >= (v.min as number), `${vehicle.places} places`, `${vehicle.places} places — minimum ${v.min}`, "");
        break;
      case "VEH_PLACES_MAX":
        res = num(vehicle.places <= (v.max as number), `${vehicle.places} places`, `${vehicle.places} places — maximum ${v.max}`, "");
        break;
      case "VEH_LONGUEUR_MIN_MM":
        res = num(
          vehicle.longueurMm === null ? null : vehicle.longueurMm >= (v.min as number),
          `${((vehicle.longueurMm ?? 0) / 1000).toFixed(2)} m`,
          `Longueur déclarée inférieure à ${(v.min as number) / 1000} m`,
          "Longueur non renseignée"
        );
        break;
      case "VEH_LARGEUR_MIN_MM":
        res = num(
          vehicle.largeurMm === null ? null : vehicle.largeurMm >= (v.min as number),
          `${((vehicle.largeurMm ?? 0) / 1000).toFixed(2)} m`,
          `Largeur déclarée inférieure à ${(v.min as number) / 1000} m`,
          "Largeur non renseignée"
        );
        break;
      case "VEH_AGE_MAX_THERMIQUE": {
        const exemptions = (v.exemptions as string[]) ?? [];
        if (exemptions.includes(vehicle.energie)) {
          res = { statut: "ok", detail: "Véhicule électrique/hybride : pas de limite d'âge (selon la règle en vigueur)" };
        } else {
          const age = new Date().getFullYear() - vehicle.annee;
          res = num(
            age <= (v.maxAnnees as number),
            `Année ${vehicle.annee} (approximation par année modèle — la date de 1re immatriculation fait foi)`,
            `Véhicule thermique de ${age} ans — maximum ${v.maxAnnees} ans`,
            ""
          );
        }
        break;
      }
      default:
        // Règles documentaires/assurance : évaluées via les documents ci-dessous.
        continue;
    }
    if (res) resultats.push({ code: r.code, libelle: r.libelle, statut: res.statut, detail: res.detail, sourceUrl: r.sourceUrl });
  }

  // Documents clés du véhicule : validés par un vérificateur humain uniquement.
  const docs = await db.query.documents.findMany({
    where: and(eq(schema.documents.vehicleId, vehicle.id)),
  });
  const docsManquants: string[] = [];
  for (const d of DOCS_REQUIS) {
    const ok = docs.some((x) => x.type === d.type && x.statut === "valide" && (!x.dateExpiration || new Date(x.dateExpiration) > new Date()));
    const depose = docs.some((x) => x.type === d.type);
    resultats.push({
      code: `DOC_${d.type.toUpperCase()}`,
      libelle: d.label,
      statut: ok ? "ok" : "inconnu",
      detail: ok ? "Validé par un vérificateur" : depose ? "Déposé — en attente de vérification" : "Document manquant",
      sourceUrl: null,
    });
    if (!ok) docsManquants.push(d.label);
  }
  const docsValides = docsManquants.length === 0;

  const echec = resultats.some((r) => r.statut === "echec");
  const global = echec ? "non_valide" : docsValides && resultats.every((r) => r.statut === "ok") ? "compatible_verifie" : "verification_necessaire";
  return { global, resultats, docsValides, docsManquants };
}
