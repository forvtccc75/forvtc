import Link from "next/link";
import { desc, eq, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { Empty, ErrorNote, OkNote } from "@/components/ui";
import { dateFr } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUTS: Record<string, { txt: string; cls: string }> = {
  ouvert: { txt: "Ouvert — en attente de prise en charge", cls: "bg-amber-100 text-amber-800" },
  en_analyse: { txt: "En analyse par notre équipe", cls: "bg-brand-100 text-brand-700" },
  resolu: { txt: "Résolu", cls: "bg-emerald-100 text-emerald-800" },
  ferme: { txt: "Fermé", cls: "bg-slate-200 text-slate-700" },
};

export default async function MesLitiges({ searchParams }: { searchParams: { erreur?: string; ok?: string } }) {
  const user = await requireUser();
  const db = await getDb();

  // Litiges des locations où je suis partie (chauffeur ou loueur)
  const mesVehicules = await db.query.vehicles.findMany({ where: eq(schema.vehicles.ownerId, user.id) });
  const mesListings = mesVehicules.length
    ? await db.query.listings.findMany({ where: inArray(schema.listings.vehicleId, mesVehicules.map((v) => v.id)) })
    : [];
  const bookings = await db.query.bookings.findMany({
    where: mesListings.length
      ? or(eq(schema.bookings.driverId, user.id), inArray(schema.bookings.listingId, mesListings.map((l) => l.id)))
      : eq(schema.bookings.driverId, user.id),
  });
  const litiges = bookings.length
    ? await db.query.disputes.findMany({
        where: inArray(schema.disputes.bookingId, bookings.map((b) => b.id)),
        orderBy: desc(schema.disputes.createdAt),
      })
    : [];
  const lMap = new Map(
    (mesListings.length ? mesListings : await db.query.listings.findMany({
      where: bookings.length ? inArray(schema.listings.id, bookings.map((b) => b.listingId)) : undefined,
    })).map((l) => [l.id, l])
  );
  const bMap = new Map(bookings.map((b) => [b.id, b]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-black">Centre de résolution — mes litiges</h1>
      <p className="mt-1 text-sm text-slate-500">
        L&apos;équipe examine le contrat, les états des lieux horodatés et les échanges avant toute décision.
      </p>
      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>
      <div className="mt-4 space-y-3">
        {litiges.length === 0 ? (
          <Empty
            titre="Aucun litige."
            sous="En cas de problème sur une location engagée (dommage, caution, non-conformité…), ouvrez un litige depuis la page de la location concernée."
          />
        ) : (
          litiges.map((l) => {
            const b = bMap.get(l.bookingId);
            const listing = b ? lMap.get(b.listingId) : null;
            const s = STATUTS[l.statut] ?? STATUTS.ouvert;
            return (
              <div key={l.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold capitalize">{l.categorie.replace(/_/g, " ")}</p>
                    <p className="text-sm text-slate-500">{listing?.titre ?? "Location"} · ouvert le {dateFr(l.createdAt)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.txt}</span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{l.description}</p>
                {l.resolution && (
                  <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900">
                    <strong>Décision :</strong> {l.resolution}
                  </p>
                )}
                {b && (
                  <p className="mt-2 text-xs">
                    <Link href={`/dashboard/etat-des-lieux/${b.id}`} className="font-semibold text-brand-600 hover:underline">
                      Voir les états des lieux de cette location →
                    </Link>
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
