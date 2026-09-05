/**
 * Tests unitaires des invariants critiques (sans base de données) :
 * - machine à états des locations : aucune transition non déclarée
 * - calculateur de prix : décomposition déterministe
 * - magic bytes des uploads
 * Lancement : npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TRANSITIONS, STATUTS_BLOQUANTS } from "../src/lib/booking";
import { calculerDevis } from "../src/lib/pricing";
import { contenuValide } from "../src/lib/storage";

/* ------------------------ Machine à états ------------------------ */

test("machine à états : les transitions critiques existent", () => {
  assert.ok(TRANSITIONS.requested.includes("accepted"));
  assert.ok(TRANSITIONS.accepted.includes("payment_pending"));
  assert.ok(TRANSITIONS.payment_pending.includes("paid"));
  assert.ok(TRANSITIONS.paid.includes("contract_pending"));
  assert.ok(TRANSITIONS.contract_pending.includes("signed"));
  assert.ok(TRANSITIONS.signed.includes("active"));
  assert.ok(TRANSITIONS.active.includes("return_pending"));
});

test("machine à états : aucun retour en arrière interdit", () => {
  // Un état terminal ne mène nulle part
  assert.equal(TRANSITIONS.completed.length, 0);
  assert.equal(TRANSITIONS.cancelled.length, 0);
  assert.equal(TRANSITIONS.failed.length, 0);
  // On ne peut jamais repasser en requested depuis un état avancé
  for (const [de, vers] of Object.entries(TRANSITIONS)) {
    if (de !== "draft") assert.ok(!vers.includes("requested"), `${de} ne doit pas retourner à requested`);
    assert.ok(!vers.includes("draft"), `${de} ne doit pas retourner à draft`);
  }
});

test("machine à états : cibles toutes déclarées (pas d'état fantôme)", () => {
  const etats = new Set(Object.keys(TRANSITIONS));
  for (const [de, vers] of Object.entries(TRANSITIONS))
    for (const v of vers) assert.ok(etats.has(v), `${de} → ${v} : cible inconnue`);
});

test("calendrier : une simple demande ne bloque pas, une acceptation oui", () => {
  const bloquants = STATUTS_BLOQUANTS as readonly string[];
  assert.ok(!bloquants.includes("requested"));
  assert.ok(!bloquants.includes("draft"));
  assert.ok(bloquants.includes("accepted"));
  assert.ok(bloquants.includes("active"));
  assert.ok(!bloquants.includes("completed"));
  assert.ok(!bloquants.includes("cancelled"));
});

/* ------------------------ Calculateur de prix ------------------------ */

test("devis : 60 jours = 2 mois pile", () => {
  const d = calculerDevis({ prixJourCents: null, prixSemaineCents: null, prixMoisCents: 140000 }, 60);
  assert.ok(d);
  assert.equal(d.totalCents, 280000);
});

test("devis : granularités mixtes mois + semaine + jour", () => {
  // 40 jours = 1 mois (30) + 1 semaine (7) + 3 jours
  const d = calculerDevis({ prixJourCents: 6000, prixSemaineCents: 38000, prixMoisCents: 140000 }, 40);
  assert.ok(d);
  assert.equal(d.totalCents, 140000 + 38000 + 3 * 6000);
});

test("devis : aucun tarif → null (jamais de prix inventé)", () => {
  assert.equal(calculerDevis({ prixJourCents: null, prixSemaineCents: null, prixMoisCents: null }, 30), null);
});

test("devis : durée invalide → null", () => {
  assert.equal(calculerDevis({ prixJourCents: 6000, prixSemaineCents: null, prixMoisCents: null }, 0), null);
});

/* ------------------------ Magic bytes des uploads ------------------------ */

test("uploads : un PDF renommé en JPEG est rejeté", () => {
  const fauxJpeg = Buffer.from("%PDF-1.4 blabla blabla");
  assert.equal(contenuValide(fauxJpeg, "image/jpeg"), false);
});

test("uploads : les vrais formats passent", () => {
  assert.equal(contenuValide(Buffer.from("%PDF-1.7 xxxxxxxx"), "application/pdf"), true);
  assert.equal(contenuValide(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]), "image/jpeg"), true);
  assert.equal(
    contenuValide(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]), "image/png"),
    true
  );
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(8)]);
  assert.equal(contenuValide(webp, "image/webp"), true);
});

test("uploads : contenu tronqué rejeté", () => {
  assert.equal(contenuValide(Buffer.from("%PDF"), "application/pdf"), false);
  assert.equal(contenuValide(Buffer.alloc(0), "image/png"), false);
});
