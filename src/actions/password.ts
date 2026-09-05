"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { audit } from "@/lib/audit";
import { creerToken, consommerToken } from "@/lib/tokens";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { envoyerEmail, emailActif, EMAILS } from "@/lib/email";
import { baseUrl } from "@/lib/stripe";
import { currentUser } from "@/lib/auth";

function fail(path: string, message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}erreur=${encodeURIComponent(message)}`);
}

/**
 * Demande de réinitialisation : réponse IDENTIQUE que l'email existe ou non
 * (pas d'énumération de comptes). Token 60 min, usage unique, hashé en base.
 */
export async function demanderResetMdp(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success)
    fail("/mot-de-passe-oublie", "Adresse email invalide.");
  if (!emailActif())
    fail("/mot-de-passe-oublie", "L'envoi d'emails n'est pas configuré sur cette instance — contactez le support.");

  const rl = await rateLimit("reset", clientIp(), 5, 3600);
  if (!rl.ok) fail("/mot-de-passe-oublie", "Trop de demandes. Réessayez dans une heure.");

  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (user && !user.deletedAt && !user.suspendu) {
    const token = await creerToken(user.id, "reset_mdp", 60);
    const lien = `${baseUrl()}/reinitialiser?token=${token}`;
    const mail = EMAILS.resetMdp(user.prenom, lien);
    await envoyerEmail({ email: user.email, nom: `${user.prenom} ${user.nom}` }, mail.sujet, mail.contenu);
    await audit(user.id, "user.reset_demande", { type: "user", id: user.id });
  }
  // Toujours le même message — qu'un compte existe ou non
  redirect(`/mot-de-passe-oublie?ok=${encodeURIComponent("Si un compte existe avec cette adresse, un email de réinitialisation vient d'être envoyé (valable 1 heure).")}`);
}

const resetSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(10, "Mot de passe : 10 caractères minimum."),
});

export async function reinitialiserMdp(formData: FormData): Promise<void> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData.entries()));
  const token = String(formData.get("token") ?? "");
  const back = `/reinitialiser?token=${encodeURIComponent(token)}`;
  if (!parsed.success) fail(back, parsed.error.errors[0].message);

  const rl = await rateLimit("reset-confirm", clientIp(), 10, 3600);
  if (!rl.ok) fail(back, "Trop de tentatives. Réessayez plus tard.");

  const userId = await consommerToken(parsed.data.token, "reset_mdp");
  if (!userId) fail("/mot-de-passe-oublie", "Lien invalide ou expiré. Refaites une demande.");

  const db = await getDb();
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, userId));
  await audit(userId, "user.mdp_reinitialise", { type: "user", id: userId });
  redirect(`/connexion?ok=${encodeURIComponent("Mot de passe modifié. Connectez-vous avec le nouveau.")}`);
}

/** Renvoi de l'email de vérification (depuis le bandeau du dashboard). */
export async function renvoyerVerification(): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/connexion");
  if (user.emailVerifie) redirect("/dashboard");
  if (!emailActif()) fail("/dashboard", "L'envoi d'emails n'est pas configuré sur cette instance.");

  const rl = await rateLimit("verif-email", user.id, 3, 3600);
  if (!rl.ok) fail("/dashboard", "Trop de renvois. Réessayez dans une heure.");

  const token = await creerToken(user.id, "verif_email", 60 * 24);
  const lien = `${baseUrl()}/api/verifier-email?token=${token}`;
  const mail = EMAILS.verifEmail(user.prenom, lien);
  await envoyerEmail({ email: user.email, nom: `${user.prenom} ${user.nom}` }, mail.sujet, mail.contenu);
  redirect(`/dashboard?ok=${encodeURIComponent("Email de vérification renvoyé — vérifiez votre boîte de réception.")}`);
}
