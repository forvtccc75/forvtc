"use client";

import { useMemo, useRef, useState } from "react";

type Props = {
  vehicleId: string;
  vehiculeLabel: string;
  action: (formData: FormData) => Promise<void>;
};

const ETAPES = ["L'essentiel", "Vos tarifs", "Vos conditions", "Vérifier & créer"] as const;

/**
 * Création d'annonce en 4 étapes (inspiré Leboncoin) :
 * un seul <form> soumis à la fin — les étapes ne font que montrer/cacher les champs,
 * donc rien n'est perdu en navigant, et la validation HTML native s'applique par étape.
 */
export function AnnonceWizard({ vehicleId, vehiculeLabel, action }: Props) {
  const [etape, setEtape] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // valeurs suivies pour le récap et les contrôles inter-champs
  const [titre, setTitre] = useState("");
  const [prixJour, setPrixJour] = useState("");
  const [prixSemaine, setPrixSemaine] = useState("");
  const [prixMois, setPrixMois] = useState("");
  const [caution, setCaution] = useState("");
  const [dureeMin, setDureeMin] = useState("30");
  const [assurance, setAssurance] = useState("non_incluse");
  const [assuranceDetails, setAssuranceDetails] = useState("");

  const auMoinsUnTarif = [prixJour, prixSemaine, prixMois].some((v) => v.trim() !== "");

  /** Valide les champs visibles de l'étape courante avec l'API native du navigateur. */
  function etapeValide(): boolean {
    const form = formRef.current;
    if (!form) return false;
    const bloc = form.querySelector<HTMLElement>(`[data-etape="${etape}"]`);
    if (!bloc) return true;
    for (const el of Array.from(bloc.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea"))) {
      if (!el.checkValidity()) {
        el.reportValidity();
        return false;
      }
    }
    if (etape === 1 && !auMoinsUnTarif) {
      alert("Renseignez au moins un tarif : jour, semaine ou mois.");
      return false;
    }
    if (etape === 2 && assurance === "conditions_specifiques" && !assuranceDetails.trim()) {
      alert("Précisez les conditions spécifiques d'assurance.");
      return false;
    }
    return true;
  }

  const recap = useMemo(
    () =>
      [
        prixJour && `${prixJour} €/jour`,
        prixSemaine && `${prixSemaine} €/semaine`,
        prixMois && `${prixMois} €/mois`,
      ]
        .filter(Boolean)
        .join(" · "),
    [prixJour, prixSemaine, prixMois]
  );

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(e) => {
        if (etape !== ETAPES.length - 1) {
          e.preventDefault();
          return;
        }
        setEnvoi(true);
      }}
      className="mt-3"
    >
      <input type="hidden" name="vehicleId" value={vehicleId} />

      {/* Barre de progression */}
      <div className="flex items-center gap-1.5">
        {ETAPES.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => i < etape && setEtape(i)}
            className={`h-1.5 flex-1 rounded-full transition ${i <= etape ? "bg-brand-600" : "bg-slate-200"} ${i < etape ? "cursor-pointer" : "cursor-default"}`}
            aria-label={label}
          />
        ))}
      </div>
      <p className="mt-2 text-sm font-bold text-brand-700">
        Étape {etape + 1}/{ETAPES.length} — {ETAPES[etape]}
      </p>

      {/* Étape 1 : l'essentiel */}
      <div data-etape="0" className={etape === 0 ? "mt-4 grid gap-3" : "hidden"}>
        <div>
          <label className="label">Titre de l&apos;annonce *</label>
          <input
            name="titre"
            required
            minLength={8}
            maxLength={120}
            className="input"
            placeholder={`${vehiculeLabel} — entretien inclus — disponible immédiatement`}
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400">{titre.length}/120 — un bon titre = modèle + points forts + ville.</p>
        </div>
        <div>
          <label className="label">Description</label>
          <textarea
            name="description"
            rows={5}
            maxLength={4000}
            className="input"
            placeholder={"Décrivez le véhicule et les conditions :\n• état, entretien, équipements\n• ce qui est inclus (entretien, pneus, assistance…)\n• vos attentes envers le chauffeur"}
          />
        </div>
      </div>

      {/* Étape 2 : tarifs */}
      <div data-etape="1" className={etape === 1 ? "mt-4 grid gap-3 sm:grid-cols-2" : "hidden"}>
        <p className="text-sm text-slate-500 sm:col-span-2">
          Renseignez <strong>au moins un tarif</strong>. La plupart des locations VTC se font au mois.
        </p>
        <div>
          <label className="label">Prix / mois (€) — recommandé</label>
          <input name="prixMois" type="number" step="0.01" min="0" className="input" placeholder="1400" value={prixMois} onChange={(e) => setPrixMois(e.target.value)} />
        </div>
        <div>
          <label className="label">Prix / semaine (€)</label>
          <input name="prixSemaine" type="number" step="0.01" min="0" className="input" placeholder="380" value={prixSemaine} onChange={(e) => setPrixSemaine(e.target.value)} />
        </div>
        <div>
          <label className="label">Prix / jour (€)</label>
          <input name="prixJour" type="number" step="0.01" min="0" className="input" placeholder="60" value={prixJour} onChange={(e) => setPrixJour(e.target.value)} />
        </div>
        <div>
          <label className="label">Caution (€) *</label>
          <input name="caution" type="number" step="0.01" min="0" required className="input" placeholder="1500" value={caution} onChange={(e) => setCaution(e.target.value)} />
          <p className="mt-1 text-xs text-slate-400">La caution n&apos;est jamais un revenu : elle reste séparée du loyer.</p>
        </div>
      </div>

      {/* Étape 3 : conditions */}
      <div data-etape="2" className={etape === 2 ? "mt-4 grid gap-3 sm:grid-cols-2" : "hidden"}>
        <div>
          <label className="label">Durée minimale (jours) *</label>
          <input name="dureeMinJours" type="number" min="1" max="3650" required className="input" value={dureeMin} onChange={(e) => setDureeMin(e.target.value)} />
        </div>
        <div>
          <label className="label">Km inclus / mois</label>
          <input name="kmInclusMois" type="number" min="0" className="input" placeholder="5000" />
        </div>
        <div>
          <label className="label">Prix km supplémentaire (€)</label>
          <input name="prixKmSupp" type="number" step="0.01" min="0" className="input" placeholder="0.15" />
        </div>
        <div>
          <label className="label">Assurance *</label>
          <select name="assurance" required className="input" value={assurance} onChange={(e) => setAssurance(e.target.value)}>
            <option value="non_incluse">Non incluse</option>
            <option value="incluse">Incluse (couvre le transport à titre onéreux)</option>
            <option value="conditions_specifiques">Conditions spécifiques</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Détails assurance {assurance === "conditions_specifiques" && <span className="text-red-600">*</span>}</label>
          <input
            name="assuranceDetails"
            className="input"
            placeholder="Ex. RC incluse ; garantie « titre onéreux » à souscrire par le chauffeur"
            value={assuranceDetails}
            onChange={(e) => setAssuranceDetails(e.target.value)}
          />
          <p className="mt-1 text-xs text-amber-700">
            ⚠️ « Incluse » signifie que le contrat d&apos;assurance mentionne explicitement le <strong>transport de personnes à titre onéreux</strong> — pas seulement « usage professionnel ».
          </p>
        </div>
        <div className="flex items-center gap-4 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="entretienInclus" /> Entretien inclus</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="assistanceIncluse" /> Assistance incluse</label>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Conditions particulières</label>
          <textarea name="conditions" rows={2} maxLength={4000} className="input" placeholder="Ex. restitution avec le plein, lavage hebdomadaire…" />
        </div>
      </div>

      {/* Étape 4 : récap */}
      <div data-etape="3" className={etape === 3 ? "mt-4" : "hidden"}>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <p className="font-bold">{titre || "(sans titre)"}</p>
          <p className="mt-1 text-slate-600">🚗 {vehiculeLabel}</p>
          <p className="mt-1 text-slate-600">💶 {recap || "aucun tarif renseigné"} · caution {caution || "0"} €</p>
          <p className="mt-1 text-slate-600">📆 durée minimale : {dureeMin} jour(s) · 🛡️ assurance : {assurance.replace(/_/g, " ")}</p>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          L&apos;annonce sera créée en <strong>brouillon</strong>. Elle ne sera publiable qu&apos;une fois la carte grise, l&apos;assurance et le contrôle technique <strong>validés par notre équipe</strong>.
        </p>
      </div>

      {/* Navigation */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setEtape((e) => Math.max(0, e - 1))}
          className={`btn-secondary ${etape === 0 ? "invisible" : ""}`}
        >
          ← Retour
        </button>
        {etape < ETAPES.length - 1 ? (
          <button type="button" className="btn-primary" onClick={() => etapeValide() && setEtape((e) => e + 1)}>
            Continuer →
          </button>
        ) : (
          <button type="submit" disabled={envoi} className="btn-primary disabled:opacity-60">
            {envoi ? "Création…" : "Créer l'annonce (brouillon)"}
          </button>
        )}
      </div>
    </form>
  );
}
