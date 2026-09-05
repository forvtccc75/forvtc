import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { euros, dateFr } from "@/lib/format";
import { STATUT_LABELS } from "@/lib/booking";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminLocations({ searchParams }: { searchParams: { statut?: string } }) {
  await requireUser(["admin"]);
  const db = await getDb();

  const bookings = await db.query.bookings.findMany({ orderBy: desc(schema.bookings.createdAt), limit: 100 });
  const filtre = searchParams.statut ?? null;
  const filtres = ["requested", "accepted", "signed", "active", "completed", "disputed", "cancelled"];

  const dossiers = await Promise.all(
    (filtre ? bookings.filter((b) => b.statut === filtre) : bookings).map(async (b) => {
      const listing = (await db.query.listings.findFirst({ where: eq(schema.listings.id, b.listingId) }))!;
      const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;
      const driver = (await db.query.users.findFirst({ where: eq(schema.users.id, b.driverId) }))!;
      const owner = (await db.query.users.findFirst({ where: eq(schema.users.id, vehicle.ownerId) }))!;
      const contrat = await db.query.contracts.findFirst({ where: eq(schema.contracts.bookingId, b.id), orderBy: desc(schema.contracts.version) });
      const inspections = await db.query.inspections.findMany({ where: eq(schema.inspections.bookingId, b.id) });
      const litiges = await db.query.disputes.findMany({ where: eq(schema.disputes.bookingId, b.id) });
      return { b, listing, vehicle, driver, owner, contrat, inspections, litiges };
    })
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/admin" className="text-sm text-brand-600">← Back-office</Link>
      <h1 className="mt-2 text-2xl font-black">Locations</h1>
      <p className="mt-1 text-sm text-slate-500">Dossiers complets : réservation, contrat, états des lieux, litiges.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/admin/locations" className={`rounded-full px-3 py-1.5 text-xs font-semibold ${!filtre ? "bg-brand-600 text-white" : "border border-slate-300 bg-white text-slate-600"}`}>
          Toutes
        </Link>
        {filtres.map((f) => (
          <Link key={f} href={`/admin/locations?statut=${f}`} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filtre === f ? "bg-brand-600 text-white" : "border border-slate-300 bg-white text-slate-600"}`}>
            {STATUT_LABELS[f]?.txt ?? f}
          </Link>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {dossiers.length === 0 ? (
          <Empty titre="Aucune location pour ce filtre." />
        ) : (
          dossiers.map(({ b, listing, driver, owner, contrat, inspections, litiges }) => {
            const s = STATUT_LABELS[b.statut] ?? { txt: b.statut, cls: "bg-slate-100 text-slate-600" };
            const edlDepart = inspections.find((i) => i.type === "depart");
            const edlRetour = inspections.find((i) => i.type === "retour");
            return (
              <div key={b.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{listing.titre}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.txt}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {dateFr(b.dateDebut)} → {dateFr(b.dateFin)} · <strong>{euros(b.prixTotalCents)}</strong> · caution {euros(b.cautionCents)}
                    </p>
                    <p className="text-xs text-slate-400">
                      Chauffeur : {driver.prenom} {driver.nom} ({driver.email}) · Loueur : {owner.prenom} {owner.nom} ({owner.email})
                    </p>
                  </div>
                </div>
                {/* Chips d'avancement du dossier */}
                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                  <span className={`rounded-full px-2 py-0.5 ${contrat ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                    {contrat ? `Contrat ${contrat.numero} (${contrat.statut})` : "Pas de contrat"}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 ${edlDepart ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                    {edlDepart ? `EDL départ ${edlDepart.valideParAutrePartie ? "validé" : "en attente"}` : "EDL départ à faire"}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 ${edlRetour ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                    {edlRetour ? `EDL retour ${edlRetour.valideParAutrePartie ? "validé" : "en attente"}` : "EDL retour à faire"}
                  </span>
                  {litiges.length > 0 && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">
                      {litiges.length} litige(s) — {litiges.map((l) => l.statut).join(", ")}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {contrat && <Link href={`/dashboard/contrats/${contrat.id}`} className="btn-secondary !min-h-[34px] !px-3 !py-1 text-xs">Contrat</Link>}
                  {inspections.length > 0 && <Link href={`/dashboard/etat-des-lieux/${b.id}`} className="btn-secondary !min-h-[34px] !px-3 !py-1 text-xs">États des lieux</Link>}
                  {litiges.length > 0 && <Link href="/admin/litiges" className="btn-secondary !min-h-[34px] !border-red-300 !px-3 !py-1 text-xs text-red-600">Litiges</Link>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
