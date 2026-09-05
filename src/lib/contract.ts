import { createHash } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { euros, dateFr, joursEntre } from "./format";

/**
 * SYSTÈME DE CONTRATS
 * TEMPLATE (admin, versionné) → CONTRACT DATA (données réelles de la réservation)
 * → GENERATED CONTRACT (versionné) → SIGNATURES (preuve de consentement)
 * → FINAL PDF horodaté + hash → ARCHIVE.
 *
 * Le template par défaut est un CADRE de contrat de location de véhicule à usage
 * professionnel VTC : il ne contient QUE des clauses factuelles descriptives
 * (parties, véhicule, période, prix, caution, km, restitution) et des renvois
 * explicites. Il devra être relu et complété par un juriste avant production —
 * ceci est indiqué dans le document lui-même.
 */

export const TEMPLATE_STANDARD_CODE = "location-vtc-fr";

export const TEMPLATE_STANDARD_CORPS = `CONTRAT DE LOCATION DE VÉHICULE — USAGE PROFESSIONNEL VTC
Numéro : {{numero}} — Version : {{version}} — Généré le : {{date_generation}}

ENTRE LES SOUSSIGNÉS

Le Loueur : {{loueur_nom}} ({{loueur_type}}), ci-après « le Loueur »
Le Locataire : {{chauffeur_nom}}, chauffeur VTC, ci-après « le Locataire »

ARTICLE 1 — OBJET
Le Loueur donne en location au Locataire le véhicule décrit à l'article 2, destiné à un usage professionnel de transport de personnes (activité VTC), aux conditions du présent contrat.

ARTICLE 2 — VÉHICULE
Marque et modèle : {{vehicule_marque_modele}}
Année : {{vehicule_annee}} — Énergie : {{vehicule_energie}} — Boîte : {{vehicule_boite}}
Immatriculation : {{vehicule_immatriculation}}
Kilométrage déclaré à la remise : constaté lors de l'état des lieux de départ, qui fait partie intégrante du présent contrat.

ARTICLE 3 — DURÉE
Du {{date_debut}} au {{date_fin}} inclus, soit {{duree_jours}} jours.
Toute prolongation fait l'objet d'un avenant via la plateforme.

ARTICLE 4 — PRIX ET CAUTION
Prix total de la location : {{prix_total}}
Décomposition : {{prix_decomposition}}
Caution (dépôt de garantie) : {{caution}} — distincte du loyer, restituée en fin de location, déduction faite des sommes justifiées au titre de dommages ou manquements constatés contradictoirement.

ARTICLE 5 — KILOMÉTRAGE
{{clause_kilometrage}}

ARTICLE 6 — ASSURANCE
{{clause_assurance}}
IMPORTANT : la couverture « transport de personnes à titre onéreux » est indispensable à l'activité VTC. Le Locataire déclare avoir vérifié l'étendue exacte des garanties avant la prise du véhicule.

ARTICLE 7 — ENTRETIEN ET ASSISTANCE
Entretien courant : {{clause_entretien}}
Assistance : {{clause_assistance}}

ARTICLE 8 — ÉTAT DES LIEUX
Un état des lieux contradictoire (photos, kilométrage, niveau de carburant/charge, état carrosserie, intérieur, pneumatiques) est réalisé via la plateforme à la remise et à la restitution du véhicule. Les deux documents font partie intégrante du présent contrat.

ARTICLE 9 — OBLIGATIONS DU LOCATAIRE
Le Locataire s'engage à : utiliser le véhicule en bon professionnel, dans le respect du code de la route et de la réglementation applicable à l'activité VTC ; ne pas sous-louer ni prêter le véhicule ; signaler sans délai tout incident, panne ou sinistre ; restituer le véhicule à la date convenue, dans l'état constaté au départ, usure normale exceptée.

ARTICLE 10 — OBLIGATIONS DU LOUEUR
Le Loueur s'engage à : remettre un véhicule conforme à l'annonce et en état de fonctionnement ; fournir les documents nécessaires à la circulation du véhicule ; respecter les conditions d'entretien et d'assistance prévues à l'article 7.

ARTICLE 11 — CONDITIONS PARTICULIÈRES DU LOUEUR
{{conditions_particulieres}}

ARTICLE 12 — RESTITUTION
Le véhicule est restitué au lieu convenu entre les parties, à la date prévue à l'article 3. Tout retard non convenu peut donner lieu à facturation au prorata du tarif journalier de l'annonce.

ARTICLE 13 — RÉSOLUTION DES DIFFÉRENDS
En cas de désaccord, les parties utilisent en premier lieu le centre de résolution de la plateforme. À défaut d'accord amiable, le litige relève des juridictions compétentes.

AVERTISSEMENT
La location du véhicule ne confère pas le droit d'exercer l'activité de chauffeur VTC. Le Locataire déclare détenir les autorisations requises (carte professionnelle VTC en cours de validité, inscription de l'exploitant au registre des VTC) et en être seul responsable.

[CADRE CONTRACTUEL GÉNÉRÉ PAR LA PLATEFORME — À FAIRE VALIDER PAR UN CONSEIL JURIDIQUE AVANT UTILISATION EN PRODUCTION]`;

export type ContractData = Record<string, string>;

