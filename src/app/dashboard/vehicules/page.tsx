import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { Empty, ErrorNote, VerifBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Vehicules({ searchParams }: { searchParams: { erreur?: string } }) {
  const user = await requireUser(["loueur", "entreprise", "gestionnaire_flotte"]);
  const db = await getDb();
  const vehicles = await db.query.vehicles.findMany({
    where: eq(schema.vehicles.ownerId, user.id),
    orderBy: desc(schema.vehicles.createdAt),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Mes véhicules</h1>
        <Link href="/dashboard/vehicules/nouveau" className="btn-primary">AJOUTER UN VÉHICULE</Link>
      </div>
      <div className="mt-4">
        <ErrorNote msg={searchParams.erreur} />
      </div>
      <div className="mt-4 space-y-3">
        {vehicles.length === 0 ? (
          <Empty
            titre="Aucun véhicule enregistré."
            sous="Ajoutez votre premier véhicule, déposez ses documents (carte grise, assurance, contrôle technique) puis créez son annonce."
            cta="Ajouter un véhicule"
            href="/dashboard/vehicules/nouveau"
          />
        ) : (
          vehicles.map((v) => (
            <Link key={v.id} href={`/dashboard/vehicules/${v.id}`} className="card flex items-center justify-between transition hover:shadow-md">
              <div>
                <p className="font-bold">{v.marque} {v.modele} {v.finition ?? ""} · {v.annee}</p>
                <p className="text-sm text-slate-500">📍 {v.ville} ({v.codePostal}) · {v.kilometrage.toLocaleString("fr-FR")} km · {v.energie.replace(/_/g, " ")}</p>
              </div>
              <VerifBadge statut={v.statutVerification} />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
