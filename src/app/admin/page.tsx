import Link from "next/link";
import { count, desc, eq, gte, inArray, sum } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { euros, dateFr } from "@/lib/format";

export const dynamic = "force-dynamic";

const ACTIONS_LABELS: Record<string, string> = {
  "user.inscription": "Nouvelle inscription",
  "vehicule.cree": "Véhicule ajouté",
  "document.depose": "Document déposé",
  "document.valide": "Document validé",
  "document.refuse": "Document refusé",
  "annonce.publiee": "Annonce publiée",
  "annonce.depubliee_admin": "Annonce dépubliée (admin)",
  "booking.demande": "Demande de location",
  "booking.acceptee": "Demande acceptée",
  "contrat.genere": "Contrat généré",
  "contrat.signe": "Contrat signé",
  "litige.ouvert": "Litige ouvert",
  "litige.resolu": "Litige résolu",
  "boost.paye_et_active": "Boost payé et activé",
  "conversation.creee": "Conversation ouverte",
};

export default async function Admin() {
  await requireUser(["admin"]);
  const db = await getDb();
  const il7j = new Date(Date.now() - 7 * 86400_000);

  // Compteurs globaux + activité 7 jours (données réelles uniquement)
  const [users] = await db.select({ n: count() }).from(schema.users);
  const [users7j] = await db.select({ n: count() }).from(schema.users).where(gte(schema.users.createdAt, il7j));
  const [vehicles] = await db.select({ n: count() }).from(schema.vehicles);
  const [listingsPub] = await db.select({ n: count() }).from(schema.listings).where(eq(schema.listings.statut, "publiee"));
  const [docsAttente] = await db.select({ n: count() }).from(schema.documents).where(eq(schema.documents.statut, "depose"));
  const [litigesOuverts] = await db.select({ n: count() }).from(schema.disputes).where(eq(schema.disputes.statut, "ouvert"));
  const [litigesAnalyse] = await db.select({ n: count() }).from(schema.disputes).where(eq(schema.disputes.statut, "en_analyse"));
  const [locEnCours] = await db
    .select({ n: count() })
    .from(schema.bookings)
    .where(inArray(schema.bookings.statut, ["requested", "accepted", "payment_pending", "paid", "contract_pending", "signed", "active", "return_pending", "returned"]));
  const [contratsActifs] = await db.select({ n: count() }).from(schema.contracts).where(eq(schema.contracts.statut, "actif"));
  const [boostsCa] = await db
    .select({ total: sum(schema.listingBoosts.prixCents) })
    .from(schema.listingBoosts)
    .where(inArray(schema.listingBoosts.statut, ["actif", "expire"]));
  const [regles] = await db.select({ n: count() }).from(schema.platformRules).where(eq(schema.platformRules.actif, true));

  const litigesActifs = litigesOuverts.n + litigesAnalyse.n;
  const caBoosts = Number(boostsCa.total ?? 0);

  // File de travail : ce qui attend une action admin
  const aFaire = [
    docsAttente.n > 0 && { txt: `${docsAttente.n} document(s) à vérifier`, href: "/admin/documents" },
    litigesOuverts.n > 0 && { txt: `${litigesOuverts.n} litige(s) à prendre en charge`, href: "/admin/litiges" },
    litigesAnalyse.n > 0 && { txt: `${litigesAnalyse.n} litige(s) en cours d'analyse`, href: "/admin/litiges" },
  ].filter(Boolean) as { txt: string; href: string }[];

  // Activité récente réelle (journal d'audit)
  const activite = await db.query.auditLogs.findMany({ orderBy: desc(schema.auditLogs.createdAt), limit: 12 });

  const stats = [
    { label: "Utilisateurs", n: users.n, sub: users7j.n > 0 ? `+${users7j.n} sur 7 j` : undefined, href: "/admin/utilisateurs" },
    { label: "Annonces en ligne", n: listingsPub.n, sub: `${vehicles.n} véhicules`, href: "/admin/annonces" },
    { label: "Locations en cours", n: locEnCours.n, sub: `${contratsActifs.n} contrats actifs`, href: "/admin/locations" },
    { label: "Revenus boosts", n: euros(caBoosts), sub: "paiements Stripe confirmés", href: null },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-black">Back-office</h1>
      <p className="mt-1 text-sm text-slate-500">Chiffres réels uniquement — aucune statistique fictive.</p>

      {/* File de travail prioritaire */}
      {aFaire.length > 0 && (
        <div className="animate-in mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">⚡ Actions en attente</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {aFaire.map((a) => (
              <Link key={a.txt} href={a.href} className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-100">
                {a.txt} →
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((c) => {
          const inner = (
            <>
              <p className="text-3xl font-black">{c.n}</p>
              <p className="mt-0.5 text-sm font-medium text-slate-600">{c.label}</p>
              {c.sub && <p className="text-xs text-slate-400">{c.sub}</p>}
            </>
          );
          return c.href ? (
            <Link key={c.label} href={c.href} className="card transition hover:shadow-md">{inner}</Link>
          ) : (
            <div key={c.label} className="card">{inner}</div>
          );
        })}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Modules */}
        <section>
          <h2 className="font-bold">Modules</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {[
              { href: "/admin/documents", t: "Vérification documentaire", d: `${docsAttente.n} en attente`, urgent: docsAttente.n > 0 },
              { href: "/admin/litiges", t: "Centre de résolution", d: `${litigesActifs} litige(s) actif(s)`, urgent: litigesOuverts.n > 0 },
              { href: "/admin/annonces", t: "Annonces", d: "Modération, dépublication" },
              { href: "/admin/locations", t: "Locations", d: "Suivi des dossiers complets" },
              { href: "/admin/utilisateurs", t: "Utilisateurs", d: "Recherche, suspension" },
              { href: "/admin/contrats", t: "Modèles de contrats", d: "Templates versionnés" },
              { href: "/admin/regles", t: "Règles réglementaires", d: `${regles.n} règles sourcées` },
              { href: "/admin/fraude", t: "Signaux antifraude", d: "Doublons, prix aberrants, rafales" },
              { href: "/admin/audit", t: "Journal d'audit", d: "Traçabilité complète" },
            ].map((m) => (
              <Link key={m.href} href={m.href} className={`card !p-4 transition hover:shadow-md ${m.urgent ? "border-amber-300" : ""}`}>
                <p className="text-sm font-bold">{m.t}</p>
                <p className={`mt-0.5 text-xs ${m.urgent ? "font-semibold text-amber-700" : "text-slate-500"}`}>{m.d}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* Activité récente réelle */}
        <section>
          <h2 className="font-bold">Activité récente</h2>
          <div className="card mt-3 !p-0">
            {activite.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Aucune activité pour l&apos;instant.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {activite.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="font-medium">{ACTIONS_LABELS[a.action] ?? a.action}</span>
                    <span className="shrink-0 text-xs text-slate-400">{dateFr(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
