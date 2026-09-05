import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { ouvrirLitige } from "@/actions/disputes";
import { ErrorNote } from "@/components/ui";
import { dateFr } from "@/lib/format";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  ["dommage", "Dommage sur le véhicule"],
  ["paiement", "Problème de paiement"],
  ["caution", "Caution"],
  ["vehicule_non_conforme", "Véhicule non conforme à l'annonce"],
  ["annulation", "Annulation"],
  ["comportement", "Comportement"],
  ["contrat", "Contrat"],
  ["autre", "Autre"],
] as const;

export default async function NouveauLitige({
  searchParams,
}: {
  searchParams: { bookingId?: string; erreur?: string };
}) {
  const user = await requireUser();
  const bookingId = searchParams.bookingId ?? "";
  const db = await getDb();
  const booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, bookingId) });
  if (!booking) notFound();
  const listing = (await db.query.listings.findFirst({ where: eq(schema.listings.id, booking.listingId) }))!;
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;
  if (booking.driverId !== user.id && vehicle.ownerId !== user.id) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-black">Ouvrir un litige</h1>
      <p className="mt-1 text-sm text-slate-500">
        {listing.titre} · du {dateFr(booking.dateDebut)} au {dateFr(booking.dateFin)}
      </p>
      <div className="mt-4">
        <ErrorNote msg={searchParams.erreur} />
      </div>
      <form action={ouvrirLitige} className="card mt-4 space-y-4">
        <input type="hidden" name="bookingId" value={booking.id} />
        <div>
          <label className="label" htmlFor="categorie">Catégorie *</label>
          <select id="categorie" name="categorie" required className="input">
            {CATEGORIES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="description">Description détaillée * (30 caractères min.)</label>
          <textarea id="description" name="description" rows={5} minLength={30} required className="input"
            placeholder="Décrivez précisément le problème, en vous référant si possible aux états des lieux et aux échanges sur la plateforme." />
        </div>
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          Notre équipe consultera le contrat, les états des lieux horodatés (photos comprises), les messages et
          l&apos;historique de la location avant toute décision. Les deux parties seront notifiées.
        </p>
        <button className="btn-primary w-full">OUVRIR LE LITIGE</button>
      </form>
    </div>
  );
}
