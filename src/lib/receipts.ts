import PDFDocument from "pdfkit";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { writeStored } from "@/lib/storage";
import { euros } from "@/lib/format";

/**
 * Reçus de paiement PDF — numérotés séquentiellement (RECU-ANNEE-XXXX), immuables.
 * Ce sont des reçus de transaction émis par la plateforme ; la facturation
 * fiscale du loyer (TVA du loueur…) relève du loueur, jamais inventée ici.
 */
export async function genererRecu(opts: {
  userId: string;
  type: "location" | "boost";
  montantCents: number;
  libelle: string;
  details: string[];
  bookingId?: string;
  boostId?: string;
}): Promise<{ numero: string; pdfPath: string }> {
  const db = await getDb();
  const annee = new Date().getFullYear();
  const res = await db.execute(sql`SELECT count(*)::int AS n FROM receipts WHERE numero LIKE ${"RECU-" + annee + "-%"}`);
  const n = Number((res.rows[0] as { n: number }).n) + 1;
  const numero = `RECU-${annee}-${String(n).padStart(4, "0")}`;

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 56, left: 56, right: 56 } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).font("Helvetica-Bold").text("FORVTC — Reçu de paiement");
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica").fillColor("#555")
      .text(`Reçu n° ${numero} — émis le ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}`);
    doc.moveDown(1.2);
    doc.fillColor("#000").fontSize(12).font("Helvetica-Bold").text(opts.libelle);
    doc.moveDown(0.5);
    doc.fontSize(11).font("Helvetica");
    for (const l of opts.details) doc.text(l);
    doc.moveDown(1);
    doc.fontSize(14).font("Helvetica-Bold").text(`Montant payé : ${euros(opts.montantCents)}`);
    doc.moveDown(1.5);
    doc.fontSize(9).font("Helvetica").fillColor("#777").text(
      "Paiement traité par Stripe. Ce reçu atteste de la transaction sur la plateforme FORVTC. " +
      "Il ne remplace pas la facture du loueur si celui-ci est assujetti à la TVA. " +
      "La caution éventuelle fait l'objet d'une empreinte bancaire séparée et n'est jamais débitée sans décision d'arbitrage."
    );
    doc.end();
  });

  const pdfPath = `recus/${numero}.pdf`;
  await writeStored(pdfPath, pdfBuffer);
  await db.insert(schema.receipts).values({
    numero,
    userId: opts.userId,
    bookingId: opts.bookingId ?? null,
    boostId: opts.boostId ?? null,
    type: opts.type,
    montantCents: opts.montantCents,
    pdfPath,
  });
  return { numero, pdfPath };
}
