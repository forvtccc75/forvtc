# FORVTC — Marketplace VTC (itération 1 : socle vérifié)

Mise en relation chauffeurs VTC ↔ loueurs de véhicules, avec vérification documentaire réelle,
moteur de compatibilité VTC sourcé et back-office administrateur.

📄 Dossier de conception complet : `docs/CONCEPTION.md`

## Démarrer

```bash
npm install
npm run dev            # http://localhost:3000
```

Créer un administrateur (CLI uniquement, jamais exposé sur le web) :

```bash
npm run create-admin -- admin@votredomaine.fr "MotDePasseFort12+" Prénom Nom
```

> Un compte de test `admin@forvtc.fr` a été créé en sandbox (mot de passe affiché lors de sa
> création dans les logs de build). **À supprimer/remplacer avant tout déploiement.**

## Ce qui est livré et testé (tout est réel, rien n'est simulé)

- Inscription / connexion chauffeur & loueur, sessions JWT httpOnly, RBAC serveur.
- Coffre documentaire : dépôt de fichiers réels (PDF/images), statut initial « déposé — non vérifié »,
  file de vérification admin, validation/refus avec motif obligatoire, notification à l'utilisateur,
  journalisation de chaque décision.
- Fichiers privés servis uniquement via route authentifiée (`/api/fichiers/...`), contrôle
  propriétaire/admin, anti path-traversal.
- Véhicules : fiche complète (caractéristiques déclarées), photos, documents dédiés.
- Moteur de compatibilité VTC : règles réglementaires **sourcées** en base (`platform_rules`),
  verdicts honnêtes : « Compatible selon les critères vérifiés » / « Vérification nécessaire » / « Non validé ».
- Annonces : tarifs jour/semaine/mois, caution distincte, km inclus, assurance en tri-état
  (incluse / non incluse / conditions spécifiques). **Publication bloquée** tant que carte grise,
  assurance et contrôle technique ne sont pas validés par un vérificateur.
- Recherche publique avec filtres réels et états vides propres (aucune donnée fictive).
- Dashboards chauffeur / loueur / admin : chiffres réels uniquement.
- Journal d'audit complet.

### Itération 2 — Réservation, calculateur, messagerie (testés de bout en bout)

- **Machine à états de la location** (`src/lib/booking.ts`) : transitions déclarées uniquement,
  toute transition incohérente est refusée et chaque changement est journalisé.
- **Demande de location réelle** : recalcul du prix CÔTÉ SERVEUR (le calculateur client est
  indicatif), contrôle durée min/max, refus des dates passées, refus de réserver son propre véhicule.
- **Anti-double-réservation** : advisory lock PostgreSQL par annonce + re-vérification de
  chevauchement dans le verrou (testé : 2e chauffeur rejeté sur période chevauchante, accepté
  sur période libre ; annulation ⇒ période à nouveau réservable).
- **Acceptation / refus loueur** avec re-vérification de disponibilité au moment de l'acceptation,
  blocage du calendrier (`availability`), notifications réelles aux deux parties.
- **Synthèse de vérification du chauffeur** montrée au loueur telle quelle : identité / permis /
  carte VTC → « validé », « déposé, non vérifié » ou « non fourni » — jamais de déduction.
- **Calculateur de prix** : décomposition transparente mois → semaines → jours + prorata affiché,
  caution distincte, estimation km supplémentaires d'après la saisie du chauffeur.
- **Messagerie** : conversations liées aux annonces, accès strictement réservé aux participants
  (testé : tiers ⇒ 404), anti-spam (20 msg/5 min), détection de coordonnées directes avec rappel
  de protection (avertissement journalisé, pas de censure).

### Itération 3 — Contrats, état des lieux, avis (testés de bout en bout)

**Contrats** (`src/lib/contract.ts`, `src/actions/contracts.ts`)
- Modèles administrables et VERSIONNÉS : toute modification crée une nouvelle version,
  les anciennes sont conservées, les contrats générés référencent leur version d'origine.
- Génération exclusivement depuis les données réelles de la réservation (parties, véhicule,
  période, prix serveur, caution, clauses km/assurance/entretien dérivées de l'annonce).
- Numérotation séquentielle (FORVTC-AAAA-NNNN), empreinte SHA-256 du contenu.
- Signature électronique SIMPLE réelle : consentement exprès (case obligatoire), horodatage
  serveur, IP, hash du document consignés — affichée honnêtement comme niveau « simple » ;
  adapter Yousign (`src/lib/signature-provider.ts`) activé dès que YOUSIGN_API_KEY existe.
- Double signature ⇒ CONTRAT ACTIF + PDF final horodaté (contenu + page de preuve),
  servi uniquement aux parties/admin via route authentifiée. Anti-double-signature testé.
- Le template par défaut est un cadre factuel qui s'affiche lui-même comme « à faire
  valider par un conseil juridique avant production » — aucune clause n'est présentée
  comme juridiquement garantie.

**État des lieux digital** (`src/actions/inspections.ts`)
- Départ possible uniquement avec contrat actif ; retour uniquement après départ validé.
- Horodatage serveur, kilométrage (cohérence vérifiée : retour ≥ départ), carburant/batterie,
  carrosserie/intérieur/pneus, description des dégâts, photos par zone.
- Validation CONTRADICTOIRE : seule l'autre partie peut valider (l'auteur ne peut pas
  auto-valider — testé) ; l'EDL validé devient immuable.
