/**
 * Géocodage via la Base Adresse Nationale (adresse.data.gouv.fr) — GRATUIT, sans clé.
 * Volontairement limité au niveau COMMUNE (ville + code postal) :
 * on ne géocode JAMAIS l'adresse précise d'un particulier (règle vie privée —
 * pas d'adresse privée exposée sur une carte publique).
 */

export type GeoPoint = { lat: string; lng: string };

export async function geocoderVille(ville: string, codePostal: string): Promise<GeoPoint | null> {
  try {
    const q = encodeURIComponent(`${ville} ${codePostal}`);
    const res = await fetch(
      `https://api-adresse.data.gouv.fr/search/?q=${q}&type=municipality&limit=1`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
    };
    const coords = data.features?.[0]?.geometry?.coordinates;
    if (!coords) return null;
    return { lng: String(coords[0]), lat: String(coords[1]) };
  } catch {
    return null; // le géocodage est un plus, jamais bloquant
  }
}
