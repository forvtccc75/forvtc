import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { supprimerMonCompte } from "@/actions/rgpd";
import { ErrorNote, OkNote, VerifBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Mon compte : données personnelles, export RGPD, suppression. */
export default async function MonCompte({ searchParams }: { searchParams: { erreur?: string; ok?: string } }) {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/dashboard" className="text-sm text-brand-600">← Tableau de bord</Link>
      <h1 className="mt-2 text-2xl font-black">Mon compte</h1>
      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>

      <div className="card mt-5">
        <h2 className="font-bold">Informations</h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Nom</dt><dd className="font-semibold">{user.prenom} {user.nom}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Email</dt><dd className="font-semibold">{user.email} {user.emailVerifie ? "✔" : "(non vérifié)"}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Rôle</dt><dd className="font-semibold">{user.role.replace(/_/g, " ")}</dd></div>
          <div className="flex items-center justify-between"><dt className="text-slate-500">Vérification</dt><dd><VerifBadge statut={user.statutVerification} /></dd></div>
        </dl>
      </div>

      <div className="card mt-5">
        <h2 className="font-bold">Mes données (RGPD)</h2>
        <p className="mt-1 text-sm text-slate-500">
          Téléchargez l&apos;intégralité des données associées à votre compte au format JSON (droit à la portabilité).
        </p>
        <a href="/api/mes-donnees" className="btn-secondary mt-3 inline-block">📦 Exporter mes données</a>
      </div>

      <div className="card mt-5 border-red-200">
        <h2 className="font-bold text-red-700">Supprimer mon compte</h2>
        <p className="mt-1 text-sm text-slate-500">
          Vos données personnelles sont anonymisées immédiatement. Les contrats signés et paiements sont conservés
          (obligations légales de conservation) mais ne sont plus rattachés à une identité active.
          Impossible si une location est en cours.
        </p>
        <form action={supprimerMonCompte} className="mt-4 space-y-3">
          <div>
            <label className="label">Mot de passe</label>
            <input name="password" type="password" required className="input" autoComplete="current-password" />
          </div>
          <div>
            <label className="label">Tapez SUPPRIMER pour confirmer</label>
            <input name="confirmation" required className="input" placeholder="SUPPRIMER" />
          </div>
          <button className="btn-primary w-full !bg-red-600 hover:!bg-red-700">SUPPRIMER DÉFINITIVEMENT MON COMPTE</button>
        </form>
      </div>
    </div>
  );
}
