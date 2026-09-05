/**
 * SCRIPT DE TEST DEV UNIQUEMENT — recrée le parcours de test end-to-end
 * (comptes de test explicites *.test@example.com, véhicule, documents validés, annonce publiée,
 * réservation acceptée) pour tester les workflows contrats / état des lieux / avis.
 * NE JAMAIS exécuter en production : il s'agit de données de TEST identifiables,
 * pas de données fictives présentées comme réelles.
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { getDb, schema } from "../src/db";

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Interdit en production.");
    process.exit(1);
  }
  const db = await getDb();
  const hash = (p: string) => bcrypt.hash(p, 12);

  async function upsertUser(email: string, role: "chauffeur" | "loueur" | "admin", prenom: string, nom: string, pwd: string) {
    let u = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (!u) {
      [u] = await db
        .insert(schema.users)
        .values({ email, passwordHash: await hash(pwd), role, prenom, nom, statutVerification: role === "admin" ? "verifie" : "non_verifie" })
        .returning();
      if (role === "chauffeur") await db.insert(schema.driverProfiles).values({ userId: u.id, ville: "Paris" });
      if (role === "loueur")
        await db.insert(schema.ownerProfiles).values({ userId: u.id, typeLoueur: "professionnel", raisonSociale: "Test Fleet SARL" });
    }
    return u;
  }

  const admin = await upsertUser("admin@forvtc.fr", "admin", "Admin", "FORVTC", "Adm1n-ForVTC-8bba1bfc");
  const chauffeur = await upsertUser("chauffeur.test@example.com", "chauffeur", "Test", "Chauffeur", "motdepasse-solide-123");
  const loueur = await upsertUser("loueur.test@example.com", "loueur", "Marc", "Loueur", "motdepasse-loueur-123");

  let veh = await db.query.vehicles.findFirst({ where: eq(schema.vehicles.ownerId, loueur.id) });
  if (!veh) {
    [veh] = await db
      .insert(schema.vehicles)
      .values({
        ownerId: loueur.id, marque: "Toyota", modele: "Corolla", finition: "Hybride", annee: 2023,
        kilometrage: 42000, energie: "hybride", boite: "automatique", puissanceKw: 90,
        places: 5, portes: 5, longueurMm: 4630, largeurMm: 1780, couleur: "Noir",
        immatriculation: "AA-123-BB", ville: "Paris", codePostal: "75011", statutVerification: "declare",
      })
      .returning();
  }

  // Documents véhicule : fichier PDF réel déposé puis VALIDÉ par l'admin (workflow réel raccourci en script)
  const storageDir = path.join(process.cwd(), "storage", "documents");
  fs.mkdirSync(storageDir, { recursive: true });
  for (const type of ["carte_grise", "assurance_vehicule", "controle_technique"] as const) {
    const exist = await db.query.documents.findMany({ where: eq(schema.documents.vehicleId, veh.id) });
    if (exist.some((d) => d.type === type)) continue;
    const fname = crypto.randomUUID() + ".pdf";
    fs.writeFileSync(path.join(storageDir, fname), "%PDF-1.4\n%%EOF");
    await db.insert(schema.documents).values({
      ownerUserId: loueur.id, vehicleId: veh.id, type, fichierPath: `documents/${fname}`,
      nomFichier: `${type}.pdf`, statut: "valide", verifiePar: admin.id, verifieLe: new Date(),
      dateExpiration: new Date("2027-09-01"),
    });
    await db.insert(schema.auditLogs).values({ acteurId: admin.id, action: "document.valide", cibleType: "document", cibleId: veh.id, details: { via: "seed-test", type } });
  }

  let listing = await db.query.listings.findFirst({ where: eq(schema.listings.vehicleId, veh.id) });
  if (!listing) {
    [listing] = await db
      .insert(schema.listings)
      .values({
        vehicleId: veh.id, titre: "Toyota Corolla Hybride — entretien inclus — Paris 11e",
        description: "Corolla hybride entretenue.", prixJourCents: 5500, prixSemaineCents: 32000, prixMoisCents: 115000,
        cautionCents: 150000, kmInclusMois: 4000, prixKmSuppCents: 25, dureeMinJours: 7,
        assurance: "conditions_specifiques", assuranceDetails: "RC incluse ; garantie titre onéreux à la charge du chauffeur.",
        entretienInclus: true, conditions: "Carte VTC exigée avant remise des clés.", statut: "publiee", publishedAt: new Date(),
      })
      .returning();
  }

  let booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.driverId, chauffeur.id) });
  if (!booking) {
    [booking] = await db
      .insert(schema.bookings)
      .values({
        listingId: listing.id, driverId: chauffeur.id,
        dateDebut: new Date("2026-10-01T00:00:00Z"), dateFin: new Date("2026-11-30T00:00:00Z"),
        statut: "accepted", prixTotalCents: 230000, cautionCents: 150000,
        message: "Chauffeur VTC depuis 3 ans, activité Paris.",
      })
      .returning();
    await db.insert(schema.availability).values({ vehicleId: veh.id, dateDebut: booking.dateDebut, dateFin: booking.dateFin, statut: "reserve" });
  }

  console.log(JSON.stringify({ bookingId: booking.id, listingId: listing.id, vehicleId: veh.id }));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
