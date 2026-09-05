import Link from "next/link";
import { demanderResetMdp } from "@/actions/password";
import { ErrorNote, OkNote } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function MotDePasseOublie({ searchParams }: { searchParams: { erreur?: string; ok?: string } }) {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-black">Mot de passe oublié</h1>
      <p className="mt-1 text-sm text-slate-500">
        Indiquez l&apos;email de votre compte : nous vous enverrons un lien de réinitialisation valable 1 heure.
      </p>
      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>
      <form action={demanderResetMdp} className="card mt-4 space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="input" placeholder="vous@exemple.fr" />
        </div>
        <button className="btn-primary w-full">ENVOYER LE LIEN</button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        <Link href="/connexion" className="font-semibold text-brand-600">← Retour à la connexion</Link>
      </p>
    </div>
  );
}
