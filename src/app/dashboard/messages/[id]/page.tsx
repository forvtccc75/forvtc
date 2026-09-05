import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { envoyerMessage, marquerLu } from "@/actions/messages";
import { ErrorNote, OkNote } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Conversation({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erreur?: string; ok?: string };
}) {
  const user = await requireUser();
  const db = await getDb();
  const conv = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, params.id) });
  if (!conv || (conv.participantA !== user.id && conv.participantB !== user.id)) notFound();

  const otherId = conv.participantA === user.id ? conv.participantB : conv.participantA;
  const other = await db.query.users.findFirst({ where: eq(schema.users.id, otherId) });
  const listing = conv.listingId ? await db.query.listings.findFirst({ where: eq(schema.listings.id, conv.listingId) }) : null;
  const msgs = await db.query.messages.findMany({
    where: eq(schema.messages.conversationId, conv.id),
    orderBy: asc(schema.messages.createdAt),
  });
  await marquerLu(conv.id, user.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">{other ? `${other.prenom} ${other.nom.charAt(0)}.` : "Conversation"}</h1>
          {listing && (
            <Link href={`/annonce/${listing.id}`} className="text-sm font-semibold text-brand-600 hover:underline">
              {listing.titre} →
            </Link>
          )}
        </div>
        <Link href="/dashboard/messages" className="text-sm text-slate-500 hover:underline">← Toutes les conversations</Link>
      </div>
      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>

      <div className="card mt-4 max-h-[50vh] space-y-3 overflow-y-auto">
        {msgs.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Aucun message pour l&apos;instant — écrivez le premier.</p>
        ) : (
          msgs.map((m) => (
            <div key={m.id} className={`flex ${m.senderId === user.id ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${m.senderId === user.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                <p className="whitespace-pre-line">{m.contenu}</p>
                <p className={`mt-1 text-[10px] ${m.senderId === user.id ? "text-brand-100" : "text-slate-400"}`}>
                  {new Date(m.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <form action={envoyerMessage} className="mt-3 flex gap-2">
        <input type="hidden" name="conversationId" value={conv.id} />
        <input name="contenu" required maxLength={4000} placeholder="Votre message…" className="input flex-1" autoComplete="off" />
        <button className="btn-primary shrink-0">Envoyer</button>
      </form>
      <p className="mt-2 text-xs text-slate-400">
        Les échanges restent sur la plateforme : c&apos;est ce qui permet la protection par contrat, paiement sécurisé et centre de résolution des litiges.
      </p>
    </div>
  );
}
