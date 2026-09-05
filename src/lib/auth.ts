import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSession } from "./session";

export type CurrentUser = typeof schema.users.$inferSelect;

/** RBAC serveur : toute page/action protégée passe par ici. */
export async function requireUser(roles?: string[]): Promise<CurrentUser> {
  const s = await getSession();
  if (!s) redirect("/connexion");
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, s.userId) });
  if (!user || user.suspendu || user.deletedAt) redirect("/connexion?erreur=session");
  if (roles && !roles.includes(user.role)) redirect("/dashboard");
  return user;
}

export async function currentUser(): Promise<CurrentUser | null> {
  const s = await getSession();
  if (!s) return null;
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, s.userId) });
  if (!user || user.suspendu || user.deletedAt) return null;
  return user;
}
