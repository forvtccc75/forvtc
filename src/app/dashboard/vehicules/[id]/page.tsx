import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { evaluerCompatibilite } from "@/lib/compat";
import { deposerDocument } from "@/actions/documents";
import { ajouterPhoto, creerAnnonce, demanderPublication } from "@/actions/vehicles";
import { CompatBadge, DocBadge, ErrorNote, OkNote } from "@/components/ui";
import { Stepper } from "@/components/stepper";
import { AnnonceWizard } from "@/components/annonce-wizard";
import { dateFr, euros } from "@/lib/format";

export const dynamic = "force-dynamic";

const DOC_TYPES = [
  ["carte_grise", "Carte grise"],
  ["assurance_vehicule", "Assurance véhicule (titre onéreux)"],
  ["controle_technique", "Contrôle technique"],
  ["contrat_location", "Contrat de location existant"],
  ["autre", "Autre"],
] as const;

export default async function VehiculeDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erreur?: string; ok?: string };
}) {
  const user = await requireUser(["loueur", "entreprise", "gestionnaire_flotte"]);
  const db = await getDb();
  const veh = await db.query.vehicles.findFirst({
    where: and(eq(schema.vehicles.id, params.id), eq(schema.vehicles.ownerId, user.id)),
  });
  if (!veh) notFound();

  const docs = await db.query.documents.findMany({
    where: eq(schema.documents.vehicleId, veh.id),
    orderBy: desc(schema.documents.createdAt),
  });
  const photos = await db.query.vehiclePhotos.findMany({ where: eq(schema.vehiclePhotos.vehicleId, veh.id) });
  const listing = await db.query.listings.findFirst({ where: eq(schema.listings.vehicleId, veh.id) });
  const compat = await evaluerCompatibilite(veh);
  const back = `/dashboard/vehicules/${veh.id}`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">{veh.marque} {veh.modele} · {veh.annee}</h1>
          <p className="text-sm text-slate-500">📍 {veh.ville} ({veh.codePostal})</p>
        </div>
        <CompatBadge global={compat.global} />
      </div>
      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>

      {/* Fil d'avancement type Leboncoin : de l'ajout du véhicule à l'annonce en ligne */}
      <div className="mt-5">
        <Stepper
          etapes={[
            { label: "Véhicule enregistré", fait: true },
            {
              label: "3 documents déposés",
              fait: ["carte_grise", "assurance_vehicule", "controle_technique"].every((t) => docs.some((d) => d.type === t)),
            },
            {
              label: "Documents validés par FORVTC",
              fait: ["carte_grise", "assurance_vehicule", "controle_technique"].every((t) =>
                docs.some((d) => d.type === t && d.statut === "valide")
              ),
            },
            { label: "Annonce créée", fait: Boolean(listing) },
            { label: "Annonce publiée", fait: listing?.statut === "publiee" },
          ]}
        />
      </div>

      <section className="card mt-5">
        <h2 className="font-bold">Analyse de compatibilité VTC</h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          {compat.resultats.map((r) => (
            <li key={r.code} className="flex items-start gap-2">
              <span>{r.statut === "ok" ? "✅" : r.statut === "echec" ? "❌" : "⏳"}</span>
              <span><strong>{r.libelle}</strong> — {r.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card mt-5">
        <h2 className="font-bold">Documents du véhicule</h2>
        <p className="mt-1 text-xs text-slate-500">Carte grise, assurance et contrôle technique doivent être <strong>validés par notre équipe</strong> avant toute publication d&apos;annonce.</p>
        <form action={deposerDocument} className="mt-3 grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="vehicleId" value={veh.id} />
          <input type="hidden" name="retour" value={back} />
          <div>
            <label className="label">Type</label>
            <select name="type" className="input" required>
              {DOC_TYPES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Expire le</label>
            <input name="dateExpiration" type="date" className="input" />
          </div>
          <div>
            <label className="label">Fichier</label>
            <input name="fichier" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required className="input" />
          </div>
          <div className="flex items-end">
            <button className="btn-secondary w-full">Déposer</button>
          </div>
        </form>
        <div className="mt-3 space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <div>
                <p className="text-sm font-medium">{d.type.replace(/_/g, " ")} · {d.nomFichier}</p>
                <p className="text-xs text-slate-500">Déposé le {dateFr(d.createdAt)}{d.dateExpiration && <> · expire le {dateFr(d.dateExpiration)}</>}</p>
                {d.motifRefus && <p className="text-xs text-red-600">Motif : {d.motifRefus}</p>}
              </div>
              <DocBadge statut={d.statut} />
            </div>
          ))}
          {docs.length === 0 && <p className="text-sm text-slate-500">Aucun document déposé pour ce véhicule.</p>}
        </div>
      </section>

      <section className="card mt-5">
        <h2 className="font-bold">Photos ({photos.length})</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={`/api/fichiers/${encodeURIComponent(p.path)}`} alt="" className="h-24 w-32 rounded-lg object-cover" />
          ))}
        </div>
        <form action={ajouterPhoto} className="mt-3 flex gap-3">
          <input type="hidden" name="vehicleId" value={veh.id} />
          <input name="photo" type="file" accept=".jpg,.jpeg,.png,.webp" required className="input" />
          <button className="btn-secondary shrink-0">Ajouter</button>
        </form>
      </section>

      <section className="card mt-5">
        <h2 className="font-bold">Annonce</h2>
        {listing ? (
          <div className="mt-2 text-sm">
            <p className="font-semibold">{listing.titre}</p>
            <p className="text-slate-500">
              Statut : <strong>{listing.statut.replace(/_/g, " ")}</strong>
              {listing.prixMoisCents !== null && <> · {euros(listing.prixMoisCents)}/mois</>} · caution {euros(listing.cautionCents)}
            </p>
            {listing.statut === "publiee" && (
              <Link href={`/dashboard/annonces/${listing.id}/booster`} className="btn-secondary mt-3 inline-block">
                🚀 Booster la visibilité de l&apos;annonce
              </Link>
            )}
            {listing.statut === "suspendue" && (
              <div className="mt-3">
                <p className="text-sm text-amber-700">
                  Cette annonce a été dépubliée par notre équipe (motif envoyé dans vos notifications). Corrigez le problème signalé puis republiez : les documents et critères seront re-contrôlés.
                </p>
                <form action={demanderPublication} className="mt-2">
                  <input type="hidden" name="listingId" value={listing.id} />
                  <button className="btn-primary">Republier l&apos;annonce</button>
                </form>
              </div>
            )}
            {listing.statut === "brouillon" && (
              <form action={demanderPublication} className="mt-3">
                <input type="hidden" name="listingId" value={listing.id} />
                <button className="btn-primary">Publier l&apos;annonce</button>
                {!compat.docsValides && (
                  <p className="mt-2 text-xs text-amber-700">
                    Publication bloquée tant que ces documents ne sont pas validés : {compat.docsManquants.join(", ")}.
                  </p>
                )}
              </form>
            )}
          </div>
        ) : (
          <AnnonceWizard
            vehicleId={veh.id}
            vehiculeLabel={`${veh.marque} ${veh.modele} ${veh.annee} — ${veh.ville}`}
            action={creerAnnonce}
          />
        )}
      </section>
    </div>
  );
}
