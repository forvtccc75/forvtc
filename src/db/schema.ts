/**
 * FORVTC — Schéma PostgreSQL (Drizzle ORM)
 * Montants en centimes (integer). IDs UUID générés côté application.
 * Règle de vérité : toute donnée déclarative porte un statut de vérification.
 */
import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

/* ----------------------------- Enums ----------------------------- */

export const userRole = pgEnum("user_role", [
  "chauffeur",
  "loueur",
  "entreprise",
  "gestionnaire_flotte",
  "admin",
]);

export const verificationStatus = pgEnum("verification_status", [
  "non_verifie",
  "declare",
  "en_attente",
  "verifie",
  "refuse",
  "expire",
]);

export const documentStatus = pgEnum("document_status", [
  "depose",
  "en_verification",
  "valide",
  "refuse",
  "expire",
]);

export const documentType = pgEnum("document_type", [
  "identite",
  "permis_conduire",
  "carte_vtc",
  "kbis_sirene",
  "assurance_rc_pro",
  "carte_grise",
  "assurance_vehicule",
  "controle_technique",
  "contrat_location",
  "garantie_financiere",
  "attestation_lien",
  "autre",
]);

export const listingStatus = pgEnum("listing_status", [
  "brouillon",
  "en_attente_verification",
  "publiee",
  "suspendue",
  "archivee",
]);

export const assuranceStatut = pgEnum("assurance_statut", [
  "incluse",
  "non_incluse",
  "conditions_specifiques",
]);

export const energie = pgEnum("energie", [
  "essence",
  "diesel",
  "hybride",
  "hybride_rechargeable",
  "electrique",
  "gpl",
  "autre",
]);

export const boite = pgEnum("boite", ["manuelle", "automatique"]);

export const bookingStatus = pgEnum("booking_status", [
  "draft",
  "requested",
  "accepted",
  "payment_pending",
  "paid",
  "contract_pending",
  "signed",
  "active",
  "return_pending",
  "returned",
  "completed",
  "cancelled",
  "disputed",
  "failed",
]);

export const availStatus = pgEnum("avail_status", [
  "disponible",
  "reserve",
  "location",
  "maintenance",
  "indisponible",
]);

export const paymentType = pgEnum("payment_type", [
  "paiement",
  "caution",
  "remboursement",
  "reversement",
  "commission",
]);

export const paymentStatus = pgEnum("payment_status", [
  "cree",
  "en_attente",
  "reussi",
  "echoue",
  "annule",
  "rembourse",
]);

export const disputeCategory = pgEnum("dispute_category", [
  "dommage",
  "paiement",
  "caution",
  "vehicule_non_conforme",
  "annulation",
  "comportement",
  "contrat",
  "autre",
]);

/* ----------------------------- Users ----------------------------- */

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull(),
    prenom: text("prenom").notNull(),
    nom: text("nom").notNull(),
    telephone: text("telephone"),
    emailVerifie: boolean("email_verifie").default(false).notNull(),
    statutVerification: verificationStatus("statut_verification")
      .default("non_verifie")
      .notNull(),
    suspendu: boolean("suspendu").default(false).notNull(),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({ emailIdx: uniqueIndex("users_email_idx").on(t.email) })
);

export const driverProfiles = pgTable("driver_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  ville: text("ville"),
  codePostal: text("code_postal"),
  experienceAnnees: integer("experience_annees"),
  // Déclaratif tant que le document n'est pas validé :
  carteVtcNumeroDeclare: text("carte_vtc_numero_declare"),
  bio: text("bio"),
});

export const ownerProfiles = pgTable("owner_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  typeLoueur: text("type_loueur").notNull().default("particulier"), // particulier | professionnel
  raisonSociale: text("raison_sociale"),
  sirenDeclare: text("siren_declare"),
  siretDeclare: text("siret_declare"),
  ville: text("ville"),
  codePostal: text("code_postal"),
  description: text("description"),
  statutPro: verificationStatus("statut_pro").default("non_verifie").notNull(),
  // Stripe Connect (compte Express du loueur — requis pour encaisser les loyers)
  stripeAccountId: text("stripe_account_id"),
  stripeChargesEnabled: boolean("stripe_charges_enabled").default(false).notNull(),
});

