"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: React.ReactNode; match: (p: string) => boolean };

const ic = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
    <path d={d} />
  </svg>
);

const ICONS = {
  home: ic("M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5"),
  search: ic("M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35"),
  heart: ic("M12 21C7 16.6 3 13.2 3 9.1 3 6.3 5.2 4 8 4c1.6 0 3.1.8 4 2 0.9-1.2 2.4-2 4-2 2.8 0 5 2.3 5 5.1 0 4.1-4 7.5-9 11.9Z"),
  chat: ic("M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z"),
  user: ic("M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9a8 8 0 0 1 16 0"),
  shield: ic("M12 3l8 3v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6l8-3Z"),
};

/** Navigation basse type app mobile — masquée sur desktop (md+). */
export function BottomNav({ role }: { role: string | null }) {
  const pathname = usePathname();

  const items: Item[] =
    role === "admin"
      ? [
          { href: "/admin", label: "Back-office", icon: ICONS.shield, match: (p) => p.startsWith("/admin") && !p.startsWith("/admin/documents") && !p.startsWith("/admin/litiges") },
          { href: "/admin/documents", label: "Documents", icon: ICONS.search, match: (p) => p.startsWith("/admin/documents") },
          { href: "/admin/litiges", label: "Litiges", icon: ICONS.chat, match: (p) => p.startsWith("/admin/litiges") },
          { href: "/admin/audit", label: "Audit", icon: ICONS.user, match: (p) => p.startsWith("/admin/audit") },
        ]
      : role === "chauffeur"
        ? [
            { href: "/", label: "Accueil", icon: ICONS.home, match: (p) => p === "/" },
            { href: "/recherche", label: "Recherche", icon: ICONS.search, match: (p) => p.startsWith("/recherche") || p.startsWith("/annonce") },
            { href: "/dashboard/favoris", label: "Favoris", icon: ICONS.heart, match: (p) => p.startsWith("/dashboard/favoris") },
            { href: "/dashboard/messages", label: "Messages", icon: ICONS.chat, match: (p) => p.startsWith("/dashboard/messages") },
            { href: "/dashboard", label: "Compte", icon: ICONS.user, match: (p) => p.startsWith("/dashboard") && !p.startsWith("/dashboard/favoris") && !p.startsWith("/dashboard/messages") },
          ]
        : role
          ? [
              { href: "/", label: "Accueil", icon: ICONS.home, match: (p) => p === "/" },
              { href: "/dashboard/vehicules", label: "Véhicules", icon: ICONS.search, match: (p) => p.startsWith("/dashboard/vehicules") || p.startsWith("/dashboard/annonces") },
              { href: "/dashboard/demandes", label: "Demandes", icon: ICONS.heart, match: (p) => p.startsWith("/dashboard/demandes") || p.startsWith("/dashboard/locations") },
              { href: "/dashboard/messages", label: "Messages", icon: ICONS.chat, match: (p) => p.startsWith("/dashboard/messages") },
              { href: "/dashboard", label: "Compte", icon: ICONS.user, match: (p) => p === "/dashboard" || p.startsWith("/dashboard/documents") },
            ]
          : [
              { href: "/", label: "Accueil", icon: ICONS.home, match: (p) => p === "/" },
              { href: "/recherche", label: "Recherche", icon: ICONS.search, match: (p) => p.startsWith("/recherche") || p.startsWith("/annonce") },
              { href: "/connexion", label: "Connexion", icon: ICONS.user, match: (p) => p.startsWith("/connexion") || p.startsWith("/inscription") },
            ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-safe md:hidden">
      <div className="mx-auto flex h-16 max-w-lg items-stretch">
        {items.map((it) => {
          const actif = it.match(pathname);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors ${
                actif ? "text-brand-600" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {it.icon}
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
