"use client";

import { useState } from "react";
import { inscription } from "@/actions/auth";

/**
 * Formulaire d'inscription dynamique :
 * - « Raison sociale » et « SIRET » n'apparaissent QUE pour un loueur professionnel.
 * - Un particulier ou un chauffeur ne voit jamais ces champs.
 */
export function InscriptionForm({ roleInitial }: { roleInitial: "chauffeur" | "loueur" }) {
  const [role, setRole] = useState<"chauffeur" | "loueur">(roleInitial);
  const [typeLoueur, setTypeLoueur] = useState<"particulier" | "professionnel">("particulier");

  return (
    <form action={inscription} className="card mt-4 space-y-4">
      <div>
        <label className="label">Je suis</label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 p-3 text-sm font-medium has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
            <input type="radio" name="role" value="chauffeur" checked={role === "chauffeur"} onChange={() => setRole("chauffeur")} />
            Chauffeur VTC
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 p-3 text-sm font-medium has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
            <input type="radio" name="role" value="loueur" checked={role === "loueur"} onChange={() => setRole("loueur")} />
            Propriétaire / Loueur
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="prenom">Prénom</label>
          <input id="prenom" name="prenom" required className="input" autoComplete="given-name" />
        </div>
        <div>
          <label className="label" htmlFor="nom">Nom</label>
          <input id="nom" name="nom" required className="input" autoComplete="family-name" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required className="input" autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="telephone">Téléphone (optionnel)</label>
        <input id="telephone" name="telephone" className="input" autoComplete="tel" />
      </div>
      <div>
        <label className="label" htmlFor="password">Mot de passe (10 caractères min.)</label>
        <input id="password" name="password" type="password" minLength={10} required className="input" autoComplete="new-password" />
      </div>

      {role === "loueur" && (
        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold text-slate-500">Votre profil de loueur</legend>
          <div>
            <label className="label" htmlFor="typeLoueur">Vous louez en tant que</label>
            <select
              id="typeLoueur"
              name="typeLoueur"
              className="input"
              value={typeLoueur}
              onChange={(e) => setTypeLoueur(e.target.value as "particulier" | "professionnel")}
            >
              <option value="particulier">Particulier</option>
              <option value="professionnel">Professionnel (société, auto-entrepreneur)</option>
            </select>
          </div>

          {typeLoueur === "professionnel" && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="raisonSociale">Raison sociale</label>
                <input id="raisonSociale" name="raisonSociale" className="input" placeholder="Ex. : SARL Martin Location" />
              </div>
              <div>
                <label className="label" htmlFor="siret">SIRET (14 chiffres)</label>
                <input id="siret" name="siret" className="input" inputMode="numeric" placeholder="123 456 789 00012" />
                <p className="mt-1 text-[11px] text-slate-500">
                  Vérifié automatiquement au répertoire Sirene (INSEE). Le rattachement à votre compte
                  reste ensuite validé par notre équipe.
                </p>
              </div>
            </div>
          )}
        </fieldset>
      )}

      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input type="checkbox" name="cgu" required className="mt-0.5" />
        <span>
          J&apos;accepte les conditions d&apos;utilisation et la politique de confidentialité (RGPD : vos
          documents restent privés, votre compte est exportable et supprimable).
        </span>
      </label>
      <button className="btn-primary w-full">Créer mon compte</button>
    </form>
  );
}
