"use server";

import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

function err(path: string, m: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}erreur=${encodeURIComponent(m)}`);
}

/** Ouvre (ou retrouve) une conversation liée à une annonce publiée. */
export async function contacterLoueur(formData: FormData): Promise<void> {
  const user = await requireUser(["chauffeur"]);
  const listingId = String(formData.get("listingId") ?? "");
  const back = `/annonce/${listingId}`;

  const db = await getDb();
  const listing = await db.query.listings.findFirst({
    where: and(eq(schema.listings.id, listingId), eq(schema.listings.statut, "publiee")),
  });
  if (!listing) err(back, "Annonce introuvable.");
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;
  if (vehicle.ownerId === user.id) err(back, "Vous êtes le loueur de cette annonce.");

  let conv = await db.query.conversations.findFirst({
    where: and(
      eq(schema.conversations.listingId, listing.id),
      or(
        and(eq(schema.conversations.participantA, user.id), eq(schema.conversations.participantB, vehicle.ownerId)),
        and(eq(schema.conversations.participantA, vehicle.ownerId), eq(schema.conversations.participantB, user.id))
      )
    ),
  });
  if (!conv) {
    [conv] = await db
      .insert(schema.conversations)
      .values({ listingId: listing.id, participantA: user.id, participantB: vehicle.ownerId })
      .returning();
    await audit(user.id, "conversation.creee", { type: "conversation", id: conv.id });
  }
  redirect(`/dashboard/messages/${conv.id}`);
}

const msgSchema = z.object({
  conversationId: z.string().uuid(),
  contenu: z.string().trim().min(1, "Message vide.").max(4000, "Message trop long (4000 caractères max)."),
});

/** Détection basique de contournement (contact direct hors plateforme) : on avertit, on ne bloque pas. */
const PATTERN_CONTACT = /(\+?\d[\d .\-()]{8,}\d)|([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i;

export async function envoyerMessage(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = msgSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) err("/dashboard/messages", parsed.error.errors[0].message);
  const d = parsed.data;
  const back = `/dashboard/messages/${d.conversationId}`;

  const db = await getDb();
  const conv = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, d.conversationId) });
  if (!conv || (conv.participantA !== user.id && conv.participantB !== user.id))
    err("/dashboard/messages", "Conversation introuvable ou non autorisée.");

  // Anti-spam simple : max 20 messages / 5 min par utilisateur dans une conversation
  const recents = await db.query.messages.findMany({
    where: and(eq(schema.messages.conversationId, conv.id), eq(schema.messages.senderId, user.id)),
  });
  const seuil = Date.now() - 5 * 60 * 1000;
  if (recents.filter((m) => new Date(m.createdAt).getTime() > seuil).length >= 20)
    err(back, "Trop de messages envoyés en peu de temps. Réessayez dans quelques minutes.");

  await db.insert(schema.messages).values({ conversationId: conv.id, senderId: user.id, contenu: d.contenu });

  const destinataire = conv.participantA === user.id ? conv.participantB : conv.participantA;
  await notify(destinataire, "message", "Nouveau message", `${user.prenom} vous a envoyé un message.`);

  if (PATTERN_CONTACT.test(d.contenu)) {
    await audit(user.id, "message.contact_direct_detecte", { type: "conversation", id: conv.id });
    redirect(`${back}?ok=${encodeURIComponent("Message envoyé. Rappel : les échanges et transactions via la plateforme sont protégés (contrat, paiement sécurisé) — les arrangements hors plateforme ne le sont pas.")}`);
  }
  redirect(back);
}

export async function marquerLu(conversationId: string, userId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(schema.messages)
    .set({ lu: true })
    .where(and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.lu, false)));
  void userId;
}
