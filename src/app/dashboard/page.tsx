import Link from "next/link";
import { and, desc, eq, count } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { Empty, DocBadge, VerifBadge, ErrorNote, OkNote } from "@/components/ui";
import { dateFr } from "@/lib/format";
import { emailActif } from "@/lib/email";
import { renvoyerVerification } from "@/actions/password";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: { erreur?: string; ok?: string } }) {
  const user = await requireUser();
  if (user.role === "admin") return null; // redirigé par requireUser côté admin
  const db = await getDb();

  const docs = await db.query.documents.findMany({
    where: eq(schema.documents.ownerUserId, user.id),
    orderBy: desc(schema.documents.createdAt),
    limit: 5,
  });
  const notifs = await db.query.notifications.findMany({
    where: eq(schema.notifications.userId, user.id),
    orderBy: desc(schema.notifications.createdAt),
    limit: 8,
  });

  const isOwner = ["loueur", "entreprise", "gestionnaire_flotte"].includes(user.role);
  let nbVehicules = 0;
  let nbAnnonces = 0;
  if (isOwner) {
    const [v] = await db.select({ n: count() }).from(schema.vehicles).where(eq(schema.vehicles.ownerId, user.id));
    nbVehicules = v.n;
    const rows = await db
      .select({ n: count() })
      .from(schema.listings)
      .innerJoin(schema.vehicles, eq(schema.listings.vehicleId, schema.vehicles.id))
      .where(and(eq(schema.vehicles.ownerId, user.id), eq(schema.listings.statut, "publiee")));
    nbAnnonces = rows[0].n;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>
      {!user.emailVerifie && emailActif() && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900">
            ✉️ <strong>Confirmez votre adresse email</strong> pour envoyer des demandes de location ou publier des annonces. Un lien vous a été envoyé à l&apos;inscription.
          </p>
          <form action={renvoyerVerification}>
            <button className="btn-secondary text-sm">Renvoyer l&apos;email</button>
          </form>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Bonjour {user.prenom}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            Statut du compte : <VerifBadge statut={user.statutVerification} />
          </p>
        </div>
        {isOwner ? (
          <Link href="/dashboard/vehicules/nouveau" className="btn-primary">AJOUTER UN VÉHICULE</Link>
        ) : (
          <Link href="/recherche" className="btn-primary">TROUVER UNE VOITURE</Link>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isOwner ? (
          <>
            <Link href="/dashboard/vehicules" className="card hover:shadow-md">
              <p className="text-3xl font-black">{nbVehicules}</p>
              <p className="text-sm text-slate-500">Véhicule{nbVehicules > 1 ? "s" : ""}</p>
            </Link>
            <Link href="/dashboard/demandes" className="card hover:shadow-md">
              <p className="text-sm font-bold">Demandes de location</p>
              <p className="mt-1 text-sm text-slate-500">Accepter ou refuser les demandes des chauffeurs →</p>
            </Link>
            <Link href="/dashboard/messages" className="card hover:shadow-md">
              <p className="text-sm font-bold">Messages</p>
              <p className="mt-1 text-sm text-slate-500">Vos conversations avec les chauffeurs →</p>
            </Link>
            <Link href="/dashboard/contrats" className="card hover:shadow-md">
              <p className="text-sm font-bold">Mes contrats</p>
              <p className="mt-1 text-sm text-slate-500">Contrats à signer et PDF signés →</p>
            </Link>
            <Link href="/dashboard/paiements" className="card hover:shadow-md">
              <p className="text-sm font-bold">Encaissement</p>
              <p className="mt-1 text-sm text-slate-500">Compte de versement Stripe et loyers reçus →</p>
            </Link>
            <Link href="/dashboard/compte" className="card hover:shadow-md">
              <p className="text-sm font-bold">Mon compte</p>
              <p className="mt-1 text-sm text-slate-500">Données personnelles, export RGPD →</p>
            </Link>
          </>
        ) : (
          <>
            <Link href="/dashboard/locations" className="card hover:shadow-md">
              <p className="text-sm font-bold">Mes locations</p>
              <p className="mt-1 text-sm text-slate-500">Suivre mes demandes et locations →</p>
            </Link>
            <Link href="/dashboard/documents" className="card hover:shadow-md">
              <p className="text-sm font-bold">Mes documents</p>
              <p className="mt-1 text-sm text-slate-500">{docs.length} document{docs.length > 1 ? "s" : ""} déposé{docs.length > 1 ? "s" : ""}</p>
            </Link>
            <Link href="/dashboard/favoris" className="card hover:shadow-md">
              <p className="text-sm font-bold">Favoris &amp; alertes</p>
              <p className="mt-1 text-sm text-slate-500">Annonces sauvegardées et alertes de recherche →</p>
            </Link>
            <Link href="/dashboard/contrats" className="card hover:shadow-md">
              <p className="text-sm font-bold">Mes contrats</p>
              <p className="mt-1 text-sm text-slate-500">Contrats à signer et PDF signés →</p>
            </Link>
            <Link href="/dashboard/compte" className="card hover:shadow-md">
              <p className="text-sm font-bold">Mon compte</p>
              <p className="mt-1 text-sm text-slate-500">Données personnelles, export RGPD →</p>
            </Link>
          </>
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Derniers documents</h2>
            <Link href="/dashboard/documents" className="text-sm font-semibold text-brand-600">Tout gérer →</Link>
          </div>
          <div className="mt-3 space-y-2">
            {docs.length === 0 ? (
              <Empty
                titre="Aucun document déposé."
                sous={user.role === "chauffeur" ? "Déposez votre pièce d'identité, permis et carte professionnelle VTC pour faire vérifier votre compte." : "Déposez vos justificatifs pour faire vérifier votre compte."}
                cta="Déposer un document"
                href="/dashboard/documents"
              />
            ) : (
              docs.map((d) => (
                <div key={d.id} className="card flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold">{d.type.replace(/_/g, " ")}</p>
                    <p className="text-xs text-slate-500">{d.nomFichier} · {dateFr(d.createdAt)}</p>
                    {d.motifRefus && <p className="text-xs text-red-600">Motif : {d.motifRefus}</p>}
                  </div>
                  <DocBadge statut={d.statut} />
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="font-bold">Notifications</h2>
          <div className="mt-3 space-y-2">
            {notifs.length === 0 ? (
              <Empty titre="Aucune notification." sous="Vous serez notifié ici de chaque étape réelle : vérification de documents, publication d'annonce, etc." />
            ) : (
              notifs.map((n) => (
                <div key={n.id} className="card py-3">
                  <p className="text-sm font-semibold">{n.titre}</p>
                  {n.corps && <p className="text-xs text-slate-500">{n.corps}</p>}
                  <p className="mt-1 text-xs text-slate-400">{dateFr(n.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
