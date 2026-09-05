/**
 * Tests d'intégration avec base réelle (PGlite jetable en mémoire de test) :
 * - anti-double réservation (periodeDisponible)
 * - transitions contrôlées et journalisées (transitionBooking)
 * - tokens à usage unique
 * - rate limiting
 * IMPORTANT : utilise un datadir isolé (pas le pgdata du serveur dev).
 * Lancement : npm test (le serveur dev doit être coupé — PGlite mono-processus non requis
 * ici car datadir séparé).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.FORVTC_PGDATA = "/tmp/forvtc-test-pgdata-" + Date.now();

import { getDb, schema } from "../src/db";
import { periodeDisponible, transitionBooking } from "../src/lib/booking";
import { creerToken, consommerToken } from "../src/lib/tokens";
import { rateLimit } from "../src/lib/rate-limit";

let ownerId: string;
let driverId: string;
let vehicleId: string;
let listingId: string;

before(async () => {
  const db = await getDb();
  const [owner] = await db
    .insert(schema.users)
    .values({ email: "t-owner@test.local", passwordHash: "x", role: "loueur", prenom: "T", nom: "Owner" })
    .returning();
  const [driver] = await db
    .insert(schema.users)
    .values({ email: "t-driver@test.local", passwordHash: "x", role: "chauffeur", prenom: "T", nom: "Driver" })
    .returning();
  ownerId = owner.id;
  driverId = driver.id;
  const [veh] = await db
    .insert(schema.vehicles)
    .values({
      ownerId,
      marque: "Test",
      modele: "Car",
      annee: 2023,
      immatriculation: "TT-000-TT",
      energie: "hybride",
      boite: "automatique",
      places: 5,
      portes: 5,
      puissanceKw: 100,
      longueurMm: 4600,
      largeurMm: 1800,
      kilometrage: 1000,
      ville: "Paris",
      codePostal: "75001",
    })
    .returning();
  vehicleId = veh.id;
  const [lst] = await db
    .insert(schema.listings)
    .values({ vehicleId, titre: "Annonce test intégration", cautionCents: 100000, dureeMinJours: 1, assurance: "non_incluse", statut: "publiee" })
    .returning();
  listingId = lst.id;
});

test("anti-double réservation : période libre puis bloquée", async () => {
  const db = await getDb();
  const d1 = new Date("2030-01-01");
  const f1 = new Date("2030-03-01");

  const avant = await periodeDisponible(listingId, vehicleId, d1, f1);
  assert.equal(avant.libre, true);

  // Booking accepté sur la période (statut bloquant)
  await db.insert(schema.bookings).values({
    listingId,
    driverId,
    dateDebut: d1,
    dateFin: f1,
    statut: "accepted",
    prixTotalCents: 100000,
  });

  const apres = await periodeDisponible(listingId, vehicleId, new Date("2030-02-01"), new Date("2030-04-01"));
  assert.equal(apres.libre, false, "un chevauchement doit bloquer");

  const disjoint = await periodeDisponible(listingId, vehicleId, new Date("2030-05-01"), new Date("2030-06-01"));
  assert.equal(disjoint.libre, true, "une période disjointe reste libre");
});

test("une demande simple (requested) ne bloque pas le calendrier", async () => {
  const db = await getDb();
  await db.insert(schema.bookings).values({
    listingId,
    driverId,
    dateDebut: new Date("2031-01-01"),
    dateFin: new Date("2031-02-01"),
    statut: "requested",
    prixTotalCents: 100000,
  });
  const r = await periodeDisponible(listingId, vehicleId, new Date("2031-01-10"), new Date("2031-01-20"));
  assert.equal(r.libre, true);
});

test("transitionBooking : refuse les transitions non déclarées", async () => {
  const db = await getDb();
  const [b] = await db
    .insert(schema.bookings)
    .values({ listingId, driverId, dateDebut: new Date("2032-01-01"), dateFin: new Date("2032-02-01"), statut: "requested", prixTotalCents: 1000 })
    .returning();

  // requested → active : INTERDIT
  const interdit = await transitionBooking(b.id, "active", driverId);
  assert.equal(interdit.ok, false);

  // requested → accepted : OK, et journalisé
  const okT = await transitionBooking(b.id, "accepted", ownerId);
  assert.equal(okT.ok, true);
  const maj = await db.query.bookings.findFirst({ where: (t, { eq }) => eq(t.id, b.id) });
  assert.equal(maj!.statut, "accepted");
});

test("tokens : usage unique et expiration", async () => {
  const token = await creerToken(driverId, "reset_mdp", 60);
  assert.match(token, /^[a-f0-9]{64}$/);

  const u1 = await consommerToken(token, "reset_mdp");
  assert.equal(u1, driverId);
  const u2 = await consommerToken(token, "reset_mdp");
  assert.equal(u2, null, "un token consommé ne doit plus fonctionner");

  const mauvaisType = await creerToken(driverId, "verif_email", 60);
  assert.equal(await consommerToken(mauvaisType, "reset_mdp"), null, "le type doit correspondre");

  const expire = await creerToken(driverId, "reset_mdp", -1);
  assert.equal(await consommerToken(expire, "reset_mdp"), null, "un token expiré est refusé");
});

test("rate limit : bloque au-delà du plafond", async () => {
  for (let i = 0; i < 3; i++) {
    const r = await rateLimit("test-scope", "1.2.3.4", 3, 60);
    assert.equal(r.ok, true, `tentative ${i + 1} doit passer`);
  }
  const bloque = await rateLimit("test-scope", "1.2.3.4", 3, 60);
  assert.equal(bloque.ok, false, "la 4e tentative doit être bloquée");

  const autreIp = await rateLimit("test-scope", "5.6.7.8", 3, 60);
  assert.equal(autreIp.ok, true, "une autre IP n'est pas affectée");
});
