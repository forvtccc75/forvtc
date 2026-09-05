"use client";

import { useEffect, useState } from "react";

const KEY = "forvtc-comparateur";
const MAX = 4;

function lire(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Case « Comparer » sur une carte d'annonce (max 4, persistant en localStorage). */
export function ComparerBouton({ listingId }: { listingId: string }) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    setIds(lire());
    const maj = () => setIds(lire());
    window.addEventListener("storage", maj);
    window.addEventListener("forvtc-comparateur", maj);
    return () => {
      window.removeEventListener("storage", maj);
      window.removeEventListener("forvtc-comparateur", maj);
    };
  }, []);

  const actif = ids.includes(listingId);
  const plein = !actif && ids.length >= MAX;

  return (
    <button
      type="button"
      disabled={plein}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = actif ? ids.filter((x) => x !== listingId) : [...ids, listingId].slice(0, MAX);
        localStorage.setItem(KEY, JSON.stringify(next));
        window.dispatchEvent(new Event("forvtc-comparateur"));
      }}
      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold transition ${
        actif ? "border-brand-600 bg-brand-600 text-white" : plein ? "border-slate-200 text-slate-300" : "border-slate-300 text-slate-500 hover:border-brand-400 hover:text-brand-600"
      }`}
      title={plein ? "4 annonces maximum dans le comparateur" : actif ? "Retirer du comparateur" : "Ajouter au comparateur"}
    >
      {actif ? "✓ À comparer" : "+ Comparer"}
    </button>
  );
}

/** Barre flottante : lien vers le comparateur quand ≥ 2 annonces sélectionnées. */
export function ComparateurBarre() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    setIds(lire());
    const maj = () => setIds(lire());
    window.addEventListener("storage", maj);
    window.addEventListener("forvtc-comparateur", maj);
    return () => {
      window.removeEventListener("storage", maj);
      window.removeEventListener("forvtc-comparateur", maj);
    };
  }, []);

  if (ids.length < 2) return null;
  return (
    <div className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 sm:bottom-6">
      <div className="flex items-center gap-3 rounded-full bg-slate-900 px-4 py-2 text-white shadow-xl">
        <span className="text-sm font-semibold">{ids.length} annonce{ids.length > 1 ? "s" : ""} sélectionnée{ids.length > 1 ? "s" : ""}</span>
        <a href={`/comparateur?ids=${ids.join(",")}`} className="rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-900">
          Comparer →
        </a>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(KEY, "[]");
            window.dispatchEvent(new Event("forvtc-comparateur"));
          }}
          className="text-xs text-slate-300 hover:text-white"
        >
          Vider
        </button>
      </div>
    </div>
  );
}
