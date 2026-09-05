import { euros } from "./format";

/**
 * CALCULATEUR — uniquement à partir des tarifs réels renseignés par le loueur.
 * Décomposition déterministe et explicable : mois entiers → semaines entières → jours,
 * avec prorata transparent quand une granularité manque. Aucune estimation cachée.
 */
export type Ligne = { label: string; montantCents: number };
export type Devis = {
  lignes: Ligne[];
  totalCents: number;
  moyenneJourCents: number;
  jours: number;
};

type Tarifs = {
  prixJourCents: number | null;
  prixSemaineCents: number | null;
  prixMoisCents: number | null;
};

export function calculerDevis(t: Tarifs, jours: number): Devis | null {
  if (jours < 1) return null;
  if (t.prixJourCents === null && t.prixSemaineCents === null && t.prixMoisCents === null) return null;

  const lignes: Ligne[] = [];
  let reste = jours;
  let total = 0;

  if (t.prixMoisCents !== null && reste >= 30) {
    const n = Math.floor(reste / 30);
    const m = n * t.prixMoisCents;
    lignes.push({ label: `${n} mois × ${euros(t.prixMoisCents)}`, montantCents: m });
    total += m;
    reste -= n * 30;
  }
  if (t.prixSemaineCents !== null && reste >= 7) {
    const n = Math.floor(reste / 7);
    const m = n * t.prixSemaineCents;
    lignes.push({ label: `${n} semaine${n > 1 ? "s" : ""} × ${euros(t.prixSemaineCents)}`, montantCents: m });
    total += m;
    reste -= n * 7;
  }
  if (reste > 0) {
    if (t.prixJourCents !== null) {
      const m = reste * t.prixJourCents;
      lignes.push({ label: `${reste} jour${reste > 1 ? "s" : ""} × ${euros(t.prixJourCents)}`, montantCents: m });
      total += m;
    } else if (t.prixSemaineCents !== null) {
      const m = Math.round((t.prixSemaineCents / 7) * reste);
      lignes.push({ label: `${reste} jour${reste > 1 ? "s" : ""} au prorata du tarif semaine`, montantCents: m });
      total += m;
    } else if (t.prixMoisCents !== null) {
      const m = Math.round((t.prixMoisCents / 30) * reste);
      lignes.push({ label: `${reste} jour${reste > 1 ? "s" : ""} au prorata du tarif mois`, montantCents: m });
      total += m;
    } else {
      return null;
    }
  }

  return { lignes, totalCents: total, moyenneJourCents: Math.round(total / jours), jours };
}
