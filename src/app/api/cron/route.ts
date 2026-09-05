import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { notify, notifyAvecEmail } from "@/lib/notify";
import { EMAILS } from "@/lib/email";
import { baseUrl } from "@/lib/stripe";

/** Libellés FR lisibles des types de documents (pour les emails). */
const DOC_LABELS: Record<string, string> = {
  carte_grise: "carte grise",
  assurance_vehicule: "attestation d'assurance du véhicule",
  controle_technique: "contrôle technique",
  contrat_location: "contrat de location",
  piece_identite: "pièce d'identité",
  permis: "permis de conduire",
  carte_vtc: "carte professionnelle VTC",
  kbis: "extrait Kbis",
  autre: "document",
};
const docLabel = (type: string) => DOC_LABELS[type] ?? type.replace(/_/g, " ");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Tâches planifiées (Vercel Cron : appel quotidien recommandé).
 * Auth : header Authorization "Bearer CRON_SECRET" (défini par Vercel Cron
 * automatiquement) — sinon refus.
 * Idempotent : chaque relance n'est envoyée qu'une fois (marqueur en audit_logs).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const db = await getDb();
  const now = new Date();
  const rapport = { docsExpires: 0, relancesJ30: 0, relancesJ7: 0, boostsExpires: 0, rateLimitsPurges: 0 };

  /* ---- 1. Documents expirés : statut basculé, propriétaire notifié ---- */
  const expires = await db.query.documents.findMany({
    where: and(eq(schema.documents.statut, "valide"), isNotNull(schema.documents.dateExpiration), lte(schema.documents.dateExpiration, now)),
  });
  for (const d of expires) {
    await db.update(schema.documents).set({ statut: "expire" }).where(eq(schema.documents.id, d.id));
    await db.insert(schema.auditLogs).values({ acteurId: d.ownerUserId, action: "document.expire_auto", cibleType: "document", cibleId: d.id, details: { type: d.type } });
    await notifyAvecEmail(
      d.ownerUserId,
      "document",
      "Document expiré",
      `Votre document « ${docLabel(d.type)} » a expiré. Déposez une version à jour : les annonces liées peuvent être dépubliées.`,
      (prenom) => EMAILS.documentExpire(prenom, docLabel(d.type), `${baseUrl()}/dashboard/documents`)
    );
    rapport.docsExpires++;
  }

  /* ---- 2. Relances J-30 et J-7 avant expiration (une seule fois chacune) ---- */
  for (const [jours, action] of [[30, "document.relance_j30"], [7, "document.relance_j7"]] as const) {
    const limite = new Date(now.getTime() + jours * 86400_000);
    const bientot = await db.query.documents.findMany({
      where: and(
        eq(schema.documents.statut, "valide"),
        isNotNull(schema.documents.dateExpiration),
        lte(schema.documents.dateExpiration, limite),
        gte(schema.documents.dateExpiration, now)
      ),
    });
    for (const d of bientot) {
      // déjà relancé à cette échéance ?
      const deja = await db.execute(sql`SELECT 1 FROM audit_logs WHERE action = ${action} AND cible_id = ${d.id} LIMIT 1`);
      if (deja.rows.length > 0) continue;
      await db.insert(schema.auditLogs).values({ acteurId: d.ownerUserId, action, cibleType: "document", cibleId: d.id, details: { expiration: d.dateExpiration } });
      const dateExp = d.dateExpiration!.toLocaleDateString("fr-FR");
      const joursRestants = Math.max(1, Math.ceil((d.dateExpiration!.getTime() - now.getTime()) / 86400_000));
      await notifyAvecEmail(
        d.ownerUserId,
        "document",
        `Document à renouveler sous ${joursRestants} jours`,
        `Votre document « ${docLabel(d.type)} » expire le ${dateExp}. Déposez la nouvelle version dès maintenant pour éviter toute interruption.`,
        (prenom) => EMAILS.relanceDocument(prenom, docLabel(d.type), dateExp, joursRestants, `${baseUrl()}/dashboard/documents`)
      );
      if (jours === 30) rapport.relancesJ30++;
      else rapport.relancesJ7++;
    }
  }

  /* ---- 3. Boosts arrivés à échéance : statut nettoyé ---- */
  const boostsFinis = await db.query.listingBoosts.findMany({
    where: and(eq(schema.listingBoosts.statut, "actif"), isNotNull(schema.listingBoosts.dateFin), lte(schema.listingBoosts.dateFin, now)),
  });
  for (const b of boostsFinis) {
    await db.update(schema.listingBoosts).set({ statut: "expire" }).where(eq(schema.listingBoosts.id, b.id));
    rapport.boostsExpires++;
  }

  /* ---- 4. Purge des compteurs de rate limit périmés ---- */
  const purge = await db.execute(sql`DELETE FROM rate_limits WHERE reset_at < ${now.toISOString()}`);
  rapport.rateLimitsPurges = Number((purge as { rowCount?: number }).rowCount ?? 0);

  return NextResponse.json({ ok: true, date: now.toISOString(), ...rapport });
}
