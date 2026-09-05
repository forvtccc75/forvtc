/**
 * Emails transactionnels via Brevo (API v3) — actif dès que BREVO_API_KEY est défini.
 * Sans clé : aucun email n'est envoyé (les notifications internes restent en place),
 * et rien n'est simulé.
 *
 * Un seul template HTML de marque, sobre et professionnel (inline CSS, compatible
 * clients mail), décliné par message. Jamais de contenu inventé : les emails ne
 * contiennent que des faits issus de la plateforme.
 */

const BRAND = {
  nom: "FORVTC",
  couleur: "#123d8e",
  couleurClair: "#eef6ff",
};

export function emailActif(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_FROM);
}

type EmailContenu = {
  titre: string;
  sousTitre?: string;
  paragraphes: string[];
  /** Encart coloré : info (bleu), alerte (orange), urgent (rouge), succes (vert) */
  encart?: { type: "info" | "alerte" | "urgent" | "succes"; texte: string };
  cta?: { label: string; url: string };
  /** Petites lignes récapitulatives affichées dans une boîte grise (ex. échéances) */
  recap?: { label: string; valeur: string }[];
  pied?: string;
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const ENCARTS = {
  info: { fond: "#eff6ff", bord: "#3b82f6", texte: "#1e40af", icone: "ℹ️" },
  alerte: { fond: "#fffbeb", bord: "#f59e0b", texte: "#92400e", icone: "⚠️" },
  urgent: { fond: "#fef2f2", bord: "#ef4444", texte: "#991b1b", icone: "🚨" },
  succes: { fond: "#f0fdf4", bord: "#22c55e", texte: "#166534", icone: "✅" },
} as const;

/** Template HTML de base — inline CSS, rendu propre sur Gmail/Outlook/Apple Mail. */
export function renderEmailHtml(c: EmailContenu): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "";
  const enc = c.encart ? ENCARTS[c.encart.type] : null;
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 4px 12px;" align="center">
          <a href="${base}" style="font-size:22px;font-weight:800;color:${BRAND.couleur};text-decoration:none;letter-spacing:-0.5px;">🚘 ${BRAND.nom}</a>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;padding:28px;">
          <h1 style="margin:0 0 6px;font-size:19px;line-height:1.35;color:#0f172a;">${esc(c.titre)}</h1>
          ${c.sousTitre ? `<p style="margin:0 0 16px;font-size:13px;color:#64748b;">${esc(c.sousTitre)}</p>` : `<div style="height:10px;"></div>`}
          ${c.paragraphes.map((p) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#334155;">${esc(p)}</p>`).join("")}
          ${
            enc && c.encart
              ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;"><tr>
                   <td style="background:${enc.fond};border-left:4px solid ${enc.bord};border-radius:0 8px 8px 0;padding:12px 14px;">
                     <p style="margin:0;font-size:13px;line-height:1.6;color:${enc.texte};font-weight:600;">${enc.icone} ${esc(c.encart.texte)}</p>
                   </td>
                 </tr></table>`
              : ""
          }
          ${
            c.recap && c.recap.length
              ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
                   ${c.recap
                     .map(
                       (r, i) => `<tr>
                     <td style="padding:9px 14px;${i < c.recap!.length - 1 ? "border-bottom:1px solid #e2e8f0;" : ""}font-size:13px;color:#64748b;">${esc(r.label)}</td>
                     <td style="padding:9px 14px;${i < c.recap!.length - 1 ? "border-bottom:1px solid #e2e8f0;" : ""}font-size:13px;color:#0f172a;font-weight:700;" align="right">${esc(r.valeur)}</td>
                   </tr>`
                     )
                     .join("")}
                 </table>`
              : ""
          }
          ${
            c.cta
              ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;"><tr><td align="center" style="border-radius:8px;background:${BRAND.couleur};">
                   <a href="${c.cta.url}" style="display:block;padding:13px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${esc(c.cta.label)}</a>
                 </td></tr></table>
                 <p style="margin:10px 0 0;font-size:11px;line-height:1.5;color:#94a3b8;" align="center">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><span style="word-break:break-all;color:#64748b;">${c.cta.url}</span></p>`
              : ""
          }
        </td></tr>
        <tr><td style="padding:16px 8px 0;font-size:11px;line-height:1.6;color:#64748b;">
          ${c.pied ? `<p style="margin:0 0 8px;">${esc(c.pied)}</p>` : ""}
          <p style="margin:0;">${BRAND.nom} — mise en relation entre chauffeurs VTC et loueurs de véhicules.
          La location d'un véhicule ne confère pas le droit d'exercer comme chauffeur VTC (carte professionnelle,
          inscription REVTC et assurance transport de personnes à titre onéreux requises).</p>
          <p style="margin:8px 0 0;">Vous recevez cet email car un compte existe à cette adresse sur ${BRAND.nom}.
          Gérez vos notifications depuis votre tableau de bord.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Envoi via l'API Brevo. Ne lève jamais : un échec d'email ne casse pas l'action métier. */
export async function envoyerEmail(
  destinataire: { email: string; nom?: string },
  sujet: string,
  contenu: EmailContenu
): Promise<boolean> {
  if (!emailActif()) return false;
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY as string,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: {
          email: process.env.EMAIL_FROM,
          name: process.env.EMAIL_FROM_NAME || BRAND.nom,
        },
        to: [{ email: destinataire.email, name: destinataire.nom }],
        subject: sujet,
        htmlContent: renderEmailHtml(contenu),
      }),
      signal: AbortSignal.timeout(5000), // ne bloque jamais une action plus de 5 s
    });
    if (!res.ok) console.error("[brevo] envoi refusé", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) {
    console.error("[brevo] envoi échoué", e);
    return false;
  }
}

/* ----------------------- Emails types (contenus pro) ----------------------- */

const base = () => process.env.NEXT_PUBLIC_BASE_URL || "";

export const EMAILS = {
  bienvenue: (prenom: string, role: "chauffeur" | "loueur") => ({
    sujet: `Bienvenue sur FORVTC, ${prenom}`,
    contenu: {
      titre: `Bienvenue sur FORVTC, ${prenom} !`,
      paragraphes:
        role === "chauffeur"
          ? [
              "Votre compte chauffeur est créé. Vous pouvez dès maintenant rechercher un véhicule, créer des alertes et envoyer des demandes de location.",
              "Pour accélérer vos futures locations, déposez vos documents (carte VTC, permis) depuis votre tableau de bord : ils seront examinés par notre équipe et votre profil affichera un statut vérifié auprès des loueurs.",
            ]
          : [
              "Votre compte loueur est créé. Ajoutez votre premier véhicule et déposez ses documents (carte grise, assurance, contrôle technique).",
              "Votre annonce sera publiable dès validation des documents par notre équipe — c'est ce qui garantit aux chauffeurs des annonces fiables, et à vous des locataires sérieux.",
            ],
      cta: { label: "Accéder à mon tableau de bord", url: `${base()}/dashboard` },
    },
  }),

  resetMdp: (prenom: string, lien: string) => ({
    sujet: "Réinitialisez votre mot de passe FORVTC 🔑",
    contenu: {
      titre: `Bonjour ${prenom}, on change ce mot de passe ?`,
      sousTitre: "Demande de réinitialisation reçue à l'instant",
      paragraphes: [
        "Quelqu'un (vous, normalement !) a demandé à réinitialiser le mot de passe de votre compte FORVTC. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.",
      ],
      recap: [
        { label: "Validité du lien", valeur: "1 heure" },
        { label: "Utilisable", valeur: "1 seule fois" },
      ],
      encart: {
        type: "info" as const,
        texte: "Ce n'était pas vous ? Ignorez simplement cet email : votre mot de passe actuel reste valable et personne ne peut accéder à votre compte.",
      },
      cta: { label: "🔑 Choisir un nouveau mot de passe", url: lien },
      pied: "Pour votre sécurité, FORVTC ne vous demandera jamais votre mot de passe par email ou par téléphone.",
    },
  }),

  verifEmail: (prenom: string, lien: string) => ({
    sujet: "Une dernière étape : confirmez votre email ✉️",
    contenu: {
      titre: `${prenom}, confirmez votre adresse email`,
      sousTitre: "30 secondes pour débloquer tout FORVTC",
      paragraphes: [
        "Un simple clic sur le bouton ci-dessous et c'est fait. Cette confirmation nous permet de vérifier que cette adresse est bien la vôtre — c'est ce qui protège votre compte et sécurise les échanges entre chauffeurs et loueurs.",
      ],
      recap: [
        { label: "Ce que ça débloque", valeur: "Demandes, annonces, contrats" },
        { label: "Validité du lien", valeur: "24 heures" },
      ],
      cta: { label: "✅ Confirmer mon adresse email", url: lien },
      pied: "Lien expiré ? Connectez-vous et cliquez sur « Renvoyer l'email » depuis votre tableau de bord.",
    },
  }),

  relanceDocument: (prenom: string, typeDoc: string, dateExpiration: string, jours: number, lien: string) => ({
    sujet:
      jours <= 7
        ? `🚨 Plus que ${jours} jours : votre ${typeDoc} expire le ${dateExpiration}`
        : `⏰ Pensez-y : votre ${typeDoc} expire dans ${jours} jours`,
    contenu: {
      titre: jours <= 7 ? `${prenom}, il est temps d'agir !` : `${prenom}, une échéance approche`,
      sousTitre: `Renouvellement de document — rappel à J-${jours}`,
      paragraphes: [
        `Votre document « ${typeDoc} » arrive bientôt à expiration. Pour éviter toute interruption (annonce dépubliée, profil non vérifié), déposez la version à jour dès maintenant — notre équipe la validera rapidement.`,
      ],
      recap: [
        { label: "Document concerné", valeur: typeDoc },
        { label: "Date d'expiration", valeur: dateExpiration },
        { label: "Temps restant", valeur: `${jours} jours` },
      ],
      encart:
        jours <= 7
          ? { type: "urgent" as const, texte: "Passé cette date, le document sera marqué « expiré » et les annonces ou vérifications qui en dépendent seront suspendues automatiquement." }
          : { type: "alerte" as const, texte: "Anticipez : un document déposé aujourd'hui est validé avant l'échéance, sans aucune interruption pour vous." },
      cta: { label: "📄 Déposer le document à jour", url: lien },
    },
  }),

  documentExpire: (prenom: string, typeDoc: string, lien: string) => ({
    sujet: `🚨 Votre ${typeDoc} a expiré — action requise`,
    contenu: {
      titre: `${prenom}, un document a expiré`,
      sousTitre: "Certaines fonctionnalités peuvent être suspendues",
      paragraphes: [
        `Votre document « ${typeDoc} » est arrivé à expiration et n'est plus valable sur FORVTC. Les annonces ou vérifications qui en dépendent peuvent être suspendues jusqu'au dépôt d'une version à jour.`,
        "Bonne nouvelle : il suffit de déposer le nouveau document pour que tout reparte. Notre équipe le validera rapidement.",
      ],
      encart: { type: "urgent" as const, texte: "Tant qu'un document obligatoire est expiré, l'annonce liée ne peut pas rester publiée — c'est ce qui garantit des annonces fiables à tous." },
      cta: { label: "📄 Déposer le nouveau document", url: lien },
    },
  }),

  notification: (titre: string, corps: string, url?: string) => ({
    sujet: `FORVTC — ${titre}`,
    contenu: {
      titre,
      paragraphes: [corps],
      cta: url ? { label: "Voir sur FORVTC", url } : { label: "Ouvrir mon tableau de bord", url: `${base()}/dashboard` },
    },
  }),
};
