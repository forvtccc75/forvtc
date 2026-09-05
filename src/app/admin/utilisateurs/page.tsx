import Link from "next/link";
import { desc, eq, ilike, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { basculerSuspension } from "@/actions/admin";
import { VerifBadge, Empty, ErrorNote, OkNote } from "@/components/ui";
import { dateFr } from "@/lib/format";

export const dynamic = "force-dynamic";

const ROLES: Record<string, string> = {
  chauffeur: "Chauffeur",
  loueur: "Loueur",
  entreprise: "Entreprise",
  gestionnaire_flotte: "Gestionnaire de flotte",
  admin: "Admin",
};

export default async function AdminUtilisateurs({
  searchParams,
}: {
  searchParams: { q?: string; role?: string; erreur?: string; ok?: string };
}) {
  await requireUser(["admin"]);
  const db = await getDb();

  const q = searchParams.q?.trim();
  const role = searchParams.role && Object.keys(ROLES).includes(searchParams.role) ? searchParams.role : null;

  const users = await db.query.users.findMany({
    where: (u, { and: et }) =>
      et(
        q ? or(ilike(u.email, `%${q}%`), ilike(u.nom, `%${q}%`), ilike(u.prenom, `%${q}%`)) : undefined,
        role ? eq(u.role, role as (typeof schema.userRole.enumValues)[number]) : undefined
      ),
    orderBy: desc(schema.users.createdAt),
    limit: 200,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/admin" className="text-sm text-brand-600">← Back-office</Link>
      <h1 className="mt-2 text-2xl font-black">Utilisateurs</h1>
      <div className="mt-3 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>

      {/* Recherche + filtre rôle */}
      <form className="mt-4 flex flex-wrap gap-2" method="get">
        <input name="q" defaultValue={q ?? ""} placeholder="Rechercher nom ou email…" className="input max-w-xs" />
        <select name="role" defaultValue={role ?? ""} className="input max-w-48">
          <option value="">Tous les rôles</option>
          {Object.entries(ROLES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button className="btn-primary">Filtrer</button>
        {(q || role) && <Link href="/admin/utilisateurs" className="btn-secondary">Réinitialiser</Link>}
      </form>

      <div className="mt-5 space-y-2">
        {users.length === 0 ? (
          <Empty titre="Aucun utilisateur ne correspond." />
        ) : (
          users.map((u) => (
            <div key={u.id} className="card flex flex-wrap items-center justify-between gap-3 !py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{u.prenom} {u.nom}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{ROLES[u.role] ?? u.role}</span>
                  <VerifBadge statut={u.statutVerification} />
                  {u.suspendu && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Suspendu</span>}
                </div>
                <p className="text-sm text-slate-500">{u.email}{u.telephone && <> · {u.telephone}</>} · inscrit le {dateFr(u.createdAt)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {(u.role === "loueur" || u.role === "entreprise") && (
                  <Link href={`/loueur/${u.id}`} className="btn-secondary !min-h-[34px] !px-3 !py-1 text-xs">Profil public</Link>
                )}
                {u.role === "chauffeur" && (
                  <Link href={`/chauffeur/${u.id}`} className="btn-secondary !min-h-[34px] !px-3 !py-1 text-xs">Profil public</Link>
                )}
                {u.role !== "admin" && (
                  <form action={basculerSuspension}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button className={`btn-secondary !min-h-[34px] !px-3 !py-1 text-xs ${u.suspendu ? "" : "!border-red-300 text-red-600"}`}>
                      {u.suspendu ? "Réactiver" : "Suspendre"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
