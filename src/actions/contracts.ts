"use server";

import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { transitionBooking } from "@/lib/booking";
import {
  construireDonneesContrat,
  rendreTemplate,
  hashContenu,
  prochainNumeroContrat,
  templateActif,
} from "@/lib/contract";
import { genererPdfContrat } from "@/lib/pdf";
import { providerActif, CONSENT_TEXT } from "@/lib/signature-provider";

function err(path: string, m: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}erreur=${encodeURIComponent(m)}`);
}

/**
 * Génération automatique du contrat pour une réservation acceptée.
 * Appelée par le loueur OU le chauffeur depuis la page réservation.
 * Sans module de paiement actif, la machine à états est avancée
 * explicitement : accepted → payment_pending est réservé au paiement réel,
 * donc le contrat est généré au stade "accepted" et la location passera
 * "contract_pending" une fois le paiement actif. En attendant, statut contrat autonome.
 */
export async function genererContrat(formData: FormData): Promise<void> {
  const user = await requireUser();
  const bookingId = String(formData.get("bookingId") ?? "");
  const back = String(formData.get("retour") ?? "/dashboard");

  const db = await getDb();
  const booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, bookingId) });
  if (!booking) err(back, "Réservation introuvable.");
  const listing = (await db.query.listings.findFirst({ where: eq(schema.listings.id, booking.listingId) }))!;
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;
  if (booking.driverId !== user.id && vehicle.ownerId !== user.id && user.role !== "admin")
    err(back, "Vous n'êtes pas partie à cette réservation.");
  // Avec paiement en ligne actif : contrat après paiement (contract_pending).
  // Sans paiement en ligne : dès l'acceptation (documenté dans l'audit).
  if (!["accepted", "contract_pending"].includes(booking.statut))
    err(back, "Le contrat ne peut être généré que pour une réservation acceptée (et payée si le paiement en ligne est actif).");

  // Anti-double contrat : un seul contrat actif par réservation
  const existant = await db.query.contracts.findFirst({
    where: and(eq(schema.contracts.bookingId, booking.id)),
    orderBy: desc(schema.contracts.version),
  });
  if (existant && existant.statut !== "annule")
    redirect(`/dashboard/contrats/${existant.id}`);

  const construit = await construireDonneesContrat(booking.id);
  if (!construit) err(back, "Données de la réservation incomplètes.");
  const tpl = await templateActif();

  const numero = existant ? existant.numero : await prochainNumeroContrat();
  const version = existant ? existant.version + 1 : 1;
  const data = { ...construit.data, numero, version: String(version) };
  const texte = rendreTemplate(tpl.corps, data);

  const [contrat] = await db
    .insert(schema.contracts)
    .values({
      bookingId: booking.id,
      numero,
      version,
      contenu: { templateCode: tpl.code, templateVersion: tpl.version, data, texte },
      statut: "en_signature",
      pdfHash: hashContenu(texte),
    })
    .returning();

  await audit(user.id, "contrat.genere", { type: "contract", id: contrat.id }, { numero, version, bookingId: booking.id });
  await notify(booking.driverId, "contrat", "Votre contrat est prêt à signer", `Contrat ${numero} généré pour « ${listing.titre} ». Votre signature est requise.`);
  await notify(vehicle.ownerId, "contrat", "Contrat prêt à signer", `Contrat ${numero} généré. Votre signature est requise.`);

  redirect(`/dashboard/contrats/${contrat.id}`);
}

const signSchema = z.object({
  contractId: z.string().uuid(),
  consentement: z.literal("on", { errorMap: () => ({ message: "Vous devez cocher la case de consentement pour signer." }) }),
});

export async function signerContrat(formData: FormData): Promise<void> {
  const user = await requireUser();
  const contractId = String(formData.get("contractId") ?? "");
  const back = `/dashboard/contrats/${contractId}`;
  const parsed = signSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) err(back, parsed.error.errors[0].message);

  const db = await getDb();
  const contrat = await db.query.contracts.findFirst({ where: eq(schema.contracts.id, contractId) });
  if (!contrat) err("/dashboard", "Contrat introuvable.");
  if (contrat.statut !== "en_signature") err(back, "Ce contrat n'est pas (ou plus) en attente de signature.");

  const booking = (await db.query.bookings.findFirst({ where: eq(schema.bookings.id, contrat.bookingId) }))!;
  const listing = (await db.query.listings.findFirst({ where: eq(schema.listings.id, booking.listingId) }))!;
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;

  let role: "chauffeur" | "loueur";
  if (user.id === booking.driverId) role = "chauffeur";
  else if (user.id === vehicle.ownerId) role = "loueur";
  else err(back, "Vous n'êtes pas partie à ce contrat.");

  const deja = await db.query.contractSignatures.findFirst({
    where: and(eq(schema.contractSignatures.contractId, contrat.id), eq(schema.contractSignatures.userId, user.id)),
  });
  if (deja) err(back, "Vous avez déjà signé ce contrat.");

  const texte = (contrat.contenu as { texte: string }).texte;
  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  await db.insert(schema.contractSignatures).values({
    contractId: contrat.id,
    userId: user.id,
    role,
    provider: providerActif(),
    consentText: CONSENT_TEXT,
    docHash: hashContenu(texte),
    ip,
    signedAt: new Date(),
  });
  await audit(user.id, "contrat.signe", { type: "contract", id: contrat.id }, { role });

  // Toutes les signatures obtenues ?
  const signatures = await db.query.contractSignatures.findMany({
    where: eq(schema.contractSignatures.contractId, contrat.id),
  });
  const roles = new Set(signatures.map((s) => s.role));
  if (roles.has("chauffeur") && roles.has("loueur")) {
    // CONTRAT ACTIF : PDF final horodaté
    const parties = await db.query.users.findMany({});
    const nomDe = (uid: string) => {
      const u = parties.find((p) => p.id === uid);
      return u ? `${u.prenom} ${u.nom}` : "—";
    };
    const pdfPath = await genererPdfContrat(
      contrat.numero,
      contrat.version,
      texte,
      signatures.map((s) => ({
        role: s.role,
        nom: nomDe(s.userId),
        signedAt: s.signedAt!,
        ip: s.ip,
        docHash: s.docHash!,
        provider: s.provider,
      }))
    );
    await db.update(schema.contracts).set({ statut: "actif", pdfPath }).where(eq(schema.contracts.id, contrat.id));
    await audit(user.id, "contrat.actif", { type: "contract", id: contrat.id }, { pdfPath });
    // Contrat signé par les 2 parties : la réservation avance vers SIGNED.
    // Module paiement non activé : passage direct accepted → signed, documenté dans l'audit.
    if (booking.statut === "accepted") {
      await db.update(schema.bookings).set({ statut: "signed", updatedAt: new Date() }).where(eq(schema.bookings.id, booking.id));
      await audit(user.id, "booking.signed_sans_paiement", { type: "booking", id: booking.id }, { note: "module paiement non activé — passage accepted→signed documenté" });
    } else if (booking.statut === "contract_pending") {
      await transitionBooking(booking.id, "signed", user.id);
    }
    await notify(booking.driverId, "contrat", "Contrat actif ✔", `Le contrat ${contrat.numero} est signé par les deux parties. Le PDF final est disponible.`);
    await notify(vehicle.ownerId, "contrat", "Contrat actif ✔", `Le contrat ${contrat.numero} est signé par les deux parties. Le PDF final est disponible.`);
  } else {
    const autre = role === "chauffeur" ? vehicle.ownerId : booking.driverId;
    await notify(autre, "contrat", "Votre signature est requise", `L'autre partie a signé le contrat ${contrat.numero}. Il ne manque plus que votre signature.`);
  }

  redirect(`${back}?ok=${encodeURIComponent("Signature enregistrée.")}`);
}

