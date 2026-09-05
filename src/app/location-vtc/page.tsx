import Link from "next/link";
import type { Metadata } from "next";
import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { VILLES_SEO } from "@/lib/seo-villes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Location VTC — louer une voiture pour chauffeur VTC | FORVTC",
  description:
    "Trouvez une voiture adaptée à l'activité VTC partout en France : loueurs aux documents vérifiés, prix et caution transparents, contrat automatique, signature électronique et état des lieux digital.",
  alternates: { canonical: "/location-vtc" },
};

export default async function LocationVtc() {
  const db = await getDb();
  const [{ nb }] = await db.select({ nb: count() }).from(schema.listings).where(eq(schema.listings.statut, "publiee"));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-black">Location de voiture pour chauffeur VTC</h1>
      <p className="mt-3 max-w-3xl text-slate-600">
        FORVTC met en relation les chauffeurs VTC et les loueurs de véhicules avec un cadre complet :
        vérification documentaire réelle, analyse de compatibilité VTC selon les règles en vigueur,
        contrat généré depuis les données réelles de la réservation, signature électronique,
        état des lieux contradictoire et centre de résolution des litiges.
      </p>
      <p className="mt-2 text-sm text-slate-500">{nb} annonce{nb > 1 ? "s" : ""} publiée{nb > 1 ? "s" : ""} actuellement — compteur réel, aucune annonce fictive.</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/recherche" className="btn-primary">RECHERCHER UNE VOITURE</Link>
        <Link href="/devenir-chauffeur-vtc" className="btn-secondary">Devenir chauffeur VTC</Link>
        <Link href="/inscription?role=loueur" className="btn-secondary">Louer mon véhicule</Link>
      </div>

      <h2 className="mt-12 text-xl font-bold">Location de voiture VTC par ville et département</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {VILLES_SEO.map((v) => (
          <Link key={v.slug} href={`/location-voiture-vtc-${v.slug}`} className="card block transition hover:shadow-md">
            <p className="font-bold">{v.nom}</p>
            <p className="mt-1 text-xs text-slate-500">Location voiture VTC {v.nom} →</p>
          </Link>
        ))}
      </div>

      <section className="mt-12 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <h2 className="font-bold">Ce qu&apos;il faut savoir avant de louer</h2>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>La location d&apos;un véhicule ne confère pas le droit d&apos;exercer comme VTC : carte professionnelle et inscription REVTC de l&apos;exploitant restent indispensables.</li>
          <li>Vérifiez toujours que l&apos;assurance couvre explicitement le transport de personnes à titre onéreux — une RC standard ne suffit pas.</li>
          <li>Le véhicule doit respecter les critères réglementaires (≥ 84 kW, ≥ 4 portes, ≥ 4,50 m × 1,70 m, ancienneté maximale pour les thermiques, contrôle technique annuel).</li>
          <li>Pour le registre des exploitants, un véhicule loué requiert un contrat de plus de 6 mois, à défaut une garantie financière par véhicule.</li>
        </ul>
      </section>
    </div>
  );
}
