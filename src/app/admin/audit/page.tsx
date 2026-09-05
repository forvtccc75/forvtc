import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminAudit() {
  await requireUser(["admin"]);
  const db = await getDb();
  const logs = await db.query.auditLogs.findMany({ orderBy: desc(schema.auditLogs.createdAt), limit: 100 });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-black">Journal d&apos;audit</h1>
      <p className="mt-1 text-sm text-slate-500">100 dernières actions journalisées.</p>
      <div className="mt-5">
        {logs.length === 0 ? (
          <Empty titre="Aucune action journalisée pour l'instant." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-400">
                <th className="py-2 pr-3">Horodatage</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3">Cible</th>
                <th className="py-2">Acteur / IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3 text-xs text-slate-500">{new Date(l.createdAt).toLocaleString("fr-FR")}</td>
                  <td className="py-1.5 pr-3 font-mono text-xs">{l.action}</td>
                  <td className="py-1.5 pr-3 font-mono text-xs">{l.cibleType ? `${l.cibleType}:${l.cibleId?.slice(0, 8)}` : "—"}</td>
                  <td className="py-1.5 font-mono text-xs">{l.acteurId?.slice(0, 8) ?? "—"} {l.ip ? `· ${l.ip}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
