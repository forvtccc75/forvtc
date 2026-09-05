"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

function err(path: string, m: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}erreur=${encodeURIComponent(m)}`);
}

export async function basculerFavori(formData: FormData): Promise<void> {
  const user = await requireUser(["chauffeur"]);
  const listingId = String(formData.get("listingId") ?? "");
  const retour = String(formData.get("retour") ?? `/annonce/${listingId}`);

  const db = await getDb();
  const listing = await db.query.listings.findFirst({
    where: and(eq(schema.listings.id, listingId), eq(schema.listings.statut, "publiee")),
  });
  if (!listing) err(retour, "Annonce introuvable.");

  const existant = await db.query.favorites.findFirst({
    where: and(eq(schema.favorites.userId, user.id), eq(schema.favorites.listingId, listing.id)),
  });
  if (existant) {
    await db.delete(schema.favorites).where(eq(schema.favorites.id, existant.id));
    redirect(`${retour}?ok=${encodeURIComponent("Retiré des favoris.")}`);
  }
  await db.insert(schema.favorites).values({ userId: user.id, listingId: listing.id });
  redirect(`${retour}?ok=${encodeURIComponent("Ajouté à vos favoris.")}`);
}

const rechercheSchema = z.object({
  ville: z.string().trim().max(80).optional().or(z.literal("")),
  budgetMois: z.coerce.number().min(0).max(100000).optional(),
  energie: z.string().trim().max(30).optional().or(z.literal("")),
});

/** Alerte de recherche : sauvegarde des critères ; notification lors de publications correspondantes. */
export async function sauvegarderRecherche(formData: FormData): Promise<void> {
  const user = await requireUser(["chauffeur"]);
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  if (raw.budgetMois === "") delete raw.budgetMois;
  const parsed = rechercheSchema.safeParse(raw);
  if (!parsed.success) err("/recherche", "Critères invalides.");
  const d = parsed.data;
  if (!d.ville?.trim() && d.budgetMois === undefined && !d.energie?.trim())
    err("/recherche", "Renseignez au moins un critère (ville, budget ou énergie) pour créer une alerte.");

  const db = await getDb();
  const existantes = await db.query.savedSearches.findMany({ where: eq(schema.savedSearches.userId, user.id) });
  if (existantes.length >= 10) err("/recherche", "Maximum 10 alertes. Supprimez-en une depuis vos favoris.");

  const criteres = {
    ville: d.ville?.trim() || null,
    budgetMoisCents: d.budgetMois !== undefined ? Math.round(d.budgetMois * 100) : null,
    energie: d.energie?.trim() || null,
  };
  const [rec] = await db.insert(schema.savedSearches).values({ userId: user.id, criteres }).returning();
  await audit(user.id, "alerte.creee", { type: "saved_search", id: rec.id }, criteres);
  redirect(`/recherche?ok=${encodeURIComponent("Alerte créée : vous serez notifié dès qu'une nouvelle annonce correspondra.")}`);
}

export async function supprimerRecherche(formData: FormData): Promise<void> {
  const user = await requireUser(["chauffeur"]);
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) err("/dashboard/favoris", "Alerte introuvable.");
  const db = await getDb();
  const supprimees = await db
    .delete(schema.savedSearches)
    .where(and(eq(schema.savedSearches.id, id), eq(schema.savedSearches.userId, user.id)))
    .returning();
  if (supprimees.length === 0) err("/dashboard/favoris", "Alerte introuvable.");
  redirect(`/dashboard/favoris?ok=${encodeURIComponent("Alerte supprimée.")}`);
}
