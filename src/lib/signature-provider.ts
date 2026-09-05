/**
 * ADAPTER SIGNATURE ÉLECTRONIQUE.
 * - "interne_simple" : signature électronique simple RÉELLE (consentement exprès
 *   horodaté + IP + empreinte SHA-256 du document). Niveau eIDAS « simple » :
 *   valeur probante limitée, affichée comme telle dans l'UI.
 * - "docusign" : signature avancée — activée quand DOCUSIGN_INTEGRATION_KEY,
 *   DOCUSIGN_USER_ID, DOCUSIGN_ACCOUNT_ID et DOCUSIGN_PRIVATE_KEY sont configurés
 *   (auth JWT Grant : https://developers.docusign.com/platform/auth/jwt/).
 *   Flux : créer une envelope avec le PDF + 2 signataires (embedded signing),
 *   webhook DocuSign Connect « envelope-completed » pour finaliser côté FORVTC.
 * - "yousign" : alternative française eIDAS (YOUSIGN_API_KEY).
 * L'UI n'affiche JAMAIS un niveau de signature supérieur au provider réellement actif.
 */
export type SignatureProvider = "interne_simple" | "docusign" | "yousign";

export function docusignConfigured(): boolean {
  return Boolean(
    process.env.DOCUSIGN_INTEGRATION_KEY &&
      process.env.DOCUSIGN_USER_ID &&
      process.env.DOCUSIGN_ACCOUNT_ID &&
      process.env.DOCUSIGN_PRIVATE_KEY
  );
}

export function providerActif(): SignatureProvider {
  if (docusignConfigured()) return "docusign";
  if (process.env.YOUSIGN_API_KEY) return "yousign";
  return "interne_simple";
}

export function descriptionProvider(p: SignatureProvider): string {
  if (p === "docusign") return "Signature électronique avancée via DocuSign (eIDAS).";
  if (p === "yousign") return "Signature électronique avancée via Yousign (eIDAS).";
  return "Signature électronique simple : consentement exprès horodaté, adresse IP et empreinte du document consignés. Pour une valeur probante renforcée, la plateforme activera un fournisseur eIDAS (DocuSign / Yousign).";
}

export const CONSENT_TEXT =
  "En cliquant sur « Signer le contrat », je reconnais avoir lu l'intégralité du contrat ci-dessus, " +
  "j'en accepte les termes et je consens à le signer électroniquement. Cette signature m'engage " +
  "au même titre qu'une signature manuscrite dans les limites prévues par la loi.";
