import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * Synthèse de vérification d'un chauffeur — RÈGLE DE VÉRITÉ :
 * on expose l'état exact de chaque document (validé / déposé / absent),
 * jamais une déduction. Utilisée par le loueur pour décider en connaissance de cause.
 */
export type VerifSummary = {
  identite: "valide" | "depose" | "absent";
  permis: "valide" | "depose" | "absent";
  carteVtc: "valide" | "depose" | "absent";
};

export async function syntheseVerificationChauffeur(userId: string): Promise<VerifSummary> {
  const db = await getDb();
  const docs = await db.query.documents.findMany({
    where: and(eq(schema.documents.ownerUserId, userId), isNull(schema.documents.vehicleId)),
  });
  const etat = (type: string): "valide" | "depose" | "absent" => {
    const ofType = docs.filter((d) => d.type === type);
    if (ofType.some((d) => d.statut === "valide" && (!d.dateExpiration || new Date(d.dateExpiration) > new Date())))
      return "valide";
    return ofType.length > 0 ? "depose" : "absent";
  };
  return {
    identite: etat("identite"),
    permis: etat("permis_conduire"),
    carteVtc: etat("carte_vtc"),
  };
}

export const VERIF_LABELS: Record<string, { txt: string; cls: string }> = {
  valide: { txt: "✓ validé", cls: "text-emerald-700" },
  depose: { txt: "déposé, non vérifié", cls: "text-amber-700" },
  absent: { txt: "non fourni", cls: "text-red-700" },
};
