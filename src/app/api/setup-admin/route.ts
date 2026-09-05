import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BOOTSTRAP ADMIN — création du tout premier compte administrateur, une seule fois.
 * Sécurité (toutes les conditions sont requises) :
 *  1. ADMIN_SETUP_TOKEN doit être défini dans les variables d'environnement ;
 *  2. le jeton fourni doit correspondre (comparaison à temps constant) ;
 *  3. la route se DÉSACTIVE définitivement dès qu'un admin existe (404).
 * Après création : supprimez ADMIN_SETUP_TOKEN de Vercel (défense en profondeur).
 *
 * Usage :
 *   curl -X POST https://votre-domaine/api/setup-admin \
 *     -H "Content-Type: application/json" \
 *     -d '{"token":"LE_JETON","email":"vous@domaine.fr","password":"MotDePasseFort!2026","prenom":"Prénom","nom":"Nom"}'
 */
export async function POST(req: NextRequest) {
  const setupToken = process.env.ADMIN_SETUP_TOKEN;
  if (!setupToken || setupToken.length < 24)
    return NextResponse.json(
      { error: "Route désactivée : définissez ADMIN_SETUP_TOKEN (24 caractères minimum) dans les variables d'environnement." },
      { status: 404 }
    );

  const db = await getDb();
  const dejaAdmin = await db.query.users.findFirst({ where: eq(schema.users.role, "admin") });
  if (dejaAdmin) return NextResponse.json({ error: "Un administrateur existe déjà. Route désactivée." }, { status: 404 });

  let body: { token?: string; email?: string; password?: string; prenom?: string; nom?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON attendu." }, { status: 400 });
  }

  // Comparaison à temps constant
  const a = Buffer.from(String(body.token ?? ""));
  const b = Buffer.from(setupToken);
  const tokenOk = a.length === b.length && timingSafeEqual(a, b);
  if (!tokenOk) return NextResponse.json({ error: "Jeton invalide." }, { status: 403 });

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Email invalide." }, { status: 400 });
  if (password.length < 12) return NextResponse.json({ error: "Mot de passe : 12 caractères minimum." }, { status: 400 });

  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (existing) return NextResponse.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(schema.users)
    .values({
      email,
      passwordHash,
      role: "admin",
      prenom: String(body.prenom ?? "Admin").slice(0, 60),
      nom: String(body.nom ?? "FORVTC").slice(0, 60),
      statutVerification: "verifie",
      emailVerifie: true,
    })
    .returning();

  await db.insert(schema.auditLogs).values({
    acteurId: null,
    action: "admin.cree_via_setup",
    cibleType: "user",
    cibleId: user.id,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  return NextResponse.json({
    ok: true,
    message: `Admin créé : ${user.email}. Connectez-vous sur /connexion puis accédez à /admin. IMPORTANT : supprimez maintenant ADMIN_SETUP_TOKEN des variables d'environnement Vercel.`,
  });
}
