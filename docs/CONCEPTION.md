# FORVTC — Dossier de conception (v1)

> La plateforme de référence pour louer, trouver et gérer des véhicules VTC.
> Chauffeurs VTC ↔ Propriétaires/Loueurs ↔ Professionnels/Flottes.

## 1. Principes absolus (non négociables)

1. **Aucune donnée fictive.** État vide propre partout tant qu'aucune donnée réelle n'existe.
2. **Chaque bouton affiché fonctionne.** Une fonctionnalité non terminée n'est jamais présentée comme fonctionnelle.
3. **Règle de vérité** : toute information porte un statut — `VÉRIFIÉ` / `DÉCLARÉ PAR L'UTILISATEUR` / `EN ATTENTE` / `NON VÉRIFIÉ`. Une déclaration n'est jamais transformée en vérité.
4. **Aucune règle juridique inventée.** Les règles du rule engine sont sourcées (URL) et configurables par l'admin. Vérification des textes officiels avant production.
5. La plateforme est un service de **mise en relation et de gestion locative** : elle ne laisse jamais croire que louer un véhicule confère le droit d'exercer comme VTC.

## 2. Contraintes réglementaires françaises (sourcées — état sept. 2026)

Sources consultées : vtcprotect.com (REVTC), bvtc.fr (obligations 2026), droovi.com, assurances-vtc.com, legalstart.fr, ajpassurance.com. **À re-vérifier sur Légifrance avant production** (Code des transports L3122-x, arrêté du 26/03/2015 relatif aux caractéristiques des véhicules).

**Chauffeur / exploitant**
- Carte professionnelle VTC, validité 5 ans, renouvellement avec formation continue 14 h.
- Permis B ≥ 3 ans (2 ans conduite accompagnée), visite médicale, examen VTC (CMA).
- Inscription au **REVTC** obligatoire pour l'exploitant (170 €, 5 ans). Depuis le 01/07/2025 : amende forfaitaire délictuelle 400–1 500 € en cas de défaut.
- Depuis le 27/06/2026 : déclaration des conducteurs (nom, n° carte, plaques) au REVTC ; mise à jour du registre sous 3 mois.

**Véhicule**
- 4 à 9 places (conducteur compris), ≥ 4 portes, ≥ 4,50 m × 1,70 m, puissance ≥ 84 kW.
- Ancienneté ≤ 7 ans pour les thermiques (pas de limite électrique/hybride ; certaines sources indiquent 6 ans → à trancher sur texte officiel).
- Contrôle technique **annuel**. Macarons/vignette VTC.

**Location — impacts directs sur FORVTC**
- Véhicule loué : le REVTC exige un **contrat de location > 6 mois**, sinon **garantie financière de 1 500 €/véhicule**.
- **Attestation de lien** requise quand exploitant ≠ conducteur.
- Assurance : la RC « incluse » d'un loueur ne suffit pas ; la couverture **« transport de personnes à titre onéreux »** doit être explicite. FORVTC affiche l'assurance en tri-état (incluse / non incluse / conditions spécifiques) et ne déduit jamais une couverture.

## 3. Fournisseurs identifiés

| Besoin | Fournisseur privilégié | Alternative | Statut |
|---|---|---|---|
| Paiement marketplace, commission, reversements | **Stripe Connect** (Express) | Mangopay (natif marketplace UE) | Adapter prêt, clés à brancher |
| Caution | Stripe : empreinte carte + autorisation (capture manuelle ≤ 7 j) ; au-delà : ré-autorisation / extended authorizations | Swikly, dépôt séquestré | Conçu, non actif |
| Signature électronique eIDAS | **Yousign** (FR) | DocuSign | Adapter prêt, non actif |
| KYC identité | **Stripe Identity** ou **Ubble** (FR, PVID) | Onfido | Non actif |
| Vérification entreprise | API INSEE Sirene (gratuite) | Pappers API | À intégrer |
| Emails transactionnels | Resend / Brevo | Postmark | À intégrer |
| Carte | MapLibre + OpenStreetMap ; géocodage BAN (adresse.data.gouv.fr, gratuit FR) | Mapbox | À intégrer |
| Hébergement prod | Vercel + Neon/Supabase Postgres + stockage S3 (Scaleway, données FR) | Fly.io | — |