/* ---------------------------- Véhicules ---------------------------- */

export const vehicles = pgTable(
  "vehicles",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    marque: text("marque").notNull(),
    modele: text("modele").notNull(),
    finition: text("finition"),
    annee: integer("annee").notNull(),
    kilometrage: integer("kilometrage").notNull(),
    energie: energie("energie").notNull(),
    boite: boite("boite").notNull(),
    puissanceKw: integer("puissance_kw"),
    couleur: text("couleur"),
    places: integer("places").notNull(),
    portes: integer("portes").notNull(),
    longueurMm: integer("longueur_mm"),
    largeurMm: integer("largeur_mm"),
    immatriculation: text("immatriculation"), // privé, jamais public
    ville: text("ville").notNull(),
    codePostal: text("code_postal").notNull(),
    lat: text("lat"),
    lng: text("lng"),
    statutVerification: verificationStatus("statut_verification")
      .default("declare")
      .notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ ownerIdx: index("vehicles_owner_idx").on(t.ownerId) })
);

export const vehiclePhotos = pgTable("vehicle_photos", {
  id: id(),
  vehicleId: text("vehicle_id")
    .notNull()
    .references(() => vehicles.id),
  path: text("path").notNull(),
  position: integer("position").default(0).notNull(),
  createdAt: createdAt(),
});

/* ------------------------ Coffre documentaire ------------------------ */

export const documents = pgTable(
  "documents",
  {
    id: id(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id),
    vehicleId: text("vehicle_id").references(() => vehicles.id),
    type: documentType("type").notNull(),
    fichierPath: text("fichier_path").notNull(),
    nomFichier: text("nom_fichier").notNull(),
    statut: documentStatus("statut").default("depose").notNull(),
    dateEmission: timestamp("date_emission", { withTimezone: true }),
    dateExpiration: timestamp("date_expiration", { withTimezone: true }),
    verifiePar: text("verifie_par").references(() => users.id),
    verifieLe: timestamp("verifie_le", { withTimezone: true }),
    motifRefus: text("motif_refus"),
    createdAt: createdAt(),
  },
  (t) => ({
    ownerIdx: index("documents_owner_idx").on(t.ownerUserId),
    vehicleIdx: index("documents_vehicle_idx").on(t.vehicleId),
  })
);

/* ----------------------------- Annonces ----------------------------- */

export const listings = pgTable(
  "listings",
  {
    id: id(),
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    titre: text("titre").notNull(),
    description: text("description"),
    prixJourCents: integer("prix_jour_cents"),
    prixSemaineCents: integer("prix_semaine_cents"),
    prixMoisCents: integer("prix_mois_cents"),
    cautionCents: integer("caution_cents").notNull(),
    kmInclusMois: integer("km_inclus_mois"),
    prixKmSuppCents: integer("prix_km_supp_cents"),
    dureeMinJours: integer("duree_min_jours").default(1).notNull(),
    dureeMaxJours: integer("duree_max_jours"),
    assurance: assuranceStatut("assurance").notNull(),
    assuranceDetails: text("assurance_details"),
    entretienInclus: boolean("entretien_inclus").default(false).notNull(),
    assistanceIncluse: boolean("assistance_incluse").default(false).notNull(),
    conditions: text("conditions"),
    instantBooking: boolean("instant_booking").default(false).notNull(),
    statut: listingStatus("statut").default("brouillon").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /* Boosts payants (activés UNIQUEMENT par webhook Stripe après paiement réel) */
    boostedAt: timestamp("boosted_at", { withTimezone: true }), // remontée en tête de liste
    urgentJusqu: timestamp("urgent_jusqu", { withTimezone: true }), // badge Urgent
    uneJusqu: timestamp("une_jusqu", { withTimezone: true }), // À la une
    createdAt: createdAt(),
  },
  (t) => ({ vehicleIdx: index("listings_vehicle_idx").on(t.vehicleId) })
);

