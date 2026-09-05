import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";

/**
 * Rate limiting persisté en base (fiable en serverless multi-instances,
 * contrairement à une Map en mémoire). Fenêtre fixe : simple et suffisant
 * pour bloquer bruteforce et création de comptes en masse.
 */
export async function rateLimit(
  scope: string,
  identifiant: string,
  max: number,
  fenetreSecondes: number
): Promise<{ ok: boolean; restant: number }> {
  const db = await getDb();
  const key = `${scope}:${identifiant}`.slice(0, 255);
  const now = new Date();
  const reset = new Date(now.getTime() + fenetreSecondes * 1000);

  // upsert atomique : nouvelle fenêtre si expirée, sinon incrément
  const res = await db.execute(sql`
    INSERT INTO rate_limits (key, count, reset_at)
    VALUES (${key}, 1, ${reset.toISOString()})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at < ${now.toISOString()} THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at < ${now.toISOString()} THEN ${reset.toISOString()} ELSE rate_limits.reset_at END
    RETURNING count
  `);
  const count = Number((res.rows[0] as { count: number }).count);
  return { ok: count <= max, restant: Math.max(0, max - count) };
}

/** IP du client (Vercel/proxy : premier x-forwarded-for). */
export function clientIp(): string {
  return headers().get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
}
