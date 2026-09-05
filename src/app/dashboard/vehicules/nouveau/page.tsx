import { requireUser } from "@/lib/auth";
import { creerVehicule } from "@/actions/vehicles";
import { ErrorNote } from "@/components/ui";
import { schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function NouveauVehicule({ searchParams }: { searchParams: { erreur?: string } }) {
  await requireUser(["loueur", "entreprise", "gestionnaire_flotte"]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-black">Ajouter un véhicule</h1>
      <p className="mt-1 text-sm text-slate-500">
        Ces caractéristiques sont <strong>déclaratives</strong> : elles seront confrontées aux documents (carte grise, contrôle technique) lors de la vérification.
      </p>
      <div className="mt-4">
        <ErrorNote msg={searchParams.erreur} />
      </div>
      <form action={creerVehicule} className="card mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="marque">Marque *</label>
          <input id="marque" name="marque" required className="input" placeholder="Toyota" />
        </div>
        <div>
          <label className="label" htmlFor="modele">Modèle *</label>
          <input id="modele" name="modele" required className="input" placeholder="Corolla" />
        </div>
        <div>
          <label className="label" htmlFor="finition">Finition</label>
          <input id="finition" name="finition" className="input" placeholder="Hybride Dynamic" />
        </div>
        <div>
          <label className="label" htmlFor="annee">Année (1re mise en circulation) *</label>
          <input id="annee" name="annee" type="number" min="1990" max={new Date().getFullYear() + 1} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="kilometrage">Kilométrage *</label>
          <input id="kilometrage" name="kilometrage" type="number" min="0" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="energie">Énergie *</label>
          <select id="energie" name="energie" required className="input">
            {schema.energie.enumValues.map((e) => (
              <option key={e} value={e}>{e.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="boite">Boîte *</label>
          <select id="boite" name="boite" required className="input">
            <option value="automatique">Automatique</option>
            <option value="manuelle">Manuelle</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="puissanceKw">Puissance (kW) — 84 kW min. requis pour le VTC</label>
          <input id="puissanceKw" name="puissanceKw" type="number" min="0" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="places">Places (conducteur compris) *</label>
          <input id="places" name="places" type="number" min="2" max="9" required className="input" defaultValue={5} />
        </div>
        <div>
          <label className="label" htmlFor="portes">Portes *</label>
          <input id="portes" name="portes" type="number" min="2" max="6" required className="input" defaultValue={5} />
        </div>
        <div>
          <label className="label" htmlFor="longueurMm">Longueur (mm) — 4500 min. requis</label>
          <input id="longueurMm" name="longueurMm" type="number" className="input" placeholder="4630" />
        </div>
        <div>
          <label className="label" htmlFor="largeurMm">Largeur (mm) — 1700 min. requis</label>
          <input id="largeurMm" name="largeurMm" type="number" className="input" placeholder="1780" />
        </div>
        <div>
          <label className="label" htmlFor="couleur">Couleur</label>
          <input id="couleur" name="couleur" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="immatriculation">Immatriculation (privée, jamais publiée)</label>
          <input id="immatriculation" name="immatriculation" className="input" placeholder="AA-123-BB" />
        </div>
        <div>
          <label className="label" htmlFor="ville">Ville *</label>
          <input id="ville" name="ville" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="codePostal">Code postal *</label>
          <input id="codePostal" name="codePostal" required pattern="\d{5}" className="input" />
        </div>
        <div className="sm:col-span-2">
          <button className="btn-primary w-full">Enregistrer le véhicule</button>
        </div>
      </form>
    </div>
  );
}
