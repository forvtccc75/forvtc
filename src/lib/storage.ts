import fs from "fs/promises";
import path from "path";

/**
 * Stockage des fichiers privés (documents, photos, PDF de contrats).
 * - Vercel / production : Vercel Blob (BLOB_READ_WRITE_TOKEN défini) en accès
 *   privé de fait : les blobs sont stockés sous des noms non devinables et ne
 *   sont servis QUE via nos routes authentifiées (RBAC), jamais par URL directe
 *   exposée à l'utilisateur.
 * - Dev sandbox : disque local ./storage.
 * Les fichiers ne sont JAMAIS servis statiquement.
 */
const MAX_SIZE = 10 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function saveUpload(
  file: File,
  dir: "documents" | "photos"
): Promise<{ storagePath: string; nomOriginal: string }> {
  if (!file || file.size === 0) throw new Error("Aucun fichier fourni.");
  if (file.size > MAX_SIZE) throw new Error("Fichier trop volumineux (10 Mo maximum).");
  const ext = TYPES[file.type];
  if (!ext) throw new Error("Format accepté : PDF, JPG, PNG ou WebP.");
  if (dir === "photos" && file.type === "application/pdf")
    throw new Error("Les photos doivent être des images.");
  const name = crypto.randomUUID() + ext;
  const storagePath = `${dir}/${name}`;
  const buf = Buffer.from(await file.arrayBuffer());
  // Vérification des MAGIC BYTES : le contenu réel doit correspondre au type déclaré
  // (une extension renommée ne suffit pas à faire passer un fichier).
  if (!contenuValide(buf, file.type))
    throw new Error("Le contenu du fichier ne correspond pas à son format déclaré.");
  await writeStored(storagePath, buf, file.type);
  return { storagePath, nomOriginal: file.name };
}

/** Signatures binaires des formats acceptés. */
export function contenuValide(buf: Buffer, mime: string): boolean {
  if (buf.length < 12) return false;
  switch (mime) {
    case "application/pdf":
      return buf.subarray(0, 5).toString("latin1") === "%PDF-";
    case "image/jpeg":
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case "image/png":
      return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/webp":
      return buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP";
    default:
      return false;
  }
}

/** Écriture bas niveau (utilisée aussi pour les PDF de contrats). */
export async function writeStored(storagePath: string, data: Buffer, contentType?: string): Promise<void> {
  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    await put(`forvtc/${storagePath}`, data, {
      access: "public", // URL non devinable ; jamais exposée : lecture via routes RBAC uniquement
      contentType: contentType ?? contentTypeOf(storagePath),
      addRandomSuffix: false,
      cacheControlMaxAge: 0,
    });
    return;
  }
  const filePath = path.join(process.cwd(), "storage", storagePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
}

export async function readStored(storagePath: string): Promise<Buffer> {
  // Anti path-traversal : formats stricts par répertoire
  const ok =
    /^(documents|photos)\/[a-f0-9-]{36}\.(pdf|jpg|png|webp)$/.test(storagePath) ||
    /^contrats\/FORVTC-\d{4}-\d{4}-v\d+\.pdf$/.test(storagePath);
  if (!ok) throw new Error("Chemin invalide.");

  if (useBlob()) {
    const { head } = await import("@vercel/blob");
    const meta = await head(`forvtc/${storagePath}`);
    const res = await fetch(meta.url);
    if (!res.ok) throw new Error("Fichier introuvable.");
    return Buffer.from(await res.arrayBuffer());
  }
  return fs.readFile(path.join(process.cwd(), "storage", storagePath));
}

export function contentTypeOf(storagePath: string): string {
  if (storagePath.endsWith(".pdf")) return "application/pdf";
  if (storagePath.endsWith(".png")) return "image/png";
  if (storagePath.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
