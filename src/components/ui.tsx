import Link from "next/link";

/** Badges de la règle de vérité — utilisés partout, jamais détournés. */
export function VerifBadge({ statut }: { statut: string }) {
  const map: Record<string, { txt: string; cls: string }> = {
    verifie: { txt: "✓ Vérifié", cls: "bg-emerald-100 text-emerald-800" },
    declare: { txt: "Déclaré par l'utilisateur", cls: "bg-amber-100 text-amber-800" },
    en_attente: { txt: "En attente de vérification", cls: "bg-amber-100 text-amber-800" },
    non_verifie: { txt: "Non vérifié", cls: "bg-slate-200 text-slate-700" },
    refuse: { txt: "Refusé", cls: "bg-red-100 text-red-800" },
    expire: { txt: "Expiré", cls: "bg-red-100 text-red-800" },
  };
  const b = map[statut] ?? map.non_verifie;
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.cls}`}>{b.txt}</span>;
}

export function DocBadge({ statut }: { statut: string }) {
  const map: Record<string, { txt: string; cls: string }> = {
    depose: { txt: "Déposé — non vérifié", cls: "bg-slate-200 text-slate-700" },
    en_verification: { txt: "En vérification", cls: "bg-amber-100 text-amber-800" },
    valide: { txt: "✓ Validé", cls: "bg-emerald-100 text-emerald-800" },
    refuse: { txt: "Refusé", cls: "bg-red-100 text-red-800" },
    expire: { txt: "Expiré", cls: "bg-red-100 text-red-800" },
  };
  const b = map[statut] ?? map.depose;
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.cls}`}>{b.txt}</span>;
}

export function CompatBadge({ global }: { global: string }) {
  if (global === "compatible_verifie")
    return <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">✓ Compatible selon les critères vérifiés</span>;
  if (global === "non_valide")
    return <span className="inline-block rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">✕ Non validé</span>;
  return <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">⚠ Vérification nécessaire</span>;
}

export function Empty({ titre, sous, cta, href }: { titre: string; sous?: string; cta?: string; href?: string }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-12 text-center">
      <p className="text-base font-semibold text-slate-700">{titre}</p>
      {sous && <p className="max-w-md text-sm text-slate-500">{sous}</p>}
      {cta && href && <Link href={href} className="btn-primary mt-3">{cta}</Link>}
    </div>
  );
}

export function ErrorNote({ msg }: { msg?: string | string[] }) {
  if (!msg) return null;
  const m = Array.isArray(msg) ? msg[0] : msg;
  return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{decodeURIComponent(m)}</div>;
}

export function OkNote({ msg }: { msg?: string | string[] }) {
  if (!msg) return null;
  const m = Array.isArray(msg) ? msg[0] : msg;
  return <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{decodeURIComponent(m)}</div>;
}
