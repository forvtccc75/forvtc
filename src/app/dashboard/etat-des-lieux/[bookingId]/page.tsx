import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { creerEtatDesLieux, ajouterPhotoInspection, validerEtatDesLieux } from "@/actions/inspections";
import { ErrorNote, OkNote } from "@/components/ui";
import { dateFr } from "@/lib/format";

export const dynamic = "force-dynamic";

const ETAT_LABELS: Record<string, string> = {
  bon: "Bon état",
  rayures_legeres: "Rayures légères",
  dommages_visibles: "Dommages visibles",
};
const ZONES = ["avant", "arriere", "gauche", "droite", "interieur", "compteur", "autre"] as const;

function FormEDL({ bookingId, type, energie }: { bookingId: string; type: "depart" | "retour"; energie: string }) {
  const electrique = energie === "electrique";
  return (
    <form action={creerEtatDesLieux} className="mt-3 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="type" value={type} />
      <div>
        <label className="label">Kilométrage relevé *</label>
        <input name="kilometrage" type="number" min="0" required className="input" />
      </div>
      <div>
        <label className="label">{electrique ? "Batterie (%)" : "Carburant (%)"}</label>
        <input name={electrique ? "batteriePct" : "carburantPct"} type="number" min="0" max="100" className="input" />
      </div>
      {(["carrosserie", "interieur", "pneus"] as const).map((champ) => (
        <div key={champ}>
          <label className="label capitalize">{champ} *</label>
          <select name={champ} required className="input">
            <option value="bon">Bon état</option>
            <option value="rayures_legeres">Rayures légères</option>
            <option value="dommages_visibles">Dommages visibles</option>
          </select>
        </div>
      ))}
      <div className="sm:col-span-2">
        <label className="label">Dégâts constatés (description précise)</label>
        <textarea name="degats" rows={2} className="input" placeholder="Ex. rayure 10 cm portière avant droite…" />
      </div>
      <div className="sm:col-span-2">
        <button className="btn-primary w-full">Enregistrer l&apos;état des lieux de {type} (horodaté)</button>
      </div>
    </form>
  );
}

