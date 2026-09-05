import Link from "next/link";

export type Etape = {
  label: string;
  fait: boolean;
  actuelle?: boolean;
  href?: string;
};

/** Fil d'avancement type Leboncoin : où j'en suis, quelle est la prochaine action. */
export function Stepper({ etapes }: { etapes: Etape[] }) {
  const prochaine = etapes.find((e) => !e.fait);
  return (
    <div className="card !p-4">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {etapes.map((e, i) => (
          <li key={e.label} className="flex items-center gap-1">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                e.fait
                  ? "bg-emerald-500 text-white"
                  : e === prochaine
                    ? "bg-brand-600 text-white ring-4 ring-brand-100"
                    : "bg-slate-200 text-slate-500"
              }`}
            >
              {e.fait ? "✓" : i + 1}
            </span>
            <span className={`text-xs font-semibold ${e.fait ? "text-emerald-700" : e === prochaine ? "text-brand-700" : "text-slate-400"}`}>
              {e.label}
            </span>
            {i < etapes.length - 1 && <span className="mx-1 hidden h-px w-5 bg-slate-200 sm:block" />}
          </li>
        ))}
      </ol>
      {prochaine && (
        <p className="mt-2.5 text-sm text-slate-600">
          <strong>Prochaine étape :</strong> {prochaine.label}
          {prochaine.href && (
            <Link href={prochaine.href} className="ml-2 font-semibold text-brand-600 hover:underline">
              y aller →
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
