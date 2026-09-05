import Link from "next/link";
import { connexion } from "@/actions/auth";
import { ErrorNote, OkNote } from "@/components/ui";

export const metadata = { title: "Connexion — FORVTC" };

export default function Connexion({ searchParams }: { searchParams: { erreur?: string; ok?: string } }) {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-black">Connexion</h1>
      <div className="mt-4 space-y-2">
        <ErrorNote msg={searchParams.erreur} />
        <OkNote msg={searchParams.ok} />
      </div>
      <form action={connexion} className="card mt-4 space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="input" autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Mot de passe</label>
          <input id="password" name="password" type="password" required className="input" autoComplete="current-password" />
        </div>
        <button className="btn-primary w-full">Se connecter</button>
        <p className="text-center text-sm">
          <Link href="/mot-de-passe-oublie" className="text-slate-500 hover:text-brand-600">Mot de passe oublié ?</Link>
        </p>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Pas encore de compte ? <Link href="/inscription" className="font-semibold text-brand-600">S&apos;inscrire</Link>
      </p>
    </div>
  );
}
