import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { euros } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Antifraude — SIGNAUX calculés sur les données réelles, jamais de score inventé.
 * Chaque signal explique précisément pourquoi il est levé ; la décision reste humaine.
 */
export default async function AdminFraude() {
  await requireUser(["admin"]);
  const db = await getDb();

  // 1. Immatriculations en doublon (même plaque chez ≥ 2 comptes)
  const doublons = (
    await db.execute(sql`
      SELECT v.immatriculation, count(DISTINCT v.owner_id)::int AS nb_comptes,
             array_agg(DISTINCT u.email) AS emails
      FROM vehicles v JOIN users u ON u.id = v.owner_id
      GROUP BY v.immatriculation
      HAVING count(DISTINCT v.owner_id) > 1
    `)
  ).rows as { immatriculation: string; nb_comptes: number; emails: string[] }[];

  // 2. Prix mensuel anormalement bas (< 40 % de la médiane des annonces publiées)
  const medianeRow = (
    await db.execute(sql`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY prix_mois_cents)::int AS mediane
      FROM listings WHERE statut = 'publiee' AND prix_mois_cents IS NOT NULL
    `)
  ).rows[0] as { mediane: number | null };
  const mediane = medianeRow?.mediane ?? null;
  const prixSuspects = mediane
    ? ((
        await db.execute(sql`
          SELECT l.id, l.titre, l.prix_mois_cents, u.email
          FROM listings l
          JOIN vehicles v ON v.id = l.vehicle_id
          JOIN users u ON u.id = v.owner_id
          WHERE l.statut = 'publiee' AND l.prix_mois_cents IS NOT NULL AND l.prix_mois_cents < ${Math.round(mediane * 0.4)}
        `)
      ).rows as { id: string; titre: string; prix_mois_cents: number; email: string }[])
    : [];

  // 3. Téléphone partagé entre plusieurs comptes
  const telPartages = (
    await db.execute(sql`
      SELECT telephone, count(*)::int AS nb, array_agg(email) AS emails
      FROM users WHERE telephone IS NOT NULL AND telephone != '' AND deleted_at IS NULL
      GROUP BY telephone HAVING count(*) > 1
    `)
  ).rows as { telephone: string; nb: number; emails: string[] }[];

  // 4. Comptes très récents avec beaucoup de demandes (< 48 h, ≥ 5 demandes)
  const rafales = (
    await db.execute(sql`
      SELECT u.id, u.email, count(b.id)::int AS nb
      FROM users u JOIN bookings b ON b.driver_id = u.id
      WHERE u.created_at > now() - interval '48 hours'
      GROUP BY u.id, u.email HAVING count(b.id) >= 5
    `)
  ).rows as { id: string; email: string; nb: number }[];

  const total = doublons.length + prixSuspects.length + telPartages.length + rafales.length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/admin" className="text-sm text-brand-600">← Admin</Link>
      <h1 className="mt-2 text-2xl font-black">Signaux antifraude</h1>
      <p className="mt-1 text-sm text-slate-500">
        Signaux calculés en temps réel sur les données de la plateforme. Chaque signal est <strong>explicable</strong> — la décision (suspension, dépublication) reste humaine et journalisée.
      </p>

      {total === 0 && (
        <div className="card mt-6 text-center text-sm text-slate-500">Aucun signal levé actuellement. ✔</div>
      )}

      {doublons.length > 0 && (
        <section className="card mt-5 border-red-200">
          <h2 className="font-bold text-red-700">🚗 Immatriculations en doublon ({doublons.length})</h2>
          <p className="mt-1 text-xs text-slate-500">La même plaque déclarée par plusieurs comptes : un seul peut être le vrai titulaire.</p>
          <ul className="mt-2 space-y-1 text-sm">
            {doublons.map((d) => (
              <li key={d.immatriculation}>
                <strong>{d.immatriculation}</strong> — {d.nb_comptes} comptes : {(d.emails ?? []).join(", ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {prixSuspects.length > 0 && (
        <section className="card mt-5 border-amber-200">
          <h2 className="font-bold text-amber-700">💶 Prix anormalement bas ({prixSuspects.length})</h2>
          <p className="mt-1 text-xs text-slate-500">
            Annonces publiées à moins de 40 % de la médiane ({mediane !== null ? euros(mediane) : "—"}/mois) : appât classique d&apos;arnaque.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {prixSuspects.map((p) => (
              <li key={p.id}>
                <Link href={`/annonce/${p.id}`} className="font-semibold text-brand-600 hover:underline">{p.titre}</Link>{" "}
                — {euros(p.prix_mois_cents)}/mois ({p.email}) · <Link href="/admin/annonces?statut=publiee" className="text-xs text-brand-600">modérer →</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {telPartages.length > 0 && (
        <section className="card mt-5 border-amber-200">
          <h2 className="font-bold text-amber-700">📞 Téléphone partagé ({telPartages.length})</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {telPartages.map((t) => (
              <li key={t.telephone}>
                <strong>{t.telephone}</strong> — {t.nb} comptes : {(t.emails ?? []).join(", ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {rafales.length > 0 && (
        <section className="card mt-5 border-amber-200">
          <h2 className="font-bold text-amber-700">⚡ Rafales de demandes sur compte récent ({rafales.length})</h2>
          <p className="mt-1 text-xs text-slate-500">Compte créé il y a moins de 48 h avec 5 demandes ou plus.</p>
          <ul className="mt-2 space-y-1 text-sm">
            {rafales.map((r) => (
              <li key={r.id}>
                <strong>{r.email}</strong> — {r.nb} demandes · <Link href={`/admin/utilisateurs?q=${encodeURIComponent(r.email)}`} className="text-xs text-brand-600">voir le compte →</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