export default async function EtatDesLieux({
  params,
  searchParams,
}: {
  params: { bookingId: string };
  searchParams: { erreur?: string; ok?: string };
}) {
  const user = await requireUser();
  const db = await getDb();
  const booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, params.bookingId) });
  if (!booking) notFound();
  const listing = (await db.query.listings.findFirst({ where: eq(schema.listings.id, booking.listingId) }))!;
  const vehicle = (await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) }))!;
  if (booking.driverId !== user.id && vehicle.ownerId !== user.id && user.role !== "admin") notFound();

  const inspections = await db.query.inspections.findMany({
    where: eq(schema.inspections.bookingId, booking.id),
    orderBy: asc(schema.inspections.createdAt),
  });
  const depart = inspections.find((i) => i.type === "depart");
  const retour = inspections.find((i) => i.type === "retour");
  const photos = inspections.length
    ? await db.query.inspectionPhotos.findMany({
        where: eq(schema.inspectionPhotos.inspectionId, depart?.id ?? inspections[0].id),
      })
    : [];
  const photosRetour = retour
    ? await db.query.inspectionPhotos.findMany({ where: eq(schema.inspectionPhotos.inspectionId, retour.id) })
    : [];
  const contratActif = await db.query.contracts.findFirst({
    where: and(eq(schema.contracts.bookingId, booking.id), eq(schema.contracts.statut, "actif")),
  });

  const bloc = (insp: typeof depart, ph: typeof photos, titre: string) =>
    insp ? (
      <section className="card mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">{titre}</h2>
          {insp.valideParAutrePartie ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              ✓ Validé contradictoirement le {insp.valideLe ? new Date(insp.valideLe).toLocaleString("fr-FR") : ""}
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              En attente de validation par l&apos;autre partie
            </span>
          )}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div><dt className="text-xs font-semibold uppercase text-slate-400">Horodaté le</dt><dd>{new Date(insp.createdAt).toLocaleString("fr-FR")}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-400">Kilométrage</dt><dd>{insp.kilometrage.toLocaleString("fr-FR")} km</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-400">{insp.batteriePct !== null ? "Batterie" : "Carburant"}</dt><dd>{insp.batteriePct ?? insp.carburantPct ?? "—"}{(insp.batteriePct ?? insp.carburantPct) !== null ? " %" : ""}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-400">Carrosserie</dt><dd>{ETAT_LABELS[insp.carrosserie]}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-400">Intérieur</dt><dd>{ETAT_LABELS[insp.interieur]}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-slate-400">Pneus</dt><dd>{ETAT_LABELS[insp.pneus]}</dd></div>
        </dl>
        {insp.degats && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900"><strong>Dégâts :</strong> {insp.degats}</p>}
        {ph.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {ph.map((p) => (
              <figure key={p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/fichiers/${encodeURIComponent(p.path)}`} alt={p.zone} className="h-24 w-32 rounded-lg object-cover" />
                <figcaption className="text-center text-[10px] text-slate-400">{p.zone}</figcaption>
              </figure>
            ))}
          </div>
        )}
        {!insp.valideParAutrePartie && insp.faitPar === user.id && (
          <form action={ajouterPhotoInspection} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="inspectionId" value={insp.id} />
            <select name="zone" className="input w-36">
              {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
            <input name="photo" type="file" accept=".jpg,.jpeg,.png,.webp" required className="input flex-1" />
            <button className="btn-secondary shrink-0">Ajouter la photo</button>
          </form>
        )}
        {!insp.valideParAutrePartie && insp.faitPar !== user.id && (
          <form action={validerEtatDesLieux} className="mt-3">
            <input type="hidden" name="inspectionId" value={insp.id} />
            <button className="btn-primary bg-emerald-600 hover:bg-emerald-700">
              VALIDER CET ÉTAT DES LIEUX (validation contradictoire)
            </button>
          </form>
        )}
      </section>
    ) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-black">État des lieux</h1>
      <p className="mt-1 text-sm text-slate-500">
        {listing.titre} · du {dateFr(booking.dateDebut)} au {dateFr(booking.dateFin)}
      </p>
      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>

      {bloc(depart, photos, "AVANT — état des lieux de départ")}

      {!depart && (
        <section className="card mt-5">
          <h2 className="font-bold">AVANT — état des lieux de départ</h2>
          {contratActif ? (
            <FormEDL bookingId={booking.id} type="depart" energie={vehicle.energie} />
          ) : (
            <p className="mt-2 text-sm text-amber-700">
              L&apos;état des lieux de départ sera disponible une fois le contrat signé par les deux parties.
            </p>
          )}
        </section>
      )}

      {depart?.valideParAutrePartie && bloc(retour, photosRetour, "APRÈS — état des lieux de retour")}

      {depart?.valideParAutrePartie && !retour && (
        <section className="card mt-5">
          <h2 className="font-bold">APRÈS — état des lieux de retour</h2>
          <FormEDL bookingId={booking.id} type="retour" energie={vehicle.energie} />
        </section>
      )}

      {depart && retour && (
        <section className="card mt-5 border-brand-100 bg-brand-50">
          <h2 className="font-bold">COMPARAISON AVANT / APRÈS</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="py-1.5">Critère</th><th>Départ</th><th>Retour</th><th>Écart</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-1.5 font-medium">Kilométrage</td>
                <td>{depart.kilometrage.toLocaleString("fr-FR")} km</td>
                <td>{retour.kilometrage.toLocaleString("fr-FR")} km</td>
                <td className="font-semibold">+{(retour.kilometrage - depart.kilometrage).toLocaleString("fr-FR")} km</td>
              </tr>
              {(["carrosserie", "interieur", "pneus"] as const).map((c) => {
                const degrade = depart[c] !== retour[c] && retour[c] !== "bon";
                return (
                  <tr key={c} className="border-b border-slate-100">
                    <td className="py-1.5 font-medium capitalize">{c}</td>
                    <td>{ETAT_LABELS[depart[c]]}</td>
                    <td>{ETAT_LABELS[retour[c]]}</td>
                    <td className={degrade ? "font-semibold text-red-600" : "text-emerald-700"}>
                      {depart[c] === retour[c] ? "identique" : degrade ? "⚠ dégradation signalée" : "amélioré"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {retour.degats && (
            <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">
              <strong>Nouveau dommage signalé au retour :</strong> {retour.degats}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            En cas de désaccord sur un dommage, ouvrez un litige depuis le support : les deux états des lieux horodatés et leurs photos serviront de référence.
          </p>
        </section>
      )}
    </div>
  );
}
