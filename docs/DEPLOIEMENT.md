# FORVTC — Guide de déploiement complet sur Vercel

Ce guide couvre TOUT : base de données, stockage fichiers, variables d'environnement,
création du compte admin, Stripe (boosts payants), domaine, SEO, et les vérifications
post-déploiement. Suivez-le dans l'ordre.

---

## 0. Réponse rapide : « il y a du SQL ou pas ? »

**OUI, il faut une vraie base PostgreSQL en production.**

- **En dev** (sandbox/local) : aucune installation — le code utilise PGlite
  (PostgreSQL embarqué dans `./pgdata`) automatiquement quand `DATABASE_URL` est vide.
- **Sur Vercel** : le disque est éphémère → il faut une base PostgreSQL managée.
  Dès que `DATABASE_URL` est défini, le code bascule tout seul sur PostgreSQL
  (driver `pg`), **même schéma, mêmes migrations, zéro changement de code**.
  Les migrations s'appliquent automatiquement au premier démarrage (verrou
  anti-concurrence inclus).

Recommandé : **Neon** (intégré au marketplace Vercel, plan gratuit suffisant pour
démarrer, serveurs UE possibles → données en Europe, cohérent RGPD).

---

## 1. Prérequis

- Un compte [vercel.com](https://vercel.com) (plan Hobby gratuit OK pour démarrer).
- Le code dans un dépôt Git (GitHub recommandé — Vercel déploie à chaque push).
- Un compte [stripe.com](https://stripe.com) (pour les boosts payants).

### Pousser le code sur GitHub

```bash
cd forvtc
git init
git add .
git commit -m "FORVTC — marketplace VTC"
# Créez un dépôt PRIVÉ sur github.com puis :
git remote add origin git@github.com:VOTRE_COMPTE/forvtc.git
git push -u origin main
```

⚠️ Vérifiez que `.gitignore` exclut bien : `.env`, `pgdata/`, `storage/`,
`node_modules/`, `.next/`. **Jamais de secrets dans Git.**

---

## 2. Créer la base PostgreSQL (Neon via Vercel)

1. Sur Vercel : **Storage → Create Database → Neon (Postgres)**.
2. Région : **Frankfurt (eu-central-1)** ou Paris si proposé (données en UE).
3. Connectez-la à votre projet → Vercel injecte automatiquement `DATABASE_URL`.

Alternative hors marketplace : créez la base sur [neon.tech](https://neon.tech)
directement, puis copiez la chaîne `postgresql://...?sslmode=require` dans la
variable `DATABASE_URL` du projet Vercel.

> Rien d'autre à faire : les tables sont créées automatiquement au premier
> démarrage (migrations `drizzle/*.sql` + seed des règles réglementaires —
> qui sont de la configuration sourcée, pas des données fictives).

---

## 3. Créer le stockage fichiers (Vercel Blob) — OBLIGATOIRE

Les documents (cartes grises, assurances…), photos et PDF de contrats ne peuvent
pas vivre sur le disque de Vercel (éphémère). Le code bascule automatiquement sur
**Vercel Blob** quand le token est présent.

1. Sur Vercel : **Storage → Create → Blob**.
2. Connectez le store au projet → `BLOB_READ_WRITE_TOKEN` est injecté automatiquement.

Les fichiers restent servis UNIQUEMENT via les routes authentifiées de l'app
(`/api/fichiers/...`, contrôle RBAC) — jamais d'URL publique exposée.

> Plus tard, pour un contrôle souverain total (données FR) : migrer vers un S3
> chiffré type Scaleway — seul `src/lib/storage.ts` est à adapter.

---

## 4. Importer le projet sur Vercel

1. **Add New → Project → Import** votre dépôt GitHub.
2. Framework : Next.js détecté automatiquement. Build : `next build` (défaut). Ne rien changer.
3. **AVANT** de cliquer Deploy, ajoutez les variables d'environnement (section 5).

---

## 5. Variables d'environnement (Settings → Environment Variables)

| Variable | Obligatoire | Valeur |
|---|---|---|
| `SESSION_SECRET` | ✅ | Générer : `openssl rand -hex 32` (ou n'importe quelle chaîne aléatoire de 64 caractères hexadécimaux) |
| `DATABASE_URL` | ✅ | Injectée par l'intégration Neon (sinon coller la chaîne `postgresql://...`) |
| `BLOB_READ_WRITE_TOKEN` | ✅ | Injectée par l'intégration Blob |
| `NEXT_PUBLIC_BASE_URL` | ✅ | `https://votre-domaine.fr` (ou l'URL `*.vercel.app` en attendant le domaine) |
| `ADMIN_SETUP_TOKEN` | temporaire | Jeton du premier admin (section 6-A) — **à supprimer après usage** |
| `STRIPE_SECRET_KEY` | paiements (loyers + boosts) | `sk_test_...` puis `sk_live_...` (voir section 8) |
| `STRIPE_WEBHOOK_SECRET` | paiements (loyers + boosts) | `whsec_...` (voir section 8) |
| `CRON_SECRET` | tâches planifiées | Chaîne aléatoire longue — Vercel l'envoie automatiquement à `/api/cron` (relances documents J-30/J-7, expirations) |
| `BREVO_API_KEY` | pour les emails | `xkeysib-...` (voir section 8 bis) |
| `EMAIL_FROM` | pour les emails | Adresse expéditrice validée dans Brevo (ex. `notifications@votredomaine.fr`) |
| `EMAIL_FROM_NAME` | optionnel | Nom d'expéditeur affiché (défaut : FORVTC) |
| `DOCUSIGN_INTEGRATION_KEY` | plus tard | Signature avancée eIDAS (section 8 ter) |
| `DOCUSIGN_USER_ID` | plus tard | idem |
| `DOCUSIGN_ACCOUNT_ID` | plus tard | idem |
| `DOCUSIGN_PRIVATE_KEY` | plus tard | Clé privée RSA (PEM) de l'app DocuSign |
| `DOCUSIGN_BASE_URL` | plus tard | `https://demo.docusign.net/restapi` (sandbox) puis `https://eu.docusign.net/restapi` |
| `YOUSIGN_API_KEY` | alternative | Alternative française à DocuSign |

**Aucune clé nécessaire** pour : la vérification SIRET (API Sirene INSEE publique via
recherche-entreprises.api.gouv.fr, gratuite), le géocodage (BAN api-adresse.data.gouv.fr,
gratuit) et la carte (MapLibre + tuiles OpenStreetMap, gratuit).

Sans les clés Stripe/Brevo/DocuSign, le site fonctionne intégralement — les modules
concernés s'affichent honnêtement comme non actifs, rien n'est simulé.

Puis **Deploy**. Premier build ≈ 1-2 min. Le premier chargement de page applique
les migrations (quelques secondes de plus, une seule fois).

---

## 6. Créer le compte ADMIN (accès back-office)

Il n'existe **aucune inscription admin par le web classique** (choix de sécurité).
Deux méthodes — la A est la plus simple si vous êtes déjà sur Vercel :

### Méthode A — Route de bootstrap à usage unique (recommandée)

1. Générez un jeton : `openssl rand -hex 24` (ou 48 caractères aléatoires).
2. Vercel → Settings → Environment Variables → ajoutez `ADMIN_SETUP_TOKEN` = ce jeton → **Redeploy**.
3. Depuis votre terminal (ou n'importe quel client HTTP) :

```bash
curl -X POST https://votre-domaine.fr/api/setup-admin \
  -H "Content-Type: application/json" \
  -d '{"token":"VOTRE_JETON","email":"vous@domaine.fr","password":"MotDePasseFort!2026","prenom":"Prénom","nom":"Nom"}'
```

4. Réponse `{"ok":true,...}` → connectez-vous sur `/connexion` → back-office sur `/admin`.
5. **Supprimez `ADMIN_SETUP_TOKEN` de Vercel** et redéployez.

Sécurité intégrée : la route renvoie 404 sans jeton configuré, 403 si le jeton ne
correspond pas (comparaison à temps constant), et se **désactive définitivement dès
qu'un admin existe** (testé). La création est journalisée (`admin.cree_via_setup`).

### Méthode B — Script CLI depuis votre machine

```bash
cd forvtc
npm install

# La même DATABASE_URL que sur Vercel (Neon → Connection string)
DATABASE_URL="postgresql://USER:PASSWORD@HOST/neondb?sslmode=require" \
  npm run create-admin -- admin@votredomaine.fr "UnMotDePasseTresFort!2026" Prénom Nom
```

- Mot de passe : 12 caractères minimum (imposé partout).
- Journalisé dans l'audit trail (`admin.cree_via_cli`).
- Refuse les doublons d'email. Utilisable aussi pour créer des admins SUPPLÉMENTAIRES
  (la méthode A ne marche que pour le premier).

**Accès admin ensuite** : connectez-vous sur `https://votre-domaine.fr/connexion`
avec ce compte → le back-office est sur **`/admin`** :

| URL | Rôle |
|---|---|
| `/admin` | Tableau de bord (compteurs réels, alertes litiges/documents) |
| `/admin/documents` | File de vérification des documents (valider/refuser + motif) |
| `/admin/utilisateurs` | Comptes, rôles, statuts de vérification |
| `/admin/litiges` | Centre de résolution (dossier complet, prise en charge, résolution motivée) |
| `/admin/contrats` | Modèles de contrats versionnés (v1, v2… historiques conservés) |
| `/admin/regles` | Rule engine réglementaire VTC (valeurs modifiables, sources citées) |
| `/admin/audit` | Journal d'audit complet (qui a fait quoi, quand, depuis quelle IP) |

⚠️ `/admin` et `/dashboard` sont exclus de l'indexation (robots.txt) et protégés
par RBAC serveur : un non-admin est redirigé, même avec l'URL exacte.

---

## 7. Monétisation « boosts » (type Leboncoin) — comment ça marche

Trois options payantes par annonce, achetables par le loueur depuis
**Dashboard → véhicule → « 🚀 Booster la visibilité de l'annonce »**
(`/dashboard/annonces/{id}/booster`) :

| Option | Prix (modifiable) | Effet |
|---|---|---|
| **Remontée en tête de liste** | 4,99 € | L'annonce repasse immédiatement en tête des résultats (tri = plus récent entre publication et dernière remontée) |
| **Badge Urgent** | 9,99 € | Badge orange « Urgent » sur l'annonce pendant 7 jours |
| **À la une** | 19,99 € | Bloc « À la une » en haut de la recherche pendant 7 jours |

Garanties d'intégrité (non négociables dans le code) :

- Un boost n'est **activé QUE par le webhook Stripe signé** après paiement réel
  confirmé (`checkout.session.completed`, `payment_status=paid`). Cliquer
  « retour » après paiement ne suffit pas ; fermer l'onglet n'active rien.
- **Webhook idempotent** : chaque événement Stripe est enregistré (table
  `stripe_events`) et traité une seule fois, même si Stripe le renvoie.
- Anti-doublon : impossible d'acheter deux fois la même option active.
- Seule une annonce **publiée** est boostable ; seul son **propriétaire** peut payer.
- Un boost modifie la **visibilité**, jamais le contenu ni les statuts de
  vérification (pas de « badge de confiance » achetable).
- Chaque achat est tracé : audit trail + historique visible par le loueur.

**Modifier les prix** : `src/lib/boosts.ts` (constante `BOOSTS`, montants en centimes).

Pistes de revenus suivantes (déjà prévues par l'architecture) : commission sur les
locations (Stripe Connect, à l'activation du module paiement), abonnements loueurs
pro/flotte, remontée automatique récurrente.

---

## 8. Configurer Stripe (les clés EXACTES dont j'ai besoin)

### Ce que vous devez me donner (ou saisir vous-même sur Vercel)

Deux valeurs, **en mode TEST d'abord** :

1. **`STRIPE_SECRET_KEY`** = la **clé secrète API**
   → [dashboard.stripe.com](https://dashboard.stripe.com) → **Developers → API keys**
   → « Secret key » → commence par **`sk_test_...`** (test) puis `sk_live_...` (production).
   ❌ PAS la clé publiable `pk_...` (inutile ici : Stripe Checkout hébergé).
   ❌ Jamais de clé restreinte `rk_...` sauf si elle a les droits Checkout + PaymentIntents.

2. **`STRIPE_WEBHOOK_SECRET`** = le **secret de signature du webhook** (`whsec_...`),
   généré à l'étape ci-dessous.

### Créer le webhook (après le premier déploiement)

1. Dashboard Stripe → **Developers → Webhooks → Add endpoint**.
2. URL : `https://votre-domaine.fr/api/stripe/webhook`
3. Événements à sélectionner (ces trois-là) :
   - `checkout.session.completed` (loyers, cautions, boosts)
   - `checkout.session.expired`
   - `account.updated` (statut des comptes de versement des loueurs)
4. Créez l'endpoint → copiez le **Signing secret** (`whsec_...`)
   → variable `STRIPE_WEBHOOK_SECRET` sur Vercel → **Redeploy**.

### Paiement des locations (Stripe Connect)

Le paiement des loyers utilise **Stripe Connect (comptes Express)** :

1. Dashboard Stripe → **Settings → Connect** → activer **Express accounts** (France).
2. Chaque loueur active son encaissement depuis **Tableau de bord → Encaissement**
   (identité + IBAN saisis chez Stripe, jamais sur FORVTC).
3. Flux : le chauffeur paie → Stripe reverse automatiquement au loueur
   **loyer − commission plateforme** (réglable dans Admin → Règles, code
   `COMMISSION_PLATEFORME_PCT`, 10 % par défaut).
4. **Caution = empreinte bancaire** (mode setup, carte enregistrée) : aucun débit
   sans décision d'arbitrage d'un litige. Jamais mélangée aux loyers.
5. Un **reçu PDF numéroté** est généré à chaque paiement (chauffeur : Mes locations ;
   loueur : récap dans Encaissement).

### Tester le paiement (mode test)

- Carte de test : `4242 4242 4242 4242`, n'importe quelle date future, CVC `424`.
- Achetez une « Remontée » sur une annonce publiée → payez avec la carte test →
  le webhook active le boost en quelques secondes → l'annonce porte l'effet,
  l'historique passe « Actif », l'audit trail contient `boost.paye_et_active`.
- Vérifiez aussi dans Stripe : Developers → Webhooks → votre endpoint → les
  livraisons doivent être en `200`.

### Passage en production

1. Activez votre compte Stripe (KYC entreprise auprès de Stripe).
2. Remplacez `STRIPE_SECRET_KEY` par la `sk_live_...`.
3. Créez un **second webhook en mode Live** (même URL, mêmes événements) et
   remplacez `STRIPE_WEBHOOK_SECRET` par son `whsec_...` Live.
4. Redeploy.

> **Pour les paiements de LOCATION** (loyer + caution + commission plateforme),
> l'étape suivante est **Stripe Connect** : les loueurs créeront un compte
> connecté (Express) et la plateforme prélèvera sa commission. Même clé secrète
> `sk_...` — mais il faudra activer Connect dans le dashboard Stripe
> (Settings → Connect). Dites-moi quand vous voulez que je le construise.

---

## 8 bis. Emails transactionnels Brevo

Dès que `BREVO_API_KEY` + `EMAIL_FROM` sont définis, la plateforme envoie de vrais
emails (template HTML de marque sobre, aperçu dans `docs/email-preview.html`) :

- **Bienvenue** à l'inscription (contenu adapté chauffeur / loueur) ;
- **Toutes les notifications** internes sont doublées par email : demande de
  location reçue/acceptée, contrat à signer, état des lieux, litige ouvert/résolu,
  alerte de recherche déclenchée, boost activé…

Un échec d'envoi n'interrompt jamais l'action métier (log serveur uniquement).
Sans clé : notifications internes seulement, aucun envoi simulé.

### Configuration Brevo (5 minutes)

1. [app.brevo.com](https://app.brevo.com) → **Settings → SMTP & API → API Keys →
   Generate a new API key** → copiez la clé `xkeysib-...` → variable `BREVO_API_KEY`.
2. **Senders & Domains → Senders → Add a sender** : ajoutez l'adresse expéditrice
   (ex. `notifications@votredomaine.fr`) et validez-la → variable `EMAIL_FROM`.
3. Fortement recommandé : **Domains → Authenticate your domain** (ajout des
   enregistrements DKIM/SPF chez votre registrar) — sinon vos emails finiront en spam.
4. Redeploy. Testez en créant un compte : l'email de bienvenue doit arriver.

Plan gratuit Brevo : 300 emails/jour — largement suffisant au lancement.

---

## 8 ter. Signature avancée DocuSign (préparé, activation à la demande)

Aujourd'hui les contrats utilisent une signature électronique **simple réelle**
(consentement horodaté + IP + SHA-256 + PDF de preuve) — affichée comme telle,
jamais survendue. Pour passer au niveau **avancé eIDAS** avec DocuSign :

1. Créez un compte développeur : [developers.docusign.com](https://developers.docusign.com)
   (sandbox « demo » gratuite).
2. **Apps & Keys → Add App & Integration Key** :
   - copiez l'**Integration Key** (GUID) → `DOCUSIGN_INTEGRATION_KEY` ;
   - générez une **paire de clés RSA** → collez la clé PRIVÉE dans `DOCUSIGN_PRIVATE_KEY` ;
   - votre **User ID** (GUID, page Apps & Keys) → `DOCUSIGN_USER_ID` ;
   - votre **API Account ID** → `DOCUSIGN_ACCOUNT_ID` ;
   - `DOCUSIGN_BASE_URL` = `https://demo.docusign.net/restapi` (sandbox).
3. Accordez le consentement JWT (une seule fois) : ouvrez l'URL de consentement
   indiquée dans Apps & Keys (scopes `signature impersonation`).
4. Une fois ces variables posées, dites-le moi : je branche le flux complet
   (envelope + embedded signing + webhook Connect « envelope-completed »).
   L'adapter (`src/lib/signature-provider.ts`) détecte déjà la configuration et
   bascule l'affichage sur « Signature avancée via DocuSign (eIDAS) ».

Production : compte payant DocuSign + `DOCUSIGN_BASE_URL=https://eu.docusign.net/restapi`
(données UE). Alternative française : Yousign (`YOUSIGN_API_KEY`), souvent moins chère
et hébergée en France.

---

## 8 quater. Services gratuits intégrés (zéro configuration)

| Service | Usage dans FORVTC | Clé requise |
|---|---|---|
| **API Sirene / INSEE** (recherche-entreprises.api.gouv.fr) | À l'inscription d'un loueur **professionnel** : SIRET contrôlé (format + clé de Luhn) puis vérifié au répertoire — dénomination officielle enregistrée, établissements fermés refusés. Le rattachement compte↔société reste validé par l'admin (statut « déclaré »). Les particuliers ne voient JAMAIS ces champs. | Aucune |
| **BAN — adresse.data.gouv.fr** | Géocodage automatique des véhicules au niveau **commune** (jamais l'adresse privée précise) à la création ; jamais bloquant si l'API est indisponible. | Aucune |
| **MapLibre + OpenStreetMap** | Carte interactive sur la page recherche : marqueurs prix par commune, popup vers l'annonce, cadrage automatique. | Aucune |

---

## 9. Domaine personnalisé + SEO

1. Vercel → Settings → **Domains** → ajoutez `votredomaine.fr` (+ `www`) →
   suivez les instructions DNS (A `76.76.21.21` / CNAME `cname.vercel-dns.com`).
2. Mettez à jour `NEXT_PUBLIC_BASE_URL=https://votredomaine.fr` → Redeploy.
   (Cette URL alimente le sitemap, les canonicals et les URLs de retour Stripe.)
3. HTTPS : automatique (certificat géré par Vercel).
4. SEO déjà en place : `/sitemap.xml` dynamique (annonces réelles, revalidé 1 h),
   `robots.txt`, 14 pages villes `/location-voiture-vtc-{paris,93,94,92,lyon,…}`,
   hub `/location-vtc`, guide `/devenir-chauffeur-vtc`.
5. Déclarez le sitemap dans **Google Search Console** (propriété du domaine →
   Sitemaps → `https://votredomaine.fr/sitemap.xml`).

---

## 9 bis. Lire les logs de build Vercel — ce qui est normal et ce qui ne l'est pas

- `✓ Generating static pages (27/27)` + routes marquées `ƒ (Dynamic)` : **normal**,
  tout le site est rendu à la demande.
- Avertissements npm (`deprecated`, `esbuild postinstall`) : **sans impact**.
- `Error: DATABASE_URL manquant : connectez une base PostgreSQL (Neon)...`
  pendant le build : le build passe quand même, mais cela signifie que la
  variable `DATABASE_URL` n'est **pas** configurée → le site plantera à la
  première requête. Faites la section 2 puis Redeploy.
- Si vous voyez `[db] datadir PGlite` dans un log Vercel : version du code
  antérieure au garde-fou — mettez à jour, l'app refuse désormais explicitement
  de démarrer sans `DATABASE_URL` sur Vercel (aucune perte de données silencieuse).

## 10. Checklist post-déploiement (10 minutes)

- [ ] `https://votre-domaine.fr/` s'affiche (état vide propre : aucune annonce fictive).
- [ ] Inscription d'un compte loueur test → ajout véhicule → dépôt de documents.
- [ ] Connexion admin sur `/admin` → validation des documents → le loueur peut publier.
- [ ] L'annonce apparaît dans `/recherche` et sur sa page ville SEO.
- [ ] Inscription d'un chauffeur → favori + alerte → demande de location.
- [ ] `/dashboard/annonces/{id}/booster` : achat test Stripe (carte 4242…) → boost actif.
- [ ] Stripe → Webhooks → livraisons en 200.
- [ ] `/sitemap.xml` et `/robots.txt` répondent avec le bon domaine.
- [ ] Les fichiers uploadés sont bien accessibles (Blob OK) et refusés aux anonymes (401/403).
- [ ] Un compte non-admin ne peut PAS ouvrir `/admin` (redirection).

---

## 11. Limites actuelles & rappels de sécurité

- **Paiement des locations** : pas encore actif (Stripe Connect = prochaine
  itération). L'UI l'affiche honnêtement ; sans paiement, le passage
  « acceptée → active » se fait à la validation contradictoire de l'état des
  lieux et il est journalisé « sans paiement » dans l'audit.
- **Signature** : niveau « simple » réel (consentement horodaté + IP + SHA-256
  + PDF de preuve). Pour du eIDAS avancé : brancher Yousign (`YOUSIGN_API_KEY`).
- **Emails transactionnels** : notifications internes en place ; brancher un
  fournisseur (Resend/Brevo) pour les emails — à la demande.
- Ne jamais committer `.env`. Rotation de `SESSION_SECRET` = déconnexion de tous
  les utilisateurs (à faire en cas de fuite).
- Avant tout lancement commercial : faire relire les modèles de contrats par un
  juriste, et re-vérifier les règles de `/admin/regles` sur les textes officiels
  (elles citent leurs sources mais ne constituent pas un conseil juridique).
