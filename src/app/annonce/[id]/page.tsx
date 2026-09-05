import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { euros } from "@/lib/format";
import { evaluerCompatibilite } from "@/lib/compat";
import { CompatBadge, ErrorNote, OkNote } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { Calculateur } from "@/components/calculateur";
import { demanderLocation } from "@/actions/bookings";
import { contacterLoueur } from "@/actions/messages";
import { basculerFavori } from "@/actions/favorites";
import { and, eq as eq2 } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function Annonce({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erreur?: string; ok?: string };
}) {
  const db = await getDb();
  const listing = await db.query.listings.findFirst({ where: eq(schema.listings.id, params.id) });
  if (!listing || listing.statut !== "publiee") notFound();
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;
  const owner = await db.query.users.findFirst({ where: eq(schema.users.id, vehicle.ownerId) });
  const photos = await db.query.vehiclePhotos.findMany({ where: eq(schema.vehiclePhotos.vehicleId, vehicle.id) });
  const compat = await evaluerCompatibilite(vehicle);
  const user = await currentUser();
  const estFavori =
    user?.role === "chauffeur"
      ? !!(await db.query.favorites.findFirst({
          where: and(eq2(schema.favorites.userId, user.id), eq2(schema.favorites.listingId, listing.id)),
        }))
      : false;

  const assuranceTxt =
    listing.assurance === "incluse" ? "✓ Assurance incluse" : listing.assurance === "non_incluse" ? "✕ Assurance non incluse" : "⚠ Assurance : conditions spécifiques";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">{listing.titre}</h1>
          <p className="mt-1 text-slate-500">
            {vehicle.marque} {vehicle.modele} {vehicle.finition ?? ""} · {vehicle.annee} · 📍 {vehicle.ville} ({vehicle.codePostal})
          </p>
        </div>
        <CompatBadge global={compat.global} />
      </div>
      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>

      {photos.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {photos.map((p) => (
            // Photos servies via route authentifiée contrôlée
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={`/api/fichiers/${encodeURIComponent(p.path)}`} alt="Photo du véhicule" className="h-36 w-full rounded-lg object-cover" />
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="card">
            <h2 className="font-bold">Caractéristiques (déclarées par le loueur)</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              {[
                ["Énergie", vehicle.energie.replace(/_/g, " ")],
                ["Boîte", vehicle.boite],
                ["Kilométrage", `${vehicle.kilometrage.toLocaleString("fr-FR")} km`],
                ["Puissance", vehicle.puissanceKw ? `${vehicle.puissanceKw} kW` : "Non renseignée"],
                ["Places", String(vehicle.places)],
                ["Portes", String(vehicle.portes)],
                ["Couleur", vehicle.couleur ?? "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs font-semibold uppercase text-slate-400">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card">
            <h2 className="font-bold">Analyse de compatibilité VTC</h2>
            <p className="mt-1 text-xs text-slate-500">
              Analyse selon les règles configurées sur la plateforme (sources indiquées). Un critère « déclaré » n&apos;est pas une garantie : seules les vérifications documentaires font foi.
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {compat.resultats.map((r) => (
                <li key={r.code} className="flex items-start gap-2">
                  <span>{r.statut === "ok" ? "✅" : r.statut === "echec" ? "❌" : "⏳"}</span>
                  <span>
                    <strong>{r.libelle}</strong> — {r.detail}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {listing.description && (
            <section className="card">
              <h2 className="font-bold">Description</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{listing.description}</p>
            </section>
          )}
          {listing.conditions && (
            <section className="card">
              <h2 className="font-bold">Conditions du loueur</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{listing.conditions}</p>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card">
            <h2 className="font-bold">Tarifs</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {listing.prixJourCents !== null && <li><strong>{euros(listing.prixJourCents)}</strong> / jour</li>}
              {listing.prixSemaineCents !== null && <li><strong>{euros(listing.prixSemaineCents)}</strong> / semaine</li>}
              {listing.prixMoisCents !== null && <li><strong>{euros(listing.prixMoisCents)}</strong> / mois</li>}
            </ul>
            <hr className="my-3" />
            <ul className="space-y-1 text-sm text-slate-600">
              <li>Caution : <strong>{euros(listing.cautionCents)}</strong> (distincte du loyer)</li>
              {listing.kmInclusMois !== null && <li>Kilométrage inclus : {listing.kmInclusMois.toLocaleString("fr-FR")} km/mois</li>}
              {listing.prixKmSuppCents !== null && <li>Km supplémentaire : {euros(listing.prixKmSuppCents)}</li>}
              <li>Durée minimale : {listing.dureeMinJours} jour{listing.dureeMinJours > 1 ? "s" : ""}</li>
            </ul>
            <hr className="my-3" />
            <p className="text-sm font-semibold">{assuranceTxt}</p>
            {listing.assuranceDetails && <p className="mt-1 text-xs text-slate-500">{listing.assuranceDetails}</p>}
            <p className="text-sm">{listing.entretienInclus ? "✓ Entretien inclus" : "Entretien non inclus"}</p>
            <p className="text-sm">{listing.assistanceIncluse ? "✓ Assistance incluse" : "Assistance non incluse"}</p>
          </div>

          <div className="card">
            <h2 className="font-bold">Loueur</h2>
            <p className="mt-1 text-sm">{owner ? `${owner.prenom} ${owner.nom.charAt(0)}.` : "—"}</p>
            {owner && (
              <a href={`/loueur/${owner.id}`} className="mt-1 inline-block text-sm font-semibold text-brand-600 hover:underline">
                Voir le profil et les avis →
              </a>
            )}
          </div>

          <Calculateur
            prixJourCents={listing.prixJourCents}
            prixSemaineCents={listing.prixSemaineCents}
            prixMoisCents={listing.prixMoisCents}
            cautionCents={listing.cautionCents}
            kmInclusMois={listing.kmInclusMois}
            prixKmSuppCents={listing.prixKmSuppCents}
            dureeMinJours={listing.dureeMinJours}
          />

          {user?.role === "chauffeur" ? (
            <div className="card">
              <h2 className="font-bold">DEMANDER LA LOCATION</h2>
              <p className="mt-1 text-xs text-slate-500">
                Le loueur accepte ou refuse votre demande. Le prix faisant foi est recalculé côté serveur à partir des tarifs de l&apos;annonce.
              </p>
              <form action={demanderLocation} className="mt-3 space-y-3">
                <input type="hidden" name="listingId" value={listing.id} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label" htmlFor="dateDebut">Début</label>
                    <input id="dateDebut" name="dateDebut" type="date" required className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="dateFin">Fin</label>
                    <input id="dateFin" name="dateFin" type="date" required className="input" />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="message">Message au loueur (optionnel)</label>
                  <textarea id="message" name="message" rows={2} maxLength={2000} className="input"
                    placeholder="Présentez votre activité, votre expérience…" />
                </div>
                <button className="btn-primary w-full">ENVOYER MA DEMANDE</button>
              </form>
              <form action={contacterLoueur} className="mt-2">
                <input type="hidden" name="listingId" value={listing.id} />
                <button className="btn-secondary w-full">Poser une question au loueur</button>
              </form>
              <form action={basculerFavori} className="mt-2">
                <input type="hidden" name="listingId" value={listing.id} />
                <button className="btn-secondary w-full">{estFavori ? "♥ Retirer des favoris" : "♡ Ajouter aux favoris"}</button>
              </form>
            </div>
          ) : (
            <div className="card bg-slate-50">
              <h2 className="text-sm font-bold">Réserver ce véhicule</h2>
              {user ? (
                <p className="mt-1 text-xs text-slate-600">
                  Les demandes de location sont réservées aux comptes chauffeur.
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-600">
                  <a href="/connexion" className="font-semibold text-brand-600">Connectez-vous</a> ou{" "}
                  <a href="/inscription" className="font-semibold text-brand-600">créez votre compte chauffeur</a>{" "}
                  pour envoyer une demande de location et contacter le loueur.
                </p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Le paiement en ligne et la signature électronique du contrat sont en cours d&apos;activation
                (Stripe / Yousign) — nous n&apos;affichons aucun paiement simulé.
              </p>
            </div>
          )}

          <p className="text-xs text-slate-500">
            Rappel : la location de ce véhicule ne confère pas le droit d&apos;exercer comme VTC. Vérifiez votre carte professionnelle, votre inscription REVTC et la couverture « transport de personnes à titre onéreux ».
          </p>
        </aside>
      </div>
    </div>
  );
}
