import Link from "next/link";
import { reinitialiserMdp } from "@/actions/password";
import { ErrorNote } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function Reinitialiser({ searchParams }: { searchParams: { token?: string; erreur?: string } }) {
  const token = searchParams.token ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="text-2xl font-black">Lien invalide</h1>
        <p className="mt-2 text-sm text-slate-500">Ce lien de réinitialisation est incomplet ou a déjà servi.</p>
        <Link href="/mot-de-passe-oublie" className="btn-primary mt-5 inline-block">Refaire une demande</Link>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-black">Nouveau mot de passe</h1>
      <p className="mt-1 text-sm text-slate-500">Choisissez un nouveau mot de passe (10 caractères minimum).</p>
      <div className="mt-4">
        <ErrorNote msg={searchParams.erreur} />
      </div>
      <form action={reinitialiserMdp} className="card mt-4 space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="password">Nouveau mot de passe</label>
          <input id="password" name="password" type="password" required minLength={10} className="input" />
        </div>
        <button className="btn-primary w-full">CHANGER LE MOT DE PASSE</button>
      </form>
    </div>
  );
}
