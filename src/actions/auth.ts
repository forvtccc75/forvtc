"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { createSession, destroySession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { verifierSiret } from "@/lib/sirene";
import { envoyerEmail, EMAILS, emailActif } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { creerToken } from "@/lib/tokens";
import { baseUrl } from "@/lib/stripe";

const inscriptionSchema = z.object({
  role: z.enum(["chauffeur", "loueur"]),
  prenom: z.string().trim().min(2, "Prénom requis (2 caractères minimum)."),
  nom: z.string().trim().min(2, "Nom requis."),
  email: z.string().trim().toLowerCase().email("Email invalide."),
  telephone: z.string().trim().max(20).optional().or(z.literal("")),
  password: z.string().min(10, "Mot de passe : 10 caractères minimum."),
  typeLoueur: z.enum(["particulier", "professionnel"]).optional(),
  raisonSociale: z.string().trim().max(120).optional().or(z.literal("")),
  siret: z.string().trim().max(20).optional().or(z.literal("")),
  cgu: z.literal("on", { errorMap: () => ({ message: "Vous devez accepter les conditions d'utilisation." }) }),
});

function fail(path: string, message: string): never {
  redirect(`${path}?erreur=${encodeURIComponent(message)}`);
}

export async function inscription(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = inscriptionSchema.safeParse(raw);
  if (!parsed.success) fail("/inscription", parsed.error.errors[0].message);
  const d = parsed.data;

  // Anti-création de comptes en masse : 5 inscriptions / heure / IP
  const rlIns = await rateLimit("inscription", clientIp(), 5, 3600);
  if (!rlIns.ok) fail("/inscription", "Trop d'inscriptions depuis cette adresse. Réessayez plus tard.");

  // Loueur PROFESSIONNEL : SIRET vérifié au répertoire Sirene (INSEE).
  // Particulier / chauffeur : aucun champ société demandé ni exigé.
  let sirene: { siret: string; denomination: string } | null = null;
  if (d.role === "loueur" && d.typeLoueur === "professionnel") {
    if (!d.siret) fail("/inscription", "Le SIRET est requis pour un loueur professionnel (14 chiffres).");
    const v = await verifierSiret(d.siret);
    if (!v.ok) {
      if (v.raison === "format") fail("/inscription", "SIRET invalide : 14 chiffres attendus.");
      if (v.raison === "introuvable") fail("/inscription", "Ce SIRET est introuvable au répertoire Sirene (INSEE). Vérifiez votre saisie.");
      fail("/inscription", "Le répertoire Sirene est momentanément indisponible. Réessayez dans quelques instants.");
    }
    if (!v.actif) fail("/inscription", "Cet établissement est fermé au répertoire Sirene. Un établissement actif est requis.");
    sirene = { siret: v.siret, denomination: v.denomination };
  }

  let user: typeof schema.users.$inferSelect;
  try {
    const db = await getDb();
    const existing = await db.query.users.findFirst({ where: eq(schema.users.email, d.email) });
    if (existing) fail("/inscription", "Un compte existe déjà avec cet email.");

    const passwordHash = await bcrypt.hash(d.password, 12);
    [user] = await db
      .insert(schema.users)
      .values({
        email: d.email,
        passwordHash,
        role: d.role,
        prenom: d.prenom,
        nom: d.nom,
        telephone: d.telephone || null,
        statutVerification: "non_verifie",
      })
      .returning();

    if (d.role === "chauffeur") {
      await db.insert(schema.driverProfiles).values({ userId: user.id });
    } else {
      await db.insert(schema.ownerProfiles).values({
        userId: user.id,
        typeLoueur: d.typeLoueur ?? "particulier",
        // Dénomination officielle Sirene prioritaire sur la saisie libre
        raisonSociale: sirene?.denomination ?? (d.raisonSociale || null),
        siretDeclare: sirene?.siret ?? null,
        sirenDeclare: sirene ? sirene.siret.slice(0, 9) : null,
        // SIRET existant ≠ rattachement prouvé au compte → reste « déclaré »
        statutPro: sirene ? "declare" : "non_verifie",
      });
    }
  } catch (e) {
    // redirect() de fail() passe par une exception interne Next : on la laisse remonter
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error("[inscription] échec", e);
    fail("/inscription", "Le service est momentanément indisponible. Réessayez dans quelques instants.");
  }

  await audit(user.id, "user.inscription", { type: "user", id: user.id }, { role: d.role, siretVerifie: Boolean(sirene) });
  // Email de bienvenue (si Brevo actif) — jamais bloquant
  const mail = EMAILS.bienvenue(d.prenom, d.role);
  await envoyerEmail({ email: d.email, nom: `${d.prenom} ${d.nom}` }, mail.sujet, mail.contenu);
  // Email de vérification d'adresse (token 24 h, usage unique)
  if (emailActif()) {
    const vtoken = await creerToken(user.id, "verif_email", 60 * 24);
    const vmail = EMAILS.verifEmail(d.prenom, `${baseUrl()}/api/verifier-email?token=${vtoken}`);
    await envoyerEmail({ email: d.email, nom: `${d.prenom} ${d.nom}` }, vmail.sujet, vmail.contenu);
  }
  await createSession({ userId: user.id, role: user.role, prenom: user.prenom });
  redirect("/dashboard");
}

const connexionSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide."),
  password: z.string().min(1, "Mot de passe requis."),
});

export async function connexion(formData: FormData): Promise<void> {
  const parsed = connexionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) fail("/connexion", parsed.error.errors[0].message);
  const d = parsed.data;

  // Anti-bruteforce : 10 tentatives / 15 min par IP, 5 / 15 min par couple IP+email
  const ip = clientIp();
  const rlIp = await rateLimit("login-ip", ip, 10, 900);
  const rlCompte = await rateLimit("login", `${ip}:${d.email}`, 5, 900);
  if (!rlIp.ok || !rlCompte.ok)
    fail("/connexion", "Trop de tentatives de connexion. Réessayez dans 15 minutes.");

  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, d.email) });
  // Message identique que l'email existe ou non (anti-énumération)
  if (!user || !(await bcrypt.compare(d.password, user.passwordHash)))
    fail("/connexion", "Email ou mot de passe incorrect.");
  if (user.suspendu || user.deletedAt) fail("/connexion", "Ce compte est suspendu. Contactez le support.");

  await audit(user.id, "user.connexion", { type: "user", id: user.id });
  await createSession({ userId: user.id, role: user.role, prenom: user.prenom });
  redirect(user.role === "admin" ? "/admin" : "/dashboard");
}

export async function deconnexion(): Promise<void> {
  destroySession();
  redirect("/");
}
