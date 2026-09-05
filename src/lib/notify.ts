import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { envoyerEmail, EMAILS, emailActif } from "@/lib/email";

/**
 * Notification réelle :
 * 1. toujours enregistrée en interne (visible sur le tableau de bord) ;
 * 2. doublée d'un email transactionnel Brevo si BREVO_API_KEY est configurée.
 * Un échec d'email ne bloque jamais l'action métier.
 */
export async function notify(
  userId: string,
  type: string,
  titre: string,
  corps?: string,
  url?: string
): Promise<void> {
  const db = await getDb();
  await db.insert(schema.notifications).values({ userId, type, titre, corps: corps ?? null });

  if (emailActif()) {
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    if (user) {
      const mail = EMAILS.notification(titre, corps ?? titre, url);
      await envoyerEmail({ email: user.email, nom: `${user.prenom} ${user.nom}` }, mail.sujet, mail.contenu);
    }
  }
}

/**
 * Variante avec email sur mesure : la notification interne est identique,
 * mais l'email utilise un template dédié (relances documents, etc.)
 * au lieu du template générique.
 */
export async function notifyAvecEmail(
  userId: string,
  type: string,
  titre: string,
  corps: string,
  mail: (prenom: string) => { sujet: string; contenu: Parameters<typeof envoyerEmail>[2] }
): Promise<void> {
  const db = await getDb();
  await db.insert(schema.notifications).values({ userId, type, titre, corps });

  if (emailActif()) {
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    if (user) {
      const m = mail(user.prenom);
      await envoyerEmail({ email: user.email, nom: `${user.prenom} ${user.nom}` }, m.sujet, m.contenu);
    }
  }
}
