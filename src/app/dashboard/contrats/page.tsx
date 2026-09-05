import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { euros, dateFr } from "@/lib/format";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUTS: Record<string, { txt: string; cls: string }> = {
  genere: { txt: "Généré", cls: "bg-slate-100 text-slate-600" },
  en_signature: { txt: "En attente de signatures", cls: "bg-amber-100 text-amber-800" },
  actif: { txt: "Actif — signé par les 2 parties", cls: "bg-emerald-100 text-emerald-800" },
  termine: { txt: "Terminé", cls: "bg-slate-100 text-slate-600" },
  annule: { txt: "Annulé", cls: "bg-slate-100 text-slate-500" },
};

/** Liste des contrats de l'utilisateur — côté chauffeur comme côté loueur. */
export default async function MesContrats() {
  const user = await requireUser();
  const db = await getDb();

  // Bookings où je suis chauffeur
  const commeChauffeur = await db.query.bookings.findMany({ where: eq(schema.bookings.driverId, user.id) });
  // Bookings sur mes véhicules (côté loueur)
  const mesVehicules = await db.query.vehicles.findMany({ where: eq(schema.vehicles.ownerId, user.id) });
  const mesListings = mesVehicules.length
    ? await db.query.listings.findMany({ where: inArray(schema.listings.vehicleId, mesVehicules.map((v) => v.id)) })
    : [];
  const commeLoueur = mesListings.length
    ? await db.query.bookings.findMany({ where: inArray(schema.bookings.listingId, mesListings.map((l) => l.id)) })
    : [];

  const bookingIds = [...new Set([...commeChauffeur, ...commeLoueur].map((b) => b.id))];
  const contrats = bookingIds.length
    ? await db.query.contracts.findMany({
        where: inArray(schema.contracts.bookingId, bookingIds),
        orderBy: desc(schema.contracts.createdAt),
      })
    : [];

  const lignes = await Promise.all(
    contrats.map(async (c) => {
      const booking = [...commeChauffeur, ...commeLoueur].find((b) => b.id === c.bookingId)!;
      const listing = (await db.query.listings.findFirst({ where: eq(schema.listings.id, booking.listingId) }))!;
      const signatures = await db.query.contractSignatures.findMany({ where: eq(schema.contractSignatures.contractId, c.id) });
      const jaiSigne = signatures.some((s) => s.userId === user.id);
      const cote = commeChauffeur.some((b) => b.id === c.bookingId) ? "chauffeur" : "loueur";
      return { c, booking, listing, signatures, jaiSigne, cote };
    })
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/dashboard" className="text-sm text-brand-600">← Tableau de bord</Link>
      <h1 className="mt-2 text-2xl font-black">Mes contrats</h1>
      <p className="mt-1 text-sm text-slate-500">
        Contrats générés depuis les données réelles des locations, signés électroniquement, PDF horodatés.
      </p>

      <div className="mt-5 space-y-3">
        {lignes.length === 0 ? (
          <Empty
            titre="Aucun contrat pour l'instant."
            sous="Un contrat se génère depuis une location acceptée (page Mes locations côté chauffeur, Demandes reçues côté loueur)."
          />
        ) : (
          lignes.map(({ c, booking, listing, signatures, jaiSigne, cote }) => {
            const s = STATUTS[c.statut] ?? STATUTS.genere;
            const attendMaSignature = c.statut === "en_signature" && !jaiSigne;
            return (
              <Link key={c.id} href={`/dashboard/contrats/${c.id}`} className={`card block transition hover:shadow-md ${attendMaSignature ? "border-amber-300" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{c.numero} <span className="text-xs font-normal text-slate-400">v{c.version}</span></p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.txt}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                      {cote === "chauffeur" ? "Je suis locataire" : "Je suis loueur"}
                    </span>
                  </div>
                  {attendMaSignature && (
                    <span className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-bold text-white">✍️ À signer</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {listing.titre} · {dateFr(booking.dateDebut)} → {dateFr(booking.dateFin)} · {euros(booking.prixTotalCents)}
                </p>
                <p className="text-xs text-slate-400">
                  {signatures.length}/2 signature(s) · généré le {dateFr(c.createdAt)}
                </p>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