- Départ validé ⇒ location active ; retour validé ⇒ location terminée (machine à états).
- Comparaison AVANT/APRÈS automatique : delta km, dégradations signalées, nouveaux dommages.

**Avis + profils publics** (`src/actions/reviews.ts`, `/loueur/[id]`, `/chauffeur/[id]`)
- Anti-faux-avis : partie réelle + location réellement TERMINÉE + un seul avis par
  auteur/location (contrainte unique DB) — tout testé.
- Profils publics avec uniquement des données réelles et non sensibles : note moyenne,
  avis « location vérifiée », nombre de locations terminées, annonces publiées.
  Les documents privés ne sont jamais exposés.

**Litiges** (`src/actions/disputes.ts`, `/dashboard/litiges`, `/admin/litiges`) — itération 4
- Ouverture réservée aux parties réelles d'une location engagée (payée → terminée) ;
  1 litige actif max par location ; la location passe en « disputed » si la machine à
  états le permet. 8 catégories (dommage, paiement, caution, véhicule non conforme…).
- Instruction admin : dossier complet (contrat PDF, états des lieux, historique),
  prise en charge → analyse → résolution motivée obligatoire (≥ 20 caractères),
  retour de la location en « completed », notification des deux parties, audit trail.

**Favoris & alertes de recherche** (`src/actions/favorites.ts`, `src/lib/alerts.ts`,
`/dashboard/favoris`) — itération 4
- Favoris (toggle sur l'annonce, réservé chauffeurs) ; alertes max 10 par chauffeur,
  critères réels {ville/CP, budget mensuel, énergie}.
- À chaque **publication réelle** d'annonce, matching serveur → notification des
  chauffeurs dont l'alerte correspond (journalisé `alertes.notifiees`). Aucune alerte
  fictive, aucun push marketing.

**SEO programmatique** (`src/lib/seo-villes.ts`, rewrites `next.config.mjs`) — itération 4
- Hub `/location-vtc` (compteur d'annonces réel), 14 pages zones
  `/location-voiture-vtc-{paris,93,94,92,lyon,marseille,…}` (metadata + canonical),
  guide `/devenir-chauffeur-vtc` (contenu sourcé, disclaimer non-conseil juridique),
  `sitemap.xml` dynamique (annonces publiées réelles) + `robots.txt`
  (dashboard/admin/api désindexés).
- Zone sans annonce ⇒ état vide honnête : « nous n'affichons jamais d'annonces fictives ».

## Ce qui n'est PAS encore actif (et affiché comme tel)

Paiement (Stripe Connect), signature avancée eIDAS (Yousign — adapter prêt),
IA, carte interactive. L'UI l'indique honnêtement — aucun bouton factice,
aucun paiement simulé. Sans module de paiement, le passage « acceptée → active » se fait
à la validation contradictoire de l'état des lieux de départ et il est explicitement
journalisé comme « sans paiement » dans l'audit trail.

## Scripts de dev

- `scripts/create-admin.ts` — création d'un admin (CLI uniquement).
- `scripts/seed-test.ts` — parcours de test end-to-end (comptes *.test@example.com
  explicitement identifiés comme tests ; interdit en production).

## Monétisation — boosts d'annonces (type Leboncoin)

`src/lib/boosts.ts`, `src/actions/boosts.ts`, `/dashboard/annonces/[id]/booster`,
webhook `/api/stripe/webhook`.

- 3 options : Remontée en tête (4,99 €), badge Urgent 7 j (9,99 €), À la une 7 j (19,99 €).
- Paiement par Stripe Checkout ; activation UNIQUEMENT via webhook signé + idempotent
  (table `stripe_events`) après paiement confirmé. Rien n'est simulé : sans clés
  Stripe, les options s'affichent « Bientôt disponible ».
- Les boosts modifient la visibilité, jamais le contenu ni les vérifications.

## Déploiement

**Guide complet pas à pas : [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md)**
(Vercel + Neon PostgreSQL + Vercel Blob + Stripe + admin + domaine + checklist).

## Production

- `DATABASE_URL` → PostgreSQL managé (adapter `src/db/index.ts`, schéma inchangé).
- `SESSION_SECRET` obligatoire. Secrets uniquement en variables d'environnement (voir `.env.example`).
- Stockage documents → S3 chiffré (adapter `src/lib/storage.ts`).
- Re-vérifier chaque règle de `platform_rules` sur les textes officiels (Légifrance) avant lancement.