/* ----------------------------- Boosts payants ----------------------------- */

export const boostType = pgEnum("boost_type", ["remontee", "urgent", "a_la_une"]);
export const boostStatus = pgEnum("boost_status", [
  "attente_paiement",
  "actif",
  "expire",
  "annule",
]);

/** Achat de visibilité (type Leboncoin). Trace complète de chaque achat.
 *  Un boost ne devient "actif" QUE via le webhook Stripe signé (paiement confirmé). */
export const listingBoosts = pgTable(
  "listing_boosts",
  {
    id: id(),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    type: boostType("type").notNull(),
    prixCents: integer("prix_cents").notNull(),
    statut: boostStatus("statut").default("attente_paiement").notNull(),
    stripeSessionId: text("stripe_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    dateDebut: timestamp("date_debut", { withTimezone: true }),
    dateFin: timestamp("date_fin", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({ listingIdx: index("boosts_listing_idx").on(t.listingId) })
);

/** Idempotence des webhooks Stripe : chaque event traité une seule fois. */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(), // event id Stripe (evt_...)
  type: text("type").notNull(),
  createdAt: createdAt(),
});

export const availability = pgTable("availability", {
  id: id(),
  vehicleId: text("vehicle_id")
    .notNull()
    .references(() => vehicles.id),
  dateDebut: timestamp("date_debut", { withTimezone: true }).notNull(),
  dateFin: timestamp("date_fin", { withTimezone: true }).notNull(),
  statut: availStatus("statut").notNull(),
  createdAt: createdAt(),
});

/* ---------------------------- Réservations ---------------------------- */

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id),
    driverId: text("driver_id")
      .notNull()
      .references(() => users.id),
    dateDebut: timestamp("date_debut", { withTimezone: true }).notNull(),
    dateFin: timestamp("date_fin", { withTimezone: true }).notNull(),
    statut: bookingStatus("statut").default("draft").notNull(),
    prixTotalCents: integer("prix_total_cents"),
    cautionCents: integer("caution_cents"),
    // Caution : empreinte bancaire (carte enregistrée via SetupIntent — jamais débitée sans litige arbitré)
    cautionSetupIntentId: text("caution_setup_intent_id"),
    cautionPaymentMethodId: text("caution_payment_method_id"),
    cautionCustomerId: text("caution_customer_id"),
    message: text("message"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => ({
    listingIdx: index("bookings_listing_idx").on(t.listingId),
    driverIdx: index("bookings_driver_idx").on(t.driverId),
  })
);

/* ------------------------------ Contrats ------------------------------ */

/** Modèles de contrats administrables. Toute modification crée une nouvelle version,
 *  l'ancienne est conservée (actif=false). */
