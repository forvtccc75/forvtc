import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { signerContrat } from "@/actions/contracts";
import { providerActif, descriptionProvider, CONSENT_TEXT } from "@/lib/signature-provider";
import { ErrorNote, OkNote } from "@/components/ui";
import { dateFr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ContratPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erreur?: string; ok?: string };
}) {
  const user = await requireUser();
  const db = await getDb();
  const contrat = await db.query.contracts.findFirst({ where: eq(schema.contracts.id, params.id) });
  if (!contrat) notFound();
  const booking = (await db.query.bookings.findFirst({ where: eq(schema.bookings.id, contrat.bookingId) }))!;
  const listing = (await db.query.listings.findFirst({ where: eq(schema.listings.id, booking.listingId) }))!;
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;
  const estChauffeur = booking.driverId === user.id;
  const estLoueur = vehicle.ownerId === user.id;
  if (!estChauffeur && !estLoueur && user.role !== "admin") notFound();

  const signatures = await db.query.contractSignatures.findMany({
    where: eq(schema.contractSignatures.contractId, contrat.id),
    orderBy: asc(schema.contractSignatures.signedAt),
  });
  const signataires = signatures.length
    ? await db.query.users.findMany({ where: inArray(schema.users.id, signatures.map((s) => s.userId)) })
    : [];
  const sMap = new Map(signataires.map((s) => [s.id, s]));
  const dejaSigne = signatures.some((s) => s.userId === user.id);
  const texte = (contrat.contenu as { texte: string }).texte;

  const statutBadge: Record<string, { txt: string; cls: string }> = {
    en_signature: { txt: "En attente de signatures", cls: "bg-amber-100 text-amber-800" },
    actif: { txt: "✔ CONTRAT ACTIF — signé par les deux parties", cls: "bg-emerald-100 text-emerald-800" },
    annule: { txt: "Annulé", cls: "bg-red-100 text-red-800" },
    archive: { txt: "Archivé", cls: "bg-slate-200 text-slate-700" },
  };
  const badge = statutBadge[contrat.statut] ?? statutBadge.en_signature;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Contrat {contrat.numero}</h1>
          <p className="text-sm text-slate-500">
            Version {contrat.version} · généré le {dateFr(contrat.createdAt)} · {listing.titre}
          </p>
          <p className="mt-1 font-mono text-xs text-slate-400">Empreinte SHA-256 : {contrat.pdfHash?.slice(0, 32)}…</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.cls}`}>{badge.txt}</span>
      </div>

      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>

      <section className="card mt-5 max-h-[60vh] overflow-y-auto">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">{texte}</pre>
      </section>

      <section className="card mt-5">
        <h2 className="font-bold">Signatures</h2>
        <p className="mt-1 text-xs text-slate-500">{descriptionProvider(providerActif())}</p>
        <ul className="mt-3 space-y-2 text-sm">
          {["chauffeur", "loueur"].map((role) => {
            const sig = signatures.find((s) => s.role === role);
            const u = sig ? sMap.get(sig.userId) : null;
            return (
              <li key={role} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span className="font-medium capitalize">{role}</span>
                {sig ? (
                  <span className="text-xs text-emerald-700">
                    ✓ Signé par {u ? `${u.prenom} ${u.nom.charAt(0)}.` : "—"} le{" "}
                    {sig.signedAt ? new Date(sig.signedAt).toLocaleString("fr-FR") : "—"}
                    {sig.ip ? ` · IP ${sig.ip}` : ""}
                  </span>
                ) : (
                  <span className="text-xs text-amber-700">En attente</span>
                )}
              </li>
            );
          })}
        </ul>

        {contrat.statut === "en_signature" && (estChauffeur || estLoueur) && !dejaSigne && (
          <form action={signerContrat} className="mt-4 rounded-lg border border-brand-100 bg-brand-50 p-4">
            <input type="hidden" name="contractId" value={contrat.id} />
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" name="consentement" required className="mt-0.5" />
              <span>{CONSENT_TEXT}</span>
            </label>
            <button className="btn-primary mt-3">SIGNER LE CONTRAT</button>
          </form>
        )}
        {dejaSigne && contrat.statut === "en_signature" && (
          <p className="mt-3 text-sm text-slate-600">Vous avez signé. En attente de la signature de l&apos;autre partie.</p>
        )}
        {contrat.statut === "actif" && contrat.pdfPath && (
          <a
            href={`/api/fichiers/${encodeURIComponent(contrat.pdfPath)}`}
            target="_blank"
            className="btn-primary mt-4 inline-flex"
          >
            Télécharger le PDF final horodaté
          </a>
        )}
      </section>

      <p className="mt-4 text-xs text-slate-400">
        <Link href={estChauffeur ? "/dashboard/locations" : "/dashboard/demandes"} className="hover:underline">
          ← Retour
        </Link>
      </p>
    </div>
  );
}
