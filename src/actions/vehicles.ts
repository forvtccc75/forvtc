"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { saveUpload } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { emailVerifieRequis } from "@/lib/email-gate";
import { evaluerCompatibilite } from "@/lib/compat";
import { notifierAlertesCorrespondantes } from "@/lib/alerts";
import { geocoderVille } from "@/lib/geocode";

const OWNER_ROLES = ["loueur", "entreprise", "gestionnaire_flotte"];

const vehicleSchema = z.object({
  marque: z.string().trim().min(1, "Marque requise.").max(60),
  modele: z.string().trim().min(1, "Modèle requis.").max(60),
  finition: z.string().trim().max(60).optional().or(z.literal("")),
  annee: z.coerce.number().int().min(1990).max(new Date().getFullYear() + 1),
  kilometrage: z.coerce.number().int().min(0).max(2000000),
  energie: z.enum(schema.energie.enumValues),
  boite: z.enum(schema.boite.enumValues),
  puissanceKw: z.coerce.number().int().min(0).max(1000).optional(),
  couleur: z.string().trim().max(30).optional().or(z.literal("")),
  places: z.coerce.number().int().min(2).max(9),
  portes: z.coerce.number().int().min(2).max(6),
  longueurMm: z.coerce.number().int().min(2000).max(8000).optional(),
  largeurMm: z.coerce.number().int().min(1000).max(3000).optional(),
  immatriculation: z.string().trim().max(15).optional().or(z.literal("")),
  ville: z.string().trim().min(1, "Ville requise.").max(80),
  codePostal: z.string().trim().regex(/^\d{5}$/, "Code postal invalide (5 chiffres)."),
});

export async function creerVehicule(formData: FormData): Promise<void> {
  const user = await requireUser(OWNER_ROLES);
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of ["puissanceKw", "longueurMm", "largeurMm"]) if (raw[k] === "") delete raw[k];
  const parsed = vehicleSchema.safeParse(raw);
  if (!parsed.success)
    redirect(`/dashboard/vehicules/nouveau?erreur=${encodeURIComponent(parsed.error.errors[0].message)}`);
  const d = parsed.data;

  const db = await getDb();
  const [veh] = await db
    .insert(schema.vehicles)
    .values({
      ownerId: user.id,
      marque: d.marque,
      modele: d.modele,
      finition: d.finition || null,
      annee: d.annee,
      kilometrage: d.kilometrage,
      energie: d.energie,
      boite: d.boite,
      puissanceKw: d.puissanceKw ?? null,
      couleur: d.couleur || null,
      places: d.places,
      portes: d.portes,
      longueurMm: d.longueurMm ?? null,
      largeurMm: d.largeurMm ?? null,
      immatriculation: d.immatriculation || null,
      ville: d.ville,
      codePostal: d.codePostal,
      // Géocodage BAN au niveau COMMUNE uniquement (jamais l'adresse privée précise)
      ...(await (async () => {
        const p = await geocoderVille(d.ville, d.codePostal);
        return p ? { lat: p.lat, lng: p.lng } : {};
      })()),
      statutVerification: "declare",
    })
    .returning();

  await audit(user.id, "vehicule.cree", { type: "vehicle", id: veh.id });
  redirect(`/dashboard/vehicules/${veh.id}?ok=${encodeURIComponent("Véhicule enregistré (caractéristiques déclarées). Déposez maintenant ses documents.")}`);
}

export async function ajouterPhoto(formData: FormData): Promise<void> {
  const user = await requireUser(OWNER_ROLES);
  const vehicleId = String(formData.get("vehicleId") ?? "");
  const db = await getDb();
  const veh = await db.query.vehicles.findFirst({
    where: and(eq(schema.vehicles.id, vehicleId), eq(schema.vehicles.ownerId, user.id)),
  });
  if (!veh) redirect(`/dashboard/vehicules?erreur=${encodeURIComponent("Véhicule introuvable.")}`);
  const back = `/dashboard/vehicules/${veh.id}`;
  try {
    const stored = await saveUpload(formData.get("photo") as File, "photos");
    await db.insert(schema.vehiclePhotos).values({ vehicleId: veh.id, path: stored.storagePath });
  } catch (e) {
    redirect(`${back}?erreur=${encodeURIComponent(e instanceof Error ? e.message : "Photo invalide.")}`);
  }
  redirect(`${back}?ok=${encodeURIComponent("Photo ajoutée.")}`);
}

/* ------------------------------ Annonce ------------------------------ */

const listingSchema = z.object({
  vehicleId: z.string().uuid(),
  titre: z.string().trim().min(8, "Titre : 8 caractères minimum.").max(120),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  prixJour: z.coerce.number().min(0).max(10000).optional(),
  prixSemaine: z.coerce.number().min(0).max(50000).optional(),
  prixMois: z.coerce.number().min(0).max(100000).optional(),
  caution: z.coerce.number().min(0, "Caution requise (0 si aucune).").max(100000),
  kmInclusMois: z.coerce.number().int().min(0).max(100000).optional(),
  prixKmSupp: z.coerce.number().min(0).max(10).optional(),
  dureeMinJours: z.coerce.number().int().min(1).max(3650),
  assurance: z.enum(schema.assuranceStatut.enumValues),
  assuranceDetails: z.string().trim().max(1000).optional().or(z.literal("")),
  entretienInclus: z.string().optional(),
  assistanceIncluse: z.string().optional(),
  conditions: z.string().trim().max(4000).optional().or(z.literal("")),
});

