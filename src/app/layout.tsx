import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { currentUser } from "@/lib/auth";
import { deconnexion } from "@/actions/auth";
import { BottomNav } from "@/components/bottom-nav";

export const metadata: Metadata = {
  title: "FORVTC — Location de véhicules pour chauffeurs VTC",
  description:
    "Comparez les véhicules, les prix et les conditions proposés par des loueurs vérifiés. Location de voitures adaptées à l'activité VTC en France.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#123d8e",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="fr">
      <body className="has-bottomnav flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="text-lg font-black tracking-tight text-brand-700">
              FOR<span className="text-slate-900">VTC</span>
            </Link>
            {/* Nav desktop — le mobile utilise la bottom nav */}
            <nav className="hidden items-center gap-2 text-sm md:flex">
              <Link href="/recherche" className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100">
                Rechercher
              </Link>
              {user ? (
                <>
                  <Link href={user.role === "admin" ? "/admin" : "/dashboard"} className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100">
                    {user.role === "admin" ? "Back-office" : "Tableau de bord"}
                  </Link>
                  <form action={deconnexion}>
                    <button className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100">Déconnexion</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/connexion" className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100">
                    Connexion
                  </Link>
                  <Link href="/inscription" className="btn-primary">
                    S&apos;inscrire
                  </Link>
                </>
              )}
            </nav>
            {/* Mobile : seulement l'action clé en haut à droite */}
            <div className="md:hidden">
              {user ? (
                <form action={deconnexion}>
                  <button className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500">Déconnexion</button>
                </form>
              ) : (
                <Link href="/inscription" className="btn-primary !min-h-[38px] !px-3.5 !py-1.5 text-xs">
                  S&apos;inscrire
                </Link>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-200 bg-white py-8">
          <div className="mx-auto max-w-6xl space-y-3 px-4 text-xs text-slate-500">
            <p className="font-semibold text-slate-600">FORVTC — mise en relation entre chauffeurs VTC et loueurs de véhicules.</p>
            <p>
              La location d&apos;un véhicule via FORVTC ne confère pas le droit d&apos;exercer l&apos;activité de chauffeur VTC.
              L&apos;exercice de cette activité requiert notamment une carte professionnelle VTC en cours de validité et
              l&apos;inscription de l&apos;exploitant au registre des VTC (REVTC). Vérifiez toujours que l&apos;assurance couvre
              explicitement le transport de personnes à titre onéreux.
            </p>
            <nav className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
              <Link href="/location-vtc" className="hover:text-brand-600">Location VTC par ville</Link>
              <Link href="/devenir-chauffeur-vtc" className="hover:text-brand-600">Devenir chauffeur VTC</Link>
              <Link href="/recherche" className="hover:text-brand-600">Rechercher un véhicule</Link>
            </nav>
          </div>
        </footer>
        <BottomNav role={user?.role ?? null} />
      </body>
    </html>
  );
}
