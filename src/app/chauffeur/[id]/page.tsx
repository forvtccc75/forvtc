import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Empty, VerifBadge } from "@/components/ui";
import { dateFr } from "@/lib/format";

export const dynamic = "force-dynamic";

/** PROFIL PUBLIC CHAUFFEUR — informations minimales uniquement (prénom, zone, vérification, avis).
 *  Les documents privés ne sont JAMAIS exposés. */
export default async function ProfilChauffeur({ params }: { params: { id: string } }) {
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, params.id) });
  if (!user || user.role !== "chauffeur" || user.suspendu) notFound();
  const profile = await db.query.driverProfiles.findFirst({ where: eq(schema.driverProfiles.userId, user.id) });

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

  const locationsTerminees = (
    await db.query.bookings.findMany({ where: eq(schema.bookings.driverId, user.id) })
  ).filter((b) => b.statut === "completed").length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">{user.prenom} {user.nom.charAt(0)}.</h1>
          <p className="mt-1 text-sm text-slate-500">
            Chauffeur VTC · membre depuis {dateFr(user.createdAt)}
            {profile?.ville && <> · zone : {profile.ville}</>}
            {profile?.experienceAnnees !== null && profile?.experienceAnnees !== undefined && (
              <> · {profile.experienceAnnees} an{profile.experienceAnnees > 1 ? "s" : ""} d&apos;expérience (déclaré)</>
            )}
          </p>
          <div className="mt-2"><VerifBadge statut={user.statutVerification} /></div>
        </div>
        <div className="text-right text-sm">
          <p className="text-3xl font-black">{moyenne !== null ? moyenne.toFixed(1) : "—"}<span className="text-base font-normal text-slate-400">/5</span></p>
          <p className="text-slate-500">{avis.length} avis · {locationsTerminees} location{locationsTerminees > 1 ? "s" : ""} terminée{locationsTerminees > 1 ? "s" : ""}</p>
        </div>
      </div>

      <h2 className="mt-8 font-bold">Avis reçus</h2>
      <div className="mt-3 space-y-2">
        {avis.length === 0 ? (
          <Empty titre="Aucun avis pour l'instant." sous="Les avis ne peuvent être laissés que par des loueurs après une location réellement terminée." />
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
