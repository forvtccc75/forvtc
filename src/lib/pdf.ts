import PDFDocument from "pdfkit";
import { writeStored } from "@/lib/storage";

type SignatureInfo = {
  role: string;
  nom: string;
  signedAt: Date;
  ip: string | null;
  docHash: string;
  provider: string;
};

/**
 * PDF final horodaté du contrat : contenu contractuel + page de preuve
 * (signataires, horodatages, IP, empreinte SHA-256, fournisseur).
 * Stocké dans storage/contrats/ — servi uniquement via route authentifiée.
 */
export async function genererPdfContrat(
  numero: string,
  version: number,
  texte: string,
  signatures: SignatureInfo[]
): Promise<string> {
  const nom = `${numero}-v${version}.pdf`;

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 56, left: 56, right: 56 } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(14).text("FORVTC", { continued: true });
    doc.font("Helvetica").fontSize(9).text(`   Document généré le ${new Date().toLocaleString("fr-FR")}`, {
      align: "right",
    });
    doc.moveDown(1);

    doc.font("Helvetica").fontSize(10);
    for (const ligne of texte.split("\n")) {
      if (/^(CONTRAT|ARTICLE|ENTRE LES|AVERTISSEMENT|\[CADRE)/.test(ligne.trim())) {
        doc.moveDown(0.4).font("Helvetica-Bold").text(ligne.trim()).font("Helvetica");
      } else {
        doc.text(ligne, { lineGap: 1.5 });
      }
    }

    doc.addPage();
    doc.font("Helvetica-Bold").fontSize(13).text("PAGE DE PREUVE — SIGNATURES ÉLECTRONIQUES");
    doc.moveDown(0.5);
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(
        "Signature électronique de niveau « simple » réalisée sur la plateforme FORVTC : consentement exprès horodaté, adresse IP consignée, empreinte SHA-256 du contenu contractuel au moment de chaque signature. Pour une signature électronique avancée (eIDAS), un fournisseur qualifié (ex. Yousign) peut être activé par la plateforme."
      );
    doc.moveDown(1);

    for (const s of signatures) {
      doc.font("Helvetica-Bold").fontSize(10).text(`${s.role.toUpperCase()} — ${s.nom}`);
      doc.font("Helvetica").fontSize(9);
      doc.text(`Signé le : ${s.signedAt.toLocaleString("fr-FR")}`);
      doc.text(`Adresse IP : ${s.ip ?? "non disponible"}`);
      doc.text(`Fournisseur : ${s.provider}`);
      doc.text(`Empreinte SHA-256 du document signé :`);
      doc.font("Courier").fontSize(7.5).text(s.docHash);
      doc.moveDown(0.8);
    }

    doc.end();
  });

  await writeStored(`contrats/${nom}`, pdfBuffer, "application/pdf");
  return `contrats/${nom}`;
}
