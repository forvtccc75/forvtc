import { headers } from "next/headers";
import { getDb, schema } from "@/db";

/** Journalisation systématique des actions sensibles. */
export async function audit(
  acteurId: string | null,
  action: string,
  cible?: { type: string; id: string },
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const db = await getDb();
    const h = headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await db.insert(schema.auditLogs).values({
      acteurId,
      action,
      cibleType: cible?.type ?? null,
      cibleId: cible?.id ?? null,
      details: details ?? null,
      ip,
    });
  } catch (e) {
    console.error("[audit] échec de journalisation", e);
  }
}
