import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Empty, VerifBadge } from "@/components/ui";
import { dateFr, euros } from "@/lib/format";

export const dynamic = "force-dynamic";

/** PROFIL PUBLIC LOUEUR — uniquement des données réelles et non sensibles. */
export default async function ProfilLoueur({ params }: { params: { id: string } }) {
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, params.id) });
  if (!user || !["loueur", "entreprise", "gestionnaire_flotte"].includes(user.role) || user.suspendu) notFound();
  const profile = await db.query.ownerProfiles.findFirst({ where: eq(schema.ownerProfiles.userId, user.id) });

  const vehicles = await db.query.vehicles.findMany({ where: eq(schema.vehicles.ownerId, user.id) });
  const listings = vehicles.length
    ? await db.query.listings.findMany({
        where: and(inArray(schema.listings.vehicleId, vehicles.map((v) => v.id)), eq(schema.listings.statut, "publiee")),
      })
    : [];
  const vMap = new Map(vehicles.map((v) => [v.id, v]));

  const avis = await db.query.reviews.findMany({
    where: eq(schema.reviews.cibleId, user.id),
    orderBy: desc(schema.reviews.createdAt),
    limit: 20,
  });
  const auteurs = avis.length
    ? await db.query.users.findMany({ where: inArray(schema.users.id, Array.from(new Set(avis.map((a) => a.auteurId)))) })
    : [];
  const aMap = new Map(auteurs.map((a) => [a.id, a]));
  const moyenne = avis.length ? avis.reduce((s, a) => s + a.note, 0) / avis.length : null;

  const locationsTerminees = listings.length
    ? (
        await db.query.bookings.findMany({
          where: and(inArray(schema.bookings.listingId, listings.map((l) => l.id)), eq(schema.bookings.statut, "completed")),
        })
      ).length
    : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">
            {profile?.raisonSociale?.trim() || `${user.prenom} ${user.nom.charAt(0)}.`}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {profile?.typeLoueur === "professionnel" ? "Loueur professionnel (déclaré)" : "Particulier"} · membre depuis {dateFr(user.createdAt)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <VerifBadge statut={user.statutVerification} />
            {profile?.typeLoueur === "professionnel" && <VerifBadge statut={profile.statutPro} />}
          </div>
        </div>
        <div className="text-right text-sm">
          <p className="text-3xl font-black">{moyenne !== null ? moyenne.toFixed(1) : "—"}<span className="text-base font-normal text-slate-400">/5</span></p>
          <p className="text-slate-500">{avis.length} avis · {locationsTerminees} location{locationsTerminees > 1 ? "s" : ""} terminée{locationsTerminees > 1 ? "s" : ""}</p>
        </div>
      </div>

      <h2 className="mt-8 font-bold">Annonces publiées ({listings.length})</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {listings.length === 0 ? (
          <div className="sm:col-span-2"><Empty titre="Aucune annonce publiée actuellement." /></div>
        ) : (
          listings.map((l) => {
            const v = vMap.get(l.vehicleId)!;
            return (
              <Link key={l.id} href={`/annonce/${l.id}`} className="card block transition hover:shadow-md">
                <p className="font-bold">{l.titre}</p>
                <p className="text-sm text-slate-500">{v.marque} {v.modele} · {v.annee} · 📍 {v.ville}</p>
                <p className="mt-1 text-sm">{l.prixMoisCents !== null && <><strong>{euros(l.prixMoisCents)}</strong>/mois</>}</p>
              </Link>
            );
          })
        )}
      </div>

      <h2 className="mt-8 font-bold">Avis reçus</h2>
      <div className="mt-3 space-y-2">
        {avis.length === 0 ? (
          <Empty titre="Aucun avis pour l'instant." sous="Les avis ne peuvent être laissés que par des chauffeurs ayant réellement terminé une location avec ce loueur." />
        ) : (
          avis.map((a) => {
            const auteur = aMap.get(a.auteurId);
            return (
              <div key={a.id} className="card py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{auteur ? `${auteur.prenom} ${auteur.nom.charAt(0)}.` : "—"}</p>
                  <p className="text-sm font-bold">{"★".repeat(a.note)}{"☆".repeat(5 - a.note)} <span className="text-slate-400">({a.note}/5)</span></p>
                </div>
                {a.commentaire && <p className="mt-1 text-sm text-slate-600">{a.commentaire}</p>}
                <p className="mt-1 text-xs text-slate-400">{dateFr(a.createdAt)} · location vérifiée</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
