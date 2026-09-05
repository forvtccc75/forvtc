import Link from "next/link";
import { eq, count } from "drizzle-orm";
import { getDb, schema } from "@/db";

// Rendu à la demande : compteur d'annonces réel, jamais d'accès base au build
export const dynamic = "force-dynamic";

export default async function Home() {
  const db = await getDb();
  const [{ nb }] = await db
    .select({ nb: count() })
    .from(schema.listings)
    .where(eq(schema.listings.statut, "publiee"));

  return (
    <div>
      <section className="bg-gradient-to-b from-brand-900 to-brand-700 text-white">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">TROUVEZ VOTRE VOITURE VTC</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-brand-100">
            Comparez les véhicules, les prix et les conditions proposés par des loueurs vérifiés.
          </p>
          <form action="/recherche" className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-2 rounded-2xl bg-white p-3 text-left shadow-xl sm:grid-cols-4">
            <div>
              <label className="label text-slate-500">Où ?</label>
              <input name="ville" placeholder="Ville ou code postal" className="input" />
            </div>
            <div>
              <label className="label text-slate-500">Budget max / mois</label>
              <input name="budgetMois" type="number" min="0" placeholder="€" className="input" />
            </div>
            <div>
              <label className="label text-slate-500">Énergie</label>
              <select name="energie" className="input">
                <option value="">Toutes</option>
                <option value="hybride">Hybride</option>
                <option value="hybride_rechargeable">Hybride rechargeable</option>
                <option value="electrique">Électrique</option>
                <option value="essence">Essence</option>
                <option value="diesel">Diesel</option>
              </select>
            </div>
            <div className="flex items-end">
              <button className="btn-primary w-full">RECHERCHER</button>
            </div>
          </form>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-brand-100">
            <span>{nb} annonce{nb > 1 ? "s" : ""} publiée{nb > 1 ? "s" : ""} actuellement</span>
            <Link href="/inscription?role=loueur" className="rounded-lg border border-white/40 px-4 py-2 font-semibold text-white hover:bg-white/10">
              LOUER MON VÉHICULE
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-5 sm:grid-cols-3">
          {[
            ["Vérification réelle", "Documents examinés un par un : carte grise, assurance, contrôle technique, carte professionnelle VTC. Rien n'est « vérifié » sans vérification réelle."],
            ["Transparence des coûts", "Prix, caution, kilométrage inclus et statut de l'assurance affichés clairement. Une assurance n'est indiquée « incluse » que si elle l'est réellement."],
            ["Conformité VTC", "Chaque véhicule est analysé selon les critères réglementaires en vigueur (puissance, dimensions, âge, contrôle technique) — avec le statut exact de chaque vérification."],
          ].map(([t, s]) => (
            <div key={t} className="card">
              <h3 className="font-bold">{t}</h3>
              <p className="mt-2 text-sm text-slate-600">{s}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Important :</strong> louer un véhicule ne confère pas le droit d&apos;exercer comme chauffeur VTC.
          L&apos;activité exige notamment la carte professionnelle VTC, l&apos;inscription au registre des exploitants (REVTC)
          et une assurance couvrant explicitement le transport de personnes à titre onéreux.
        </p>
      </section>
    </div>
  );
}
