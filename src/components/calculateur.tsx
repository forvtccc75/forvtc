"use client";

import { useMemo, useState } from "react";

/**
 * CALCULATEUR côté client — mêmes règles que src/lib/pricing.ts (décomposition
 * mois → semaines → jours, prorata affiché). Le montant faisant foi est recalculé
 * CÔTÉ SERVEUR au moment de la demande.
 */
type Props = {
  prixJourCents: number | null;
  prixSemaineCents: number | null;
  prixMoisCents: number | null;
  cautionCents: number;
  kmInclusMois: number | null;
  prixKmSuppCents: number | null;
  dureeMinJours: number;
};

const eur = (c: number) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export function Calculateur(p: Props) {
  const [jours, setJours] = useState(Math.max(30, p.dureeMinJours));
  const [kmMois, setKmMois] = useState(p.kmInclusMois ?? 3000);

  const devis = useMemo(() => {
    if (jours < 1) return null;
    const lignes: { label: string; m: number }[] = [];
    let reste = jours;
    let total = 0;
    if (p.prixMoisCents !== null && reste >= 30) {
      const n = Math.floor(reste / 30);
      lignes.push({ label: `${n} mois × ${eur(p.prixMoisCents)}`, m: n * p.prixMoisCents });
      total += n * p.prixMoisCents;
      reste -= n * 30;
    }
    if (p.prixSemaineCents !== null && reste >= 7) {
      const n = Math.floor(reste / 7);
      lignes.push({ label: `${n} semaine${n > 1 ? "s" : ""} × ${eur(p.prixSemaineCents)}`, m: n * p.prixSemaineCents });
      total += n * p.prixSemaineCents;
      reste -= n * 7;
    }
    if (reste > 0) {
      if (p.prixJourCents !== null) {
        lignes.push({ label: `${reste} jour${reste > 1 ? "s" : ""} × ${eur(p.prixJourCents)}`, m: reste * p.prixJourCents });
        total += reste * p.prixJourCents;
      } else if (p.prixSemaineCents !== null) {
        const m = Math.round((p.prixSemaineCents / 7) * reste);
        lignes.push({ label: `${reste} j au prorata semaine`, m });
        total += m;
      } else if (p.prixMoisCents !== null) {
        const m = Math.round((p.prixMoisCents / 30) * reste);
        lignes.push({ label: `${reste} j au prorata mois`, m });
        total += m;
      } else return null;
    }

    // Estimation km supplémentaires : purement indicative, basée sur la saisie du chauffeur
    let kmSupp = 0;
    if (p.kmInclusMois !== null && p.prixKmSuppCents !== null && kmMois > p.kmInclusMois) {
      const mois = jours / 30;
      kmSupp = Math.round((kmMois - p.kmInclusMois) * mois * p.prixKmSuppCents);
    }
    return { lignes, total, kmSupp, moyenneJour: Math.round((total + kmSupp) / jours) };
  }, [jours, kmMois, p]);

  return (
    <div className="card">
      <h2 className="font-bold">Calculer mon prix</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="calc-jours">Durée (jours)</label>
          <input id="calc-jours" type="number" min={1} max={730} value={jours}
            onChange={(e) => setJours(Math.max(1, +e.target.value || 1))} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="calc-km">Km prévus / mois</label>
          <input id="calc-km" type="number" min={0} step={100} value={kmMois}
            onChange={(e) => setKmMois(Math.max(0, +e.target.value || 0))} className="input" />
        </div>
      </div>
      {devis ? (
        <div className="mt-3 space-y-1 text-sm">
          {devis.lignes.map((l) => (
            <div key={l.label} className="flex justify-between text-slate-600">
              <span>{l.label}</span><span>{eur(l.m)}</span>
            </div>
          ))}
          {devis.kmSupp > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Km au-delà du forfait (estimation selon votre saisie)</span><span>{eur(devis.kmSupp)}</span>
            </div>
          )}
          <hr className="my-2" />
          <div className="flex justify-between font-bold">
            <span>COÛT TOTAL LOCATION</span><span>{eur(devis.total + devis.kmSupp)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Coût moyen / jour</span><span>{eur(devis.moyenneJour)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Coût moyen / mois (30 j)</span><span>{eur(devis.moyenneJour * 30)}</span>
          </div>
          <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
            <div className="flex justify-between"><span>Caution (bloquée, restituée en fin de location sauf retenue justifiée)</span><span className="font-semibold">{eur(p.cautionCents)}</span></div>
            <p className="mt-1">La caution est distincte du loyer et n&apos;est jamais un revenu de la plateforme. Frais de plateforme : affichés avant paiement dès l&apos;activation du module de paiement.</p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Tarifs incomplets sur cette annonce.</p>
      )}
    </div>
  );
}
