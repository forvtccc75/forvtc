/**
 * Création sécurisée d'un compte administrateur — CLI uniquement, jamais exposé sur le web.
 * Usage : npm run create-admin -- email@domaine.fr "MotDePasseFort" Prénom Nom
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";

async function main() {
  const [email, password, prenom = "Admin", nom = "FORVTC"] = process.argv.slice(2);
  if (!email || !password || password.length < 12) {
    console.error("Usage : npm run create-admin -- email password(12+ caractères) [prenom] [nom]");
    process.exit(1);
  }
  const db = await getDb();
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email.toLowerCase()) });
  if (existing) {
    console.error("Un compte existe déjà avec cet email.");
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(schema.users)
    .values({ email: email.toLowerCase(), passwordHash, role: "admin", prenom, nom, statutVerification: "verifie", emailVerifie: true })
    .returning();
  await db.insert(schema.auditLogs).values({ acteurId: null, action: "admin.cree_via_cli", cibleType: "user", cibleId: user.id });
  console.log(`Admin créé : ${user.email} (${user.id})`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
