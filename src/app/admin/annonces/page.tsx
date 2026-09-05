import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { euros, dateFr } from "@/lib/format";
import { depublierAnnonce } from "@/actions/admin";
import { Empty, ErrorNote, OkNote, VerifBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUTS: Record<string, { txt: string; cls: string }> = {
  brouillon: { txt: "Brouillon", cls: "bg-slate-100 text-slate-600" },
  en_attente_verification: { txt: "En attente de vérification", cls: "bg-amber-100 text-amber-800" },
  publiee: { txt: "Publiée", cls: "bg-emerald-100 text-emerald-800" },
  suspendue: { txt: "Suspendue", cls: "bg-red-100 text-red-700" },
  archivee: { txt: "Archivée", cls: "bg-slate-100 text-slate-500" },
};

export default async function AdminAnnonces({ searchParams }: { searchParams: { erreur?: string; ok?: string; statut?: string } }) {
  await requireUser(["admin"]);
  const db = await getDb();

  const filtre = searchParams.statut && Object.keys(STATUTS).includes(searchParams.statut) ? searchParams.statut : null;
  const rows = await db
    .select({ listing: schema.listings, vehicle: schema.vehicles, owner: schema.users })
    .from(schema.listings)
    .innerJoin(schema.vehicles, eq(schema.listings.vehicleId, schema.vehicles.id))
    .innerJoin(schema.users, eq(schema.vehicles.ownerId, schema.users.id))
    .where(filtre ? eq(schema.listings.statut, filtre as (typeof schema.listingStatus.enumValues)[number]) : undefined)
    .orderBy(desc(schema.listings.createdAt))
    .limit(100);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/admin" className="text-sm text-brand-600">← Back-office</Link>
      <h1 className="mt-2 text-2xl font-black">Annonces</h1>
      <div className="mt-3 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>

      {/* Filtres rapides */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/admin/annonces" className={`rounded-full px-3 py-1.5 text-xs font-semibold ${!filtre ? "bg-brand-600 text-white" : "border border-slate-300 bg-white text-slate-600"}`}>
          Toutes
        </Link>
        {Object.entries(STATUTS).map(([k, v]) => (
          <Link key={k} href={`/admin/annonces?statut=${k}`} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filtre === k ? "bg-brand-600 text-white" : "border border-slate-300 bg-white text-slate-600"}`}>
            {v.txt}
          </Link>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {rows.length === 0 ? (
          <Empty titre="Aucune annonce pour ce filtre." />
        ) : (
          rows.map(({ listing, vehicle, owner }) => {
            const s = STATUTS[listing.statut] ?? STATUTS.brouillon;
            return (
              <div key={listing.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{listing.titre}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.txt}</span>
                      <VerifBadge statut={vehicle.statutVerification} />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {vehicle.marque} {vehicle.modele} {vehicle.annee} · {vehicle.ville} ({vehicle.codePostal})
                      {listing.prixMoisCents !== null && <> · <strong>{euros(listing.prixMoisCents)}</strong>/mois</>}
                      {" · "}caution {euros(listing.cautionCents)}
                    </p>
                    <p className="text-xs text-slate-400">
                      Loueur : {owner.prenom} {owner.nom} ({owner.email}) · créée le {dateFr(listing.createdAt)}
                      {listing.publishedAt && <> · publiée le {dateFr(listing.publishedAt)}</>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {listing.statut === "publiee" && (
                      <Link href={`/annonce/${listing.id}`} className="btn-secondary !min-h-[36px] !px-3 !py-1.5 text-xs">Voir en ligne</Link>
                    )}
                  </div>
                </div>

                {listing.statut === "publiee" && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-red-600">Dépublier cette annonce…</summary>
                    <form action={depublierAnnonce} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="listingId" value={listing.id} />
                      <div className="min-w-64 flex-1">
                        <label className="label">Motif (transmis au loueur)</label>
                        <input name="motif" required minLength={10} className="input" placeholder="Ex. : photos non conformes, informations trompeuses…" />
                      </div>
                      <button className="btn-secondary !border-red-300 text-red-600">Dépublier</button>
                    </form>
                  </details>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