/** Construit les données du contrat EXCLUSIVEMENT à partir des enregistrements réels. */
export async function construireDonneesContrat(bookingId: string): Promise<{
  data: ContractData;
  booking: typeof schema.bookings.$inferSelect;
  listing: typeof schema.listings.$inferSelect;
  vehicle: typeof schema.vehicles.$inferSelect;
  chauffeur: typeof schema.users.$inferSelect;
  loueur: typeof schema.users.$inferSelect;
} | null> {
  const db = await getDb();
  const booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, bookingId) });
  if (!booking) return null;
  const listing = await db.query.listings.findFirst({ where: eq(schema.listings.id, booking.listingId) });
  if (!listing) return null;
  const vehicle = await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) });
  if (!vehicle) return null;
  const chauffeur = await db.query.users.findFirst({ where: eq(schema.users.id, booking.driverId) });
  const loueur = await db.query.users.findFirst({ where: eq(schema.users.id, vehicle.ownerId) });
  if (!chauffeur || !loueur) return null;

  const ownerProfile = await db.query.ownerProfiles.findFirst({
    where: eq(schema.ownerProfiles.userId, loueur.id),
  });

  const jours = joursEntre(booking.dateDebut, booking.dateFin);

  const decomposition: string[] = [];
  if (listing.prixMoisCents !== null) decomposition.push(`tarif mensuel de l'annonce : ${euros(listing.prixMoisCents)}`);
  if (listing.prixSemaineCents !== null) decomposition.push(`tarif hebdomadaire : ${euros(listing.prixSemaineCents)}`);
  if (listing.prixJourCents !== null) decomposition.push(`tarif journalier : ${euros(listing.prixJourCents)}`);

  const clauseKm =
    listing.kmInclusMois !== null
      ? `Kilométrage inclus : ${listing.kmInclusMois.toLocaleString("fr-FR")} km par mois.` +
        (listing.prixKmSuppCents !== null
          ? ` Au-delà, chaque kilomètre supplémentaire est facturé ${euros(listing.prixKmSuppCents)}, sur la base des relevés contradictoires des états des lieux.`
          : "")
      : "Aucune limite de kilométrage n'est prévue à l'annonce.";

  const clauseAssurance =
    listing.assurance === "incluse"
      ? "Le Loueur déclare que l'assurance du véhicule est incluse dans la location, selon les garanties précisées à l'annonce."
      : listing.assurance === "non_incluse"
        ? "L'assurance n'est PAS incluse dans la location. Le Locataire fait son affaire de la souscription d'une assurance adaptée, incluant la garantie transport de personnes à titre onéreux."
        : `Conditions spécifiques d'assurance déclarées par le Loueur : ${listing.assuranceDetails ?? "voir annonce"}.`;

  const data: ContractData = {
    numero: "", // renseigné à la génération
    version: "", // renseigné à la génération
    date_generation: new Date().toLocaleString("fr-FR"),
    loueur_nom:
      ownerProfile?.raisonSociale?.trim()
        ? `${ownerProfile.raisonSociale} représentée par ${loueur.prenom} ${loueur.nom}`
        : `${loueur.prenom} ${loueur.nom}`,
    loueur_type: ownerProfile?.typeLoueur === "professionnel" ? "professionnel" : "particulier",
    chauffeur_nom: `${chauffeur.prenom} ${chauffeur.nom}`,
    vehicule_marque_modele: `${vehicle.marque} ${vehicle.modele}${vehicle.finition ? " " + vehicle.finition : ""}`,
    vehicule_annee: String(vehicle.annee),
    vehicule_energie: vehicle.energie.replace(/_/g, " "),
    vehicule_boite: vehicle.boite,
    vehicule_immatriculation: vehicle.immatriculation ?? "non renseignée — à compléter à l'état des lieux",
    date_debut: dateFr(booking.dateDebut),
    date_fin: dateFr(booking.dateFin),
    duree_jours: String(jours),
    prix_total: euros(booking.prixTotalCents),
    prix_decomposition: decomposition.join(" ; ") || "selon annonce",
    caution: euros(booking.cautionCents),
    clause_kilometrage: clauseKm,
    clause_assurance: clauseAssurance,
    clause_entretien: listing.entretienInclus
      ? "à la charge du Loueur pendant la durée de la location."
      : "à la charge du Locataire, selon les préconisations constructeur.",
    clause_assistance: listing.assistanceIncluse
      ? "incluse dans la location."
      : "non incluse dans la location.",
    conditions_particulieres: listing.conditions?.trim() || "Néant.",
  };

  return { data, booking, listing, vehicle, chauffeur, loueur };
}

export function rendreTemplate(corps: string, data: ContractData): string {
  return corps.replace(/\{\{(\w+)\}\}/g, (_, k: string) => data[k] ?? `[donnée manquante : ${k}]`);
}

export function hashContenu(texte: string): string {
  return createHash("sha256").update(texte, "utf8").digest("hex");
}

/** Numéro de contrat séquentiel lisible : FORVTC-AAAA-NNNN. */
export async function prochainNumeroContrat(): Promise<string> {
  const db = await getDb();
  const annee = new Date().getFullYear();
  const dernier = await db.query.contracts.findFirst({ orderBy: desc(schema.contracts.createdAt) });
  let seq = 1;
  if (dernier?.numero?.startsWith(`FORVTC-${annee}-`)) {
    seq = parseInt(dernier.numero.split("-")[2], 10) + 1;
  }
  return `FORVTC-${annee}-${String(seq).padStart(4, "0")}`;
}

/** Template actif (seed automatique de la version 1 si absent). */
export async function templateActif() {
  const db = await getDb();
  let tpl = await db.query.contractTemplates.findFirst({
    where: and(eq(schema.contractTemplates.code, TEMPLATE_STANDARD_CODE), eq(schema.contractTemplates.actif, true)),
    orderBy: desc(schema.contractTemplates.version),
  });
  if (!tpl) {
    [tpl] = await db
      .insert(schema.contractTemplates)
      .values({
        code: TEMPLATE_STANDARD_CODE,
        nom: "Contrat de location véhicule — usage professionnel VTC (cadre standard)",
        corps: TEMPLATE_STANDARD_CORPS,
        version: 1,
        actif: true,
      })
      .returning();
  }
  return tpl;
}
