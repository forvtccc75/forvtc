import { ErrorNote } from "@/components/ui";
import { InscriptionForm } from "./form";

export const metadata = { title: "Inscription — FORVTC" };

export default function Inscription({ searchParams }: { searchParams: { erreur?: string; role?: string } }) {
  const role = searchParams.role === "loueur" ? "loueur" : "chauffeur";
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-black">Créer un compte</h1>
      <p className="mt-1 text-sm text-slate-500">
        Étape 1 — Identité. Les étapes suivantes (documents, vérification) se font depuis votre tableau de bord.
      </p>
      <div className="mt-4">
        <ErrorNote msg={searchParams.erreur} />
      </div>
      <InscriptionForm roleInitial={role} />
    </div>
  );
}