export const contractTemplates = pgTable(
  "contract_templates",
  {
    id: id(),
    code: text("code").notNull(), // ex. "standard-fr"
    nom: text("nom").notNull(),
    corps: text("corps").notNull(), // texte avec {{placeholders}}
    version: integer("version").default(1).notNull(),
    actif: boolean("actif").default(true).notNull(),
    updatedBy: text("updated_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => ({ codeVersionIdx: uniqueIndex("contract_templates_code_version_idx").on(t.code, t.version) })
);

export const contracts = pgTable("contracts", {
  id: id(),
  bookingId: text("booking_id")
    .notNull()
    .references(() => bookings.id),
  numero: text("numero").notNull(),
  version: integer("version").default(1).notNull(),
  contenu: jsonb("contenu"),
  statut: text("statut").default("genere").notNull(), // genere | en_signature | actif | archive | annule
  pdfPath: text("pdf_path"),
  pdfHash: text("pdf_hash"),
  createdAt: createdAt(),
});

export const contractSignatures = pgTable(
  "contract_signatures",
  {
    id: id(),
    contractId: text("contract_id")
      .notNull()
      .references(() => contracts.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(), // chauffeur | loueur
    provider: text("provider").default("interne_simple").notNull(), // interne_simple | yousign
    providerRef: text("provider_ref"),
    /** Preuve de consentement : texte affiché au signataire au moment du clic. */
    consentText: text("consent_text"),
    /** Empreinte SHA-256 du contenu contractuel au moment de la signature. */
    docHash: text("doc_hash"),
    ip: text("ip"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({ uniq: uniqueIndex("signatures_contract_user_idx").on(t.contractId, t.userId) })
);

/* --------------------------- État des lieux --------------------------- */

export const inspections = pgTable(
  "inspections",
  {
    id: id(),
    bookingId: text("booking_id")
      .notNull()
      .references(() => bookings.id),
    type: text("type").notNull(), // depart | retour
    kilometrage: integer("kilometrage").notNull(),
    carburantPct: integer("carburant_pct"), // 0-100 (thermique)
    batteriePct: integer("batterie_pct"), // 0-100 (électrique)
    carrosserie: text("carrosserie").notNull(), // bon | rayures_legeres | dommages_visibles
    interieur: text("interieur").notNull(),
    pneus: text("pneus").notNull(),
    degats: text("degats"), // description libre des dégâts constatés
    faitPar: text("fait_par")
      .notNull()
      .references(() => users.id),
    /** Contre-signature de l'autre partie (validation contradictoire). */
    valideParAutrePartie: boolean("valide_par_autre_partie").default(false).notNull(),
    valideLe: timestamp("valide_le", { withTimezone: true }),
    valideIp: text("valide_ip"),
    createdAt: createdAt(),
  },
  (t) => ({ uniq: uniqueIndex("inspections_booking_type_idx").on(t.bookingId, t.type) })
);

export const inspectionPhotos = pgTable("inspection_photos", {
  id: id(),
  inspectionId: text("inspection_id")
    .notNull()
    .references(() => inspections.id),
  path: text("path").notNull(),
  zone: text("zone").notNull(), // avant | arriere | gauche | droite | interieur | compteur | autre
  createdAt: createdAt(),
});

/* ------------------------------ Paiements ------------------------------ */

export const payments = pgTable(
  "payments",
  {
    id: id(),
    bookingId: text("booking_id")
      .notNull()
      .references(() => bookings.id),
    type: paymentType("type").notNull(),
    montantCents: integer("montant_cents").notNull(),
    devise: text("devise").default("EUR").notNull(),
    provider: text("provider").default("stripe").notNull(),
    providerRef: text("provider_ref"),
    idempotencyKey: text("idempotency_key").notNull(),
    statut: paymentStatus("statut").default("cree").notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    idemIdx: uniqueIndex("payments_idem_idx").on(t.idempotencyKey),
  })
);

/* --------------------------- Social & divers --------------------------- */

export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    bookingId: text("booking_id")
      .notNull()
      .references(() => bookings.id),
    auteurId: text("auteur_id")
      .notNull()
      .references(() => users.id),
    cibleId: text("cible_id")
      .notNull()
      .references(() => users.id),
    note: integer("note").notNull(),
    commentaire: text("commentaire"),
    createdAt: createdAt(),
  },
  (t) => ({
    uniq: uniqueIndex("reviews_booking_auteur_idx").on(t.bookingId, t.auteurId),
  })
);

export const conversations = pgTable("conversations", {
  id: id(),
  listingId: text("listing_id").references(() => listings.id),
  participantA: text("participant_a")
    .notNull()
    .references(() => users.id),
  participantB: text("participant_b")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

export const messages = pgTable("messages", {
  id: id(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id),
  senderId: text("sender_id")
    .notNull()
    .references(() => users.id),
  contenu: text("contenu").notNull(),
  lu: boolean("lu").default(false).notNull(),
  createdAt: createdAt(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    type: text("type").notNull(),
    titre: text("titre").notNull(),
    corps: text("corps"),
    lue: boolean("lue").default(false).notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ userIdx: index("notifications_user_idx").on(t.userId) })
);

export const favorites = pgTable(
  "favorites",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id),
    createdAt: createdAt(),
  },
  (t) => ({ uniq: uniqueIndex("favorites_user_listing_idx").on(t.userId, t.listingId) })
);

export const savedSearches = pgTable("saved_searches", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  criteres: jsonb("criteres").notNull(),
  createdAt: createdAt(),
});

export const disputes = pgTable("disputes", {
  id: id(),
  bookingId: text("booking_id")
    .notNull()
    .references(() => bookings.id),
  ouvertPar: text("ouvert_par")
    .notNull()
    .references(() => users.id),
  categorie: disputeCategory("categorie").notNull(),
  description: text("description").notNull(),
  statut: text("statut").default("ouvert").notNull(), // ouvert | en_analyse | resolu | ferme
  resolution: text("resolution"),
  createdAt: createdAt(),
});

export const maintenance = pgTable("maintenance", {
  id: id(),
  vehicleId: text("vehicle_id")
    .notNull()
    .references(() => vehicles.id),
  type: text("type").notNull(),
  echeanceDate: timestamp("echeance_date", { withTimezone: true }),
  echeanceKm: integer("echeance_km"),
  note: text("note"),
  statut: text("statut").default("a_prevoir").notNull(),
  createdAt: createdAt(),
});

/* ------------------------- Conformité & audit ------------------------- */

/** Rule engine : règles réglementaires SOURCÉES et configurables par l'admin. */
/** Compteurs de rate limiting persistés (fiables en serverless multi-instances). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(), // ex. "login:1.2.3.4:email@x.fr"
  count: integer("count").default(0).notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

/** Tokens à usage unique : réinitialisation de mot de passe, vérification d'email.
 *  Seul le hash SHA-256 du token est stocké — jamais le token en clair. */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    type: text("type").notNull(), // reset_mdp | verif_email
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({
    hashIdx: uniqueIndex("auth_tokens_hash_idx").on(t.tokenHash),
    userIdx: index("auth_tokens_user_idx").on(t.userId),
  })
);

