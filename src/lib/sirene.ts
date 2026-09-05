/**
 * Vérification SIRET au répertoire Sirene (INSEE) — GRATUIT, sans clé API,
 * via l'API publique recherche-entreprises.api.gouv.fr (données Sirene INSEE).
 * Règle de vérité : un résultat Sirene prouve l'EXISTENCE de l'établissement,
 * pas que l'utilisateur en est le représentant → le rattachement au compte
 * reste validé par l'admin (statut « déclaré » tant que non validé).
 */

export type SireneResult =
  | { ok: true; siret: string; denomination: string; actif: boolean; adresse: string | null }
  | { ok: false; raison: "introuvable" | "format" | "indisponible" };

export function siretValide(siret: string): boolean {
  const s = siret.replace(/\s/g, "");
  if (!/^\d{14}$/.test(s)) return false;
  // Clé de Luhn (les SIRET La Poste font exception, tolérée ici — l'API tranche)
  let somme = 0;
  for (let i = 0; i < 14; i++) {
    let n = Number(s[i]);
    if (i % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    somme += n;
  }
  return somme % 10 === 0 || s.startsWith("356000000"); // exception La Poste
}

export async function verifierSiret(siretBrut: string): Promise<SireneResult> {
  const siret = siretBrut.replace(/\s/g, "");
  if (!siretValide(siret)) return { ok: false, raison: "format" };
  try {
    const res = await fetch(
      `https://recherche-entreprises.api.gouv.fr/search?q=${siret}&mtm_campaign=forvtc`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return { ok: false, raison: "indisponible" };
    const data = (await res.json()) as {
      results?: Array<{
        nom_complet?: string;
        nom_raison_sociale?: string;
        siege?: { siret?: string; adresse?: string; etat_administratif?: string };
        matching_etablissements?: Array<{ siret?: string; adresse?: string; etat_administratif?: string }>;
      }>;
    };
    for (const r of data.results ?? []) {
      const etabs = [r.siege, ...(r.matching_etablissements ?? [])];
      const etab = etabs.find((e) => e?.siret === siret);
      if (etab) {
        return {
          ok: true,
          siret,
          denomination: r.nom_raison_sociale || r.nom_complet || "—",
          actif: etab.etat_administratif !== "F",
          adresse: etab.adresse ?? null,
        };
      }
    }
    return { ok: false, raison: "introuvable" };
  } catch {
    return { ok: false, raison: "indisponible" };
  }
}