/* ------------------------- Admin : templates ------------------------- */

const tplSchema = z.object({
  code: z.string().trim().min(2).max(60),
  nom: z.string().trim().min(4).max(160),
  corps: z.string().trim().min(100, "Le corps du modèle est trop court."),
});

/** Toute modification crée une NOUVELLE version ; l'ancienne est conservée (actif=false). */
export async function enregistrerTemplate(formData: FormData): Promise<void> {
  const admin = await requireUser(["admin"]);
  const parsed = tplSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) err("/admin/contrats", parsed.error.errors[0].message);
  const d = parsed.data;

  const db = await getDb();
  const courant = await db.query.contractTemplates.findFirst({
    where: and(eq(schema.contractTemplates.code, d.code), eq(schema.contractTemplates.actif, true)),
    orderBy: desc(schema.contractTemplates.version),
  });
  const version = courant ? courant.version + 1 : 1;
  if (courant) {
    await db
      .update(schema.contractTemplates)
      .set({ actif: false })
      .where(eq(schema.contractTemplates.id, courant.id));
  }
  const [tpl] = await db
    .insert(schema.contractTemplates)
    .values({ code: d.code, nom: d.nom, corps: d.corps, version, actif: true, updatedBy: admin.id })
    .returning();
  await audit(admin.id, "template.nouvelle_version", { type: "contract_template", id: tpl.id }, { code: d.code, version });
  redirect(`/admin/contrats?ok=${encodeURIComponent(`Modèle « ${d.code} » enregistré en version ${version}. Les anciennes versions sont conservées.`)}`);
}