/** Reçus de paiement PDF (location, caution, boost). Numérotés, immuables.
 *  Ce sont des reçus de transaction — la facturation fiscale complète (TVA…)
 *  dépend du régime de chaque loueur et n'est pas inventée ici. */
export const receipts = pgTable(
  "receipts",
  {
    id: id(),
    numero: text("numero").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    bookingId: text("booking_id").references(() => bookings.id),
    boostId: text("boost_id").references(() => listingBoosts.id),
    type: text("type").notNull(), // location | caution_empreinte | boost
    montantCents: integer("montant_cents").notNull(),
    pdfPath: text("pdf_path").notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ numeroIdx: uniqueIndex("receipts_numero_idx").on(t.numero) })
);

export const platformRules = pgTable(
  "platform_rules",
  {
    id: id(),
    code: text("code").notNull(),
    categorie: text("categorie").notNull(), // VEHICLE | DRIVER | INSURANCE | DOCUMENT | CONTRACT
    libelle: text("libelle").notNull(),
    valeur: jsonb("valeur").notNull(),
    sourceUrl: text("source_url"),
    actif: boolean("actif").default(true).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ codeIdx: uniqueIndex("platform_rules_code_idx").on(t.code) })
);

export const verificationRequests = pgTable("verification_requests", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  type: text("type").notNull(), // identity | driver | vehicle | professional
  statut: text("statut").default("en_attente").notNull(),
  details: text("details"),
  traitePar: text("traite_par").references(() => users.id),
  traiteLe: timestamp("traite_le", { withTimezone: true }),
  createdAt: createdAt(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    acteurId: text("acteur_id"),
    action: text("action").notNull(),
    cibleType: text("cible_type"),
    cibleId: text("cible_id"),
    details: jsonb("details"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => ({ acteurIdx: index("audit_acteur_idx").on(t.acteurId) })
);
