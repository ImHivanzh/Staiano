import { NextRequest, NextResponse } from "next/server";
import {
  getAccessConfig,
  requestOrigin,
  SESSION_COOKIE,
  verifySession,
} from "@/server/auth";

const publicPaths = new Set([
  "/accedi",
  "/api/auth/login",
  "/favicon.ico",
  "/logo.svg",
]);

/** No matcher exclusions: API, workers, catalogs and models require the same session. */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (publicPaths.has(pathname)) return NextResponse.next();
  let config;
  try {
    config = await getAccessConfig();
  } catch {
    return NextResponse.json(
      {
        message:
          "Accesso non configurato. Eseguire node scripts/configure-access.mjs sul server.",
      },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (verifySession(request.cookies.get(SESSION_COOKIE)?.value, config)) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  if (
    pathname.startsWith("/api/") ||
    !["GET", "HEAD"].includes(request.method)
  ) {
    return NextResponse.json(
      { message: "Accesso richiesto." },
      {
        status: 401,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
  const next = encodeURIComponent(`${pathname}${request.nextUrl.search}`);
  const origin = requestOrigin(request);
  if (!origin)
    return NextResponse.json(
      { message: "Origine non valida." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  return NextResponse.redirect(new URL(`/accedi?next=${next}`, origin), 303);
}
