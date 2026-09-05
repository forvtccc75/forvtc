import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import fs from "fs";
import path from "path";

const COOKIE = "forvtc_session";

export type Session = { userId: string; role: string; prenom: string };

let cachedSecret: Uint8Array | null = null;
function secret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  let s = process.env.SESSION_SECRET;
  if (!s && (process.env.VERCEL || process.env.NODE_ENV === "production")) {
    // Production : OBLIGATOIRE. Un secret par instance casserait les sessions en silence.
    throw new Error("SESSION_SECRET manquant : définissez-le dans les variables d'environnement.");
  }
  if (!s) {
    // Dev uniquement : secret persistant local (gitignoré). En prod : SESSION_SECRET obligatoire.
    const f = path.join(process.cwd(), ".session-secret");
    if (fs.existsSync(f)) s = fs.readFileSync(f, "utf8").trim();
    else {
      s = crypto.randomUUID() + crypto.randomUUID();
      fs.writeFileSync(f, s, { mode: 0o600 });
    }
  }
  cachedSecret = new TextEncoder().encode(s);
  return cachedSecret;
}

export async function createSession(payload: Session): Promise<void> {
  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession(): Promise<Session | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export function destroySession(): void {
  cookies().delete(COOKIE);
}
