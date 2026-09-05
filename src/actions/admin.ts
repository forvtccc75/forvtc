"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

function err(path: string, m: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}erreur=${encodeURIComponent(m)}`);
}
function ok(path: string, m: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}ok=${encodeURIComponent(m)}`);
}

/** Suspendre / réactiver un compte (jamais un admin, jamais soi-même). */
export async function basculerSuspension(formData: FormData): Promise<void> {
  const admin = await requireUser(["admin"]);
  const userId = String(formData.get("userId") ?? "");
  const back = "/admin/utilisateurs";
  if (!z.string().uuid().safeParse(userId).success) err(back, "Requête invalide.");

  const db = await getDb();
  const cible = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!cible) err(back, "Utilisateur introuvable.");
  if (cible.role === "admin") err(back, "Impossible de suspendre un administrateur.");
  if (cible.id === admin.id) err(back, "Vous ne pouvez pas vous suspendre vous-même.");

  const suspendu = !cible.suspendu;
  await db.update(schema.users).set({ suspendu }).where(eq(schema.users.id, cible.id));
  await audit(admin.id, suspendu ? "user.suspendu" : "user.reactive", { type: "user", id: cible.id });
  ok(back, suspendu ? `Compte ${cible.email} suspendu (connexion bloquée).` : `Compte ${cible.email} réactivé.`);
}

/** Modifier la valeur JSON d'une règle plateforme (rule engine) — journalisé. */
export async function modifierRegle(formData: FormData): Promise<void> {
  const admin = await requireUser(["admin"]);
  const ruleId = String(formData.get("ruleId") ?? "");
  const valeurBrute = String(formData.get("valeur") ?? "").trim();
  const actif = formData.get("actif") === "on";
  const back = "/admin/regles";
  if (!z.string().uuid().safeParse(ruleId).success) err(back, "Requête invalide.");

  let valeur: unknown;
  try {
    valeur = JSON.parse(valeurBrute);
  } catch {
    err(back, "Valeur invalide : le JSON ne peut pas être analysé.");
  }
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur))
    err(back, "La valeur doit être un objet JSON (ex. {\"min\": 84, \"unite\": \"kW\"}).");

  const db = await getDb();
  const regle = await db.query.platformRules.findFirst({ where: eq(schema.platformRules.id, ruleId) });
  if (!regle) err(back, "Règle introuvable.");

  // Garde-fou spécifique : la commission reste dans une plage saine
  if (regle.code === "COMMISSION_PLATEFORME_PCT") {
    const pct = Number((valeur as { pct?: number }).pct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 50)
      err(back, "Commission : {\"pct\": n} avec n entre 0 et 50.");
  }

  await db
    .update(schema.platformRules)
    .set({ valeur, actif, updatedAt: new Date() })
    .where(eq(schema.platformRules.id, regle.id));
  await audit(admin.id, "regle.modifiee", { type: "platform_rule", id: regle.id }, {
    code: regle.code,
    avant: regle.valeur,
    apres: valeur,
    actifAvant: regle.actif,
    actifApres: actif,
  });
  ok(back, `Règle ${regle.code} mise à jour (modification journalisée).`);
}

/** Dépublier une annonce (retrait immédiat de la recherche, loueur notifié avec motif). */
export async function depublierAnnonce(formData: FormData): Promise<void> {
  const admin = await requireUser(["admin"]);
  const listingId = String(formData.get("listingId") ?? "");
  const motif = String(formData.get("motif") ?? "").trim();
  const back = "/admin/annonces";
  if (!z.string().uuid().safeParse(listingId).success) err(back, "Requête invalide.");
  if (motif.length < 10) err(back, "Un motif de dépublication est obligatoire (10 caractères minimum).");

  const db = await getDb();
  const listing = await db.query.listings.findFirst({ where: eq(schema.listings.id, listingId) });
  if (!listing) err(back, "Annonce introuvable.");
  if (listing.statut !== "publiee") err(back, "Cette annonce n'est pas publiée.");

  await db.update(schema.listings).set({ statut: "suspendue" }).where(eq(schema.listings.id, listing.id));
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;
  await audit(admin.id, "annonce.depubliee_admin", { type: "listing", id: listing.id }, { motif });
  await notify(
    vehicle.ownerId,
    "annonce",
    "Votre annonce a été dépubliée",
    `L'annonce « ${listing.titre} » a été retirée par notre équipe. Motif : ${motif}. Contactez le support pour la corriger et la republier.`
  );
  ok(back, `Annonce dépubliée — le loueur a été notifié du motif.`);
}