**Aucun de ces services n'est simulé.** Tant qu'une clé n'est pas configurée, l'UI affiche honnêtement « module non activé ».

## 4. Architecture

- **Next.js 14 (App Router, TypeScript)** — rendu serveur, server actions, middleware d'auth.
- **Tailwind CSS**, composants maison style shadcn (légers), mobile-first.
- **Drizzle ORM — dialecte PostgreSQL.** Dev sandbox : PGlite (Postgres embarqué, fichiers `pgdata/`). Prod : PostgreSQL via `DATABASE_URL` (point d'échange unique : `src/db/index.ts`).
- **Auth maison** : bcrypt + session JWT (jose) en cookie httpOnly ; RBAC serveur (`requireUser(roles)`).
- **Stockage documents** : disque privé `storage/` en dev, S3 chiffré en prod. Jamais servi statiquement : route authentifiée + contrôle propriétaire/admin.
- **Audit log** systématique sur les actions sensibles (vérifications, refus, publications, connexions admin).
- Background jobs (expirations, rappels) : cron Vercel/worker — itération ultérieure.

## 5. Rôles & RBAC

`chauffeur` · `loueur` (particulier ou professionnel) · `entreprise` · `gestionnaire_flotte` · `admin`.
Toutes les vérifications de permission sont **côté serveur** (actions + pages). Le middleware ne fait qu'un pré-filtrage.

## 6. Schéma de données

Implémenté dans `src/db/schema.ts` (25 tables) : users, driver_profiles, owner_profiles, vehicles, vehicle_photos, documents (coffre unifié chauffeur/véhicule/entreprise avec expiration, vérificateur, motif de refus), listings, availability, bookings, contracts, contract_signatures, payments, reviews, conversations, messages, notifications, favorites, saved_searches, disputes, maintenance, platform_rules (rule engine sourcé), verification_requests, audit_logs.
À venir : refunds/payouts/commissions (dès activation Stripe), subscriptions, fleet_vehicles, vehicle_assignments, risk_scores.

## 7. Machine à états de la location

```
DRAFT → REQUESTED → ACCEPTED → PAYMENT_PENDING → PAID → CONTRACT_PENDING
      → SIGNED → ACTIVE → RETURN_PENDING → RETURNED → COMPLETED
Sorties : CANCELLED / DISPUTED / FAILED
```
Transitions validées côté serveur uniquement (table de transitions autorisées). Anti-double réservation : vérification de chevauchement en transaction + contrainte d'exclusion Postgres en prod.

## 8. Contrats

`CONTRACT TEMPLATE (admin) → CONTRACT DATA (réservation réelle) → GENERATED → SIGNATURE (Yousign) → FINAL PDF horodaté → ARCHIVE`.
Versionnage : toute modification crée une version, l'ancienne est conservée ; audit trail complet (signataires, timestamps, IP si pertinent, preuve de consentement). **Les modèles de clauses seront rédigés/validés par un juriste — jamais générés automatiquement comme "juridiquement valables".**

## 9. Paiement

Chauffeur → paiement → plateforme (commission configurable) → reversement loueur (Stripe Connect, destination charges). Caution **séparée** du prix, jamais présentée comme un revenu. Webhooks signés + idempotents (idempotency_key unique en base). Factures numérotées, architecture compatible facturation électronique FR.

## 10. Vérification & conformité

- Badges : Identity / Driver / Vehicle / Professional / Fully Verified — chacun adossé à des vérifications réelles (document validé par un humain ou un fournisseur KYC), avec expiration, renouvellement, historique, suspension automatique.
- Un document déposé n'est **jamais** automatiquement valide (statut initial : `déposé`).
- **Moteur de compatibilité VTC** : évalue les caractéristiques *déclarées* contre les règles sourcées de `platform_rules` et rend : `Non validé` (échec d'un critère) / `Vérification nécessaire` (déclaré conforme, non vérifié) / jamais « compatible VTC » automatique.

## 11. RGPD & sécurité

Privacy by design : minimisation, documents privés isolés du public, export/suppression de compte (droit d'accès), consentement cookies, conservation limitée, logs. Sécurité : RBAC serveur, hachage bcrypt, cookies httpOnly/SameSite, validation zod côté serveur, protection CSRF native des server actions, rate limiting (à activer en prod), secrets uniquement en variables d'environnement.

## 12. Périmètre livré dans cette itération (tout est réel)

1. Inscription/connexion chauffeur & loueur (RBAC, sessions).
2. Coffre documentaire : dépôt réel de fichiers, statuts, vérification admin, motifs de refus, journalisation.
3. Ajout véhicule complet + annonce (tarifs, caution, km, assurance tri-état, conditions).
4. Moteur de compatibilité VTC (règles sourcées, configurables en base).
5. Publication contrôlée : une annonce ne peut être publiée que si carte grise + assurance + contrôle technique du véhicule sont **validés par l'admin**.
6. Recherche publique (filtres réels, états vides propres).
7. Dashboards chauffeur/loueur/admin avec chiffres réels uniquement.
8. Notifications internes réelles (validation/refus de document, publication).
9. Audit log.

## 12 bis. Livré en itération 2 (testé de bout en bout)

- Machine à états de location (transitions déclarées uniquement, journalisées).
- Demande de location : prix recalculé côté serveur, contrôles durée/dates/propriété.
- Anti-double-réservation : advisory lock par annonce + re-vérification dans le verrou
  (en prod : à doubler d'une contrainte d'exclusion GiST sur PostgreSQL managé).
- Acceptation/refus loueur avec re-vérification de disponibilité et blocage calendrier.
- Synthèse de vérification chauffeur exposée au loueur (validé / déposé / non fourni).
- Calculateur transparent (mois → semaines → jours, prorata affiché, caution distincte).
- Messagerie : accès participants uniquement, anti-spam, détection de contournement (avertissement + audit).

## 12 ter. Livré en itération 3 (testé de bout en bout)

- Contrats : templates admin versionnés (historique conservé), génération depuis les données
  réelles de la réservation, numéro séquentiel, hash SHA-256, signature simple réelle
  (consentement + horodatage + IP), PDF final horodaté avec page de preuve, adapter Yousign.
- État des lieux : départ (contrat actif requis) / retour (départ validé requis), horodatage,
  photos par zone, validation contradictoire (l'auteur ne peut s'auto-valider), comparaison
  avant/après, cohérence kilométrique, transitions automatiques de la location.
- Avis : uniquement parties réelles + location terminée + unicité par auteur/location.
- Profils publics loueur/chauffeur : données réelles minimales, documents jamais exposés.

## 12 quater. Livré en itération 4 (testé de bout en bout)

- Litiges : ouverture par une partie réelle d'une location engagée (paid→completed),
  8 catégories, 1 litige actif max/location, passage en « disputed » selon la machine à
  états, instruction admin (dossier : contrat PDF + EDL + historique), résolution motivée
  obligatoire (≥ 20 car.), retour en « completed », notifications des 2 parties, audit.
- Favoris (toggle chauffeur) + alertes de recherche (max 10, critères ville/CP, budget
  mensuel, énergie) ; matching serveur déclenché uniquement à la publication réelle
  d'une annonce, notification + journal `alertes.notifiees`.
- SEO programmatique : hub `/location-vtc` (compteurs réels), 14 pages zones via rewrite
  `/location-voiture-vtc-{slug}` → `/seo/ville/[slug]` (metadata dynamique, canonical,
  maillage interne, rappel réglementaire), guide `/devenir-chauffeur-vtc` sourcé,
  `sitemap.xml` dynamique (annonces réelles) + `robots.txt`. Zones vides = état vide
  honnête, jamais d'annonces fictives.

## 13. Prochaines itérations (ordre MVP)

0. FAIT depuis : vérif SIRET Sirene (inscription pro), emails Brevo (templates + branchement notify), carte MapLibre/OSM + géocodage BAN commune, bootstrap admin sécurisé (/api/setup-admin), adapter DocuSign détecté.
1. Stripe Connect (test) : paiement, commission, caution, remboursements, webhooks idempotents — **en attente des clés API utilisateur**.
2. Signature avancée eIDAS : flux DocuSign complet (envelope + embedded signing + webhook Connect) dès les clés fournies ; alternative Yousign.
3. Comparateur 4 véhicules.
4. Flotte & maintenance (multi-véhicules, échéances, indisponibilités).
5. Antifraude (risk score), matching scoré explicable.
6. IA chauffeur / IA loueur (recherche exclusivement dans les données réelles).
7. Analytics loueur/chauffeur (uniquement données réelles), exports RGPD.
