import { NextRequest, NextResponse } from "next/server";

/**
 * Pré-filtrage léger (présence du cookie). La vérification réelle (JWT + rôle + suspension)
 * est TOUJOURS refaite côté serveur dans requireUser().
 */
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("forvtc_session");
  const { pathname } = req.nextUrl;
  if ((pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) && !hasSession) {
    if (pathname.startsWith("/admin/setup")) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/connexion";
    url.searchParams.set("suite", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/admin/:path*"] };