export async function creerAnnonce(formData: FormData): Promise<void> {
  const user = await requireUser(OWNER_ROLES);
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of ["prixJour", "prixSemaine", "prixMois", "kmInclusMois", "prixKmSupp"]) if (raw[k] === "") delete raw[k];
  const parsed = listingSchema.safeParse(raw);
  const backErr: (m: string) => never = (m) =>
    redirect(`/dashboard/vehicules/${raw.vehicleId}?erreur=${encodeURIComponent(m)}`);
  if (!parsed.success) backErr(parsed.error.errors[0].message);
  const d = parsed.data;
  if (d.prixJour === undefined && d.prixSemaine === undefined && d.prixMois === undefined)
    backErr("Renseignez au moins un tarif (jour, semaine ou mois).");
  if (d.assurance === "conditions_specifiques" && !d.assuranceDetails?.trim())
    backErr("Précisez les conditions spécifiques d'assurance.");

  const db = await getDb();
  const veh = await db.query.vehicles.findFirst({
    where: and(eq(schema.vehicles.id, d.vehicleId), eq(schema.vehicles.ownerId, user.id)),
  });
  if (!veh) redirect(`/dashboard/vehicules?erreur=${encodeURIComponent("Véhicule introuvable.")}`);

  const existing = await db.query.listings.findFirst({ where: eq(schema.listings.vehicleId, veh.id) });
  if (existing) backErr("Une annonce existe déjà pour ce véhicule.");

  const [listing] = await db
    .insert(schema.listings)
    .values({
      vehicleId: veh.id,
      titre: d.titre,
      description: d.description || null,
      prixJourCents: d.prixJour !== undefined ? Math.round(d.prixJour * 100) : null,
      prixSemaineCents: d.prixSemaine !== undefined ? Math.round(d.prixSemaine * 100) : null,
      prixMoisCents: d.prixMois !== undefined ? Math.round(d.prixMois * 100) : null,
      cautionCents: Math.round(d.caution * 100),
      kmInclusMois: d.kmInclusMois ?? null,
      prixKmSuppCents: d.prixKmSupp !== undefined ? Math.round(d.prixKmSupp * 100) : null,
      dureeMinJours: d.dureeMinJours,
      assurance: d.assurance,
      assuranceDetails: d.assuranceDetails || null,
      entretienInclus: d.entretienInclus === "on",
      assistanceIncluse: d.assistanceIncluse === "on",
      conditions: d.conditions || null,
      statut: "brouillon",
    })
    .returning();

  await audit(user.id, "annonce.creee", { type: "listing", id: listing.id });
  redirect(`/dashboard/vehicules/${veh.id}?ok=${encodeURIComponent("Annonce créée en brouillon. Elle sera publiable une fois les documents du véhicule validés.")}`);
}

/** Publication contrôlée : documents clés validés + critères non en échec. */
export async function demanderPublication(formData: FormData): Promise<void> {
  const user = await requireUser(OWNER_ROLES);
  const listingId = String(formData.get("listingId") ?? "");
  {
    const gate = emailVerifieRequis(user);
    if (gate) redirect(`/dashboard/vehicules?erreur=${encodeURIComponent(gate)}`);
  }
  const db = await getDb();
  const listing = await db.query.listings.findFirst({ where: eq(schema.listings.id, listingId) });
  if (!listing) redirect(`/dashboard/vehicules?erreur=${encodeURIComponent("Annonce introuvable.")}`);
  const veh = await db.query.vehicles.findFirst({
    where: and(eq(schema.vehicles.id, listing.vehicleId), eq(schema.vehicles.ownerId, user.id)),
  });
  if (!veh) redirect(`/dashboard/vehicules?erreur=${encodeURIComponent("Non autorisé.")}`);
  const back = `/dashboard/vehicules/${veh.id}`;

  const compat = await evaluerCompatibilite(veh);
  if (compat.global === "non_valide")
    redirect(`${back}?erreur=${encodeURIComponent("Publication impossible : le véhicule ne respecte pas un critère réglementaire (voir l'analyse de compatibilité).")}`);
  if (!compat.docsValides)
    redirect(`${back}?erreur=${encodeURIComponent(`Publication impossible : documents à faire valider — ${compat.docsManquants.join(", ")}.`)}`);

  await db
    .update(schema.listings)
    .set({ statut: "publiee", publishedAt: new Date() })
    .where(eq(schema.listings.id, listing.id));
  await audit(user.id, "annonce.publiee", { type: "listing", id: listing.id });
  await notify(user.id, "annonce", "Annonce publiée", `Votre annonce « ${listing.titre} » est en ligne.`);
  const nbAlertes = await notifierAlertesCorrespondantes(listing.id);
  if (nbAlertes > 0)
    await audit(user.id, "alertes.notifiees", { type: "listing", id: listing.id }, { nb: nbAlertes });
  redirect(`${back}?ok=${encodeURIComponent("Annonce publiée — visible dans la recherche.")}`);
}
