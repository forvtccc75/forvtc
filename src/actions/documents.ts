"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { saveUpload } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

const uploadSchema = z.object({
  type: z.enum(schema.documentType.enumValues),
  vehicleId: z.string().uuid().optional().or(z.literal("")),
  dateExpiration: z.string().optional().or(z.literal("")),
  retour: z.string().startsWith("/").optional().or(z.literal("")),
});

export async function deposerDocument(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = uploadSchema.safeParse({
    type: formData.get("type"),
    vehicleId: formData.get("vehicleId") ?? "",
    dateExpiration: formData.get("dateExpiration") ?? "",
    retour: formData.get("retour") ?? "",
  });
  const retour = (formData.get("retour") as string) || "/dashboard/documents";
  if (!parsed.success) redirect(`${retour}?erreur=${encodeURIComponent("Type de document invalide.")}`);
  const d = parsed.data;
  const db = await getDb();

  // Si document véhicule : vérifier la propriété du véhicule (RBAC objet)
  let vehicleId: string | null = null;
  if (d.vehicleId) {
    const veh = await db.query.vehicles.findFirst({
      where: and(eq(schema.vehicles.id, d.vehicleId), eq(schema.vehicles.ownerId, user.id)),
    });
    if (!veh) redirect(`${retour}?erreur=${encodeURIComponent("Véhicule introuvable ou non autorisé.")}`);
    vehicleId = veh.id;
  }

  const file = formData.get("fichier") as File | null;
  let stored: { storagePath: string; nomOriginal: string };
  try {
    stored = await saveUpload(file as File, "documents");
  } catch (e) {
    redirect(`${retour}?erreur=${encodeURIComponent(e instanceof Error ? e.message : "Fichier invalide.")}`);
  }

  const [doc] = await db
    .insert(schema.documents)
    .values({
      ownerUserId: user.id,
      vehicleId,
      type: d.type,
      fichierPath: stored.storagePath,
      nomFichier: stored.nomOriginal,
      statut: "depose", // JAMAIS valide automatiquement
      dateExpiration: d.dateExpiration ? new Date(d.dateExpiration) : null,
    })
    .returning();

  await audit(user.id, "document.depose", { type: "document", id: doc.id }, { type_doc: d.type, vehicleId });
  redirect(`${retour}?ok=${encodeURIComponent("Document déposé. Il sera examiné par notre équipe — il n'est pas encore vérifié.")}`);
}

/* ------------------------- Actions ADMIN ------------------------- */

const decisionSchema = z.object({
  documentId: z.string().uuid(),
  decision: z.enum(["valide", "refuse"]),
  motifRefus: z.string().max(500).optional().or(z.literal("")),
  dateExpiration: z.string().optional().or(z.literal("")),
});

export async function deciderDocument(formData: FormData): Promise<void> {
  const admin = await requireUser(["admin"]);
  const parsed = decisionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/admin/documents?erreur=${encodeURIComponent("Requête invalide.")}`);
  const d = parsed.data;
  if (d.decision === "refuse" && !d.motifRefus?.trim())
    redirect(`/admin/documents?erreur=${encodeURIComponent("Un motif de refus est obligatoire.")}`);

  const db = await getDb();
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, d.documentId) });
  if (!doc) redirect(`/admin/documents?erreur=${encodeURIComponent("Document introuvable.")}`);

  await db
    .update(schema.documents)
    .set({
      statut: d.decision,
      verifiePar: admin.id,
      verifieLe: new Date(),
      motifRefus: d.decision === "refuse" ? d.motifRefus!.trim() : null,
      dateExpiration: d.dateExpiration ? new Date(d.dateExpiration) : doc.dateExpiration,
    })
    .where(eq(schema.documents.id, doc.id));

  await audit(admin.id, `document.${d.decision}`, { type: "document", id: doc.id }, { motif: d.motifRefus || undefined });
  await notify(
    doc.ownerUserId,
    "document",
    d.decision === "valide" ? "Document validé" : "Document refusé — action requise",
    d.decision === "valide"
      ? `Votre document « ${doc.nomFichier} » a été vérifié et validé.`
      : `Votre document « ${doc.nomFichier} » a été refusé. Motif : ${d.motifRefus}`
  );

  revalidatePath("/admin/documents");
  redirect(`/admin/documents?ok=${encodeURIComponent("Décision enregistrée et notifiée.")}`);
}
