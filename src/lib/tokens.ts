import crypto from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * Tokens à usage unique (reset mot de passe, vérification email).
 * Le token en clair n'est JAMAIS stocké : seul son SHA-256 l'est.
 */

function hash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function creerToken(
  userId: string,
  type: "reset_mdp" | "verif_email",
  dureeMinutes: number
): Promise<string> {
  const db = await getDb();
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(schema.authTokens).values({
    userId,
    type,
    tokenHash: hash(token),
    expiresAt: new Date(Date.now() + dureeMinutes * 60_000),
  });
  return token;
}

/** Consomme le token s'il est valide (non expiré, non utilisé). Usage unique. */
export async function consommerToken(
  token: string,
  type: "reset_mdp" | "verif_email"
): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const db = await getDb();
  const row = await db.query.authTokens.findFirst({
    where: and(
      eq(schema.authTokens.tokenHash, hash(token)),
      eq(schema.authTokens.type, type),
      gt(schema.authTokens.expiresAt, new Date()),
      isNull(schema.authTokens.usedAt)
    ),
  });
  if (!row) return null;
  await db.update(schema.authTokens).set({ usedAt: new Date() }).where(eq(schema.authTokens.id, row.id));
  return row.userId;
}
