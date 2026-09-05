import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { consommerToken } from "@/lib/tokens";
import { audit } from "@/lib/audit";

/** Lien cliqué depuis l'email de vérification. Token à usage unique. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const userId = await consommerToken(token, "verif_email");
  const base = req.nextUrl.origin;
  if (!userId)
    return NextResponse.redirect(`${base}/connexion?erreur=${encodeURIComponent("Lien de vérification invalide ou expiré. Reconnectez-vous puis cliquez sur « Renvoyer l'email ».")}`);

  const db = await getDb();
  await db.update(schema.users).set({ emailVerifie: true }).where(eq(schema.users.id, userId));
  await audit(userId, "user.email_verifie", { type: "user", id: userId });
  return NextResponse.redirect(`${base}/dashboard?ok=${encodeURIComponent("Adresse email confirmée ✔")}`);
}
