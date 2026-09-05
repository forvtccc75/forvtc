import { emailActif } from "@/lib/email";
import type { CurrentUser } from "@/lib/auth";

/**
 * Vérification email BLOQUANTE pour les actions engageantes (demande de location,
 * publication d'annonce, génération/signature de contrat).
 * Si l'envoi d'emails n'est pas configuré sur l'instance, on ne bloque pas :
 * l'utilisateur n'aurait aucun moyen de vérifier son adresse.
 */
export function emailVerifieRequis(user: Pick<CurrentUser, "emailVerifie">): string | null {
  if (user.emailVerifie) return null;
  if (!emailActif()) return null;
  return "Confirmez d'abord votre adresse email (lien envoyé à l'inscription — bouton « Renvoyer l'email » sur votre tableau de bord).";
}
