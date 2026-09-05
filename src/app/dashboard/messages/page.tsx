import Link from "next/link";
import { desc, eq, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { Empty } from "@/components/ui";
import { dateFr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Messages() {
  const user = await requireUser();
  const db = await getDb();
  const convs = await db.query.conversations.findMany({
    where: or(eq(schema.conversations.participantA, user.id), eq(schema.conversations.participantB, user.id)),
    orderBy: desc(schema.conversations.createdAt),
  });

  const otherIds = Array.from(new Set(convs.map((c) => (c.participantA === user.id ? c.participantB : c.participantA))));
  const others = otherIds.length ? await db.query.users.findMany({ where: inArray(schema.users.id, otherIds) }) : [];
  const oMap = new Map(others.map((o) => [o.id, o]));
  const listingIds = Array.from(new Set(convs.map((c) => c.listingId).filter(Boolean))) as string[];
  const listings = listingIds.length ? await db.query.listings.findMany({ where: inArray(schema.listings.id, listingIds) }) : [];
  const lMap = new Map(listings.map((l) => [l.id, l]));

  const lastByConv = new Map<string, { contenu: string; createdAt: Date; nonLu: boolean }>();
  if (convs.length) {
    const msgs = await db.query.messages.findMany({
      where: inArray(schema.messages.conversationId, convs.map((c) => c.id)),
      orderBy: desc(schema.messages.createdAt),
    });
    for (const m of msgs) {
      if (!lastByConv.has(m.conversationId))
        lastByConv.set(m.conversationId, { contenu: m.contenu, createdAt: m.createdAt, nonLu: !m.lu && m.senderId !== user.id });
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-black">Messages</h1>
      <div className="mt-4 space-y-2">
        {convs.length === 0 ? (
          <Empty
            titre="Aucune conversation."
            sous="Contactez un loueur depuis une annonce pour démarrer un échange."
            cta="Voir les annonces"
            href="/recherche"
          />
        ) : (
          convs.map((c) => {
            const other = oMap.get(c.participantA === user.id ? c.participantB : c.participantA);
            const l = c.listingId ? lMap.get(c.listingId) : null;
            const last = lastByConv.get(c.id);
            return (
              <Link key={c.id} href={`/dashboard/messages/${c.id}`} className="card block py-3 transition hover:shadow-md">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">
                    {other ? `${other.prenom} ${other.nom.charAt(0)}.` : "—"}
                    {l && <span className="ml-2 text-xs font-normal text-slate-500">· {l.titre}</span>}
                  </p>
                  {last?.nonLu && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">Non lu</span>}
                </div>
                {last && <p className="mt-1 truncate text-sm text-slate-500">{last.contenu}</p>}
                {last && <p className="text-xs text-slate-400">{dateFr(last.createdAt)}</p>}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
