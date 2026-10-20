import { NextRequest, NextResponse } from "next/server";
import {
  getAccessConfig,
  getSessionUser,
  requestOrigin,
  SESSION_COOKIE,
} from "@/server/auth";
import { licenseEnforced, licenseStatus } from "@/server/license";

const publicPaths = new Set([
  "/accedi",
  "/api/auth/login",
  "/licenza",
  "/api/license",
  "/favicon.ico",
  "/logo.svg",
  "/fonts/Inter-Variable.woff2",
]);

const licensePaths = new Set([
  "/favicon.ico",
  "/logo.svg",
  "/fonts/Inter-Variable.woff2",
]);

/**
 * Controllo di licenza (attivo solo con LICENSE_ENFORCE=1). Senza licenza valida
 * per questa postazione il configuratore non risponde: le pagine vengono
 * portate sulla schermata di attivazione, le API rispondono 403.
 */
async function licenseBlock(
  request: NextRequest,
  pathname: string,
): Promise<NextResponse | null> {
  if (!licenseEnforced()) return null;
  if (
    licensePaths.has(pathname) ||
    pathname.startsWith("/licenza") ||
    pathname.startsWith("/api/license")
  )
    return null;
  const status = await licenseStatus().catch(() => null);
  if (status?.ok) return null;
  const message =
    status?.message || "Licenza non attiva: aprire la pagina di attivazione.";
  if (pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method))
    return NextResponse.json(
      {
        message,
        licenseRequired: true,
        licenseState: status?.state ?? "missing",
      },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  const origin = requestOrigin(request);
  if (!origin)
    return NextResponse.json(
      { message: "Origine non valida." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  return NextResponse.redirect(
    new URL(`/licenza?state=${status?.state ?? "missing"}`, origin),
    303,
  );
}

/** No matcher exclusions: API, workers, catalogs and models require the same session. */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const blocked = await licenseBlock(request, pathname);
  if (blocked) return blocked;
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
  const user = getSessionUser(
    request.cookies.get(SESSION_COOKIE)?.value,
    config,
  );
  if (user) {
    if (
      user.mustChangePassword &&
      ![
        "/api/auth/change-password",
        "/api/auth/logout",
        "/api/auth/session",
      ].includes(pathname)
    ) {
      if (
        pathname.startsWith("/api/") ||
        !["GET", "HEAD"].includes(request.method)
      )
        return NextResponse.json(
          {
            message: "Cambio password richiesto.",
            passwordChangeRequired: true,
          },
          { status: 403, headers: { "Cache-Control": "private, no-store" } },
        );
      const origin = requestOrigin(request);
      if (!origin)
        return NextResponse.json(
          { message: "Origine non valida." },
          { status: 400 },
        );
      return NextResponse.redirect(
        new URL(
          `/accedi?password=change&next=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`,
          origin,
        ),
        303,
      );
    }
    const response = NextResponse.next();
    // The 98 MB model and ORT runtime change only with a release: cache them
    // for an hour instead of downloading them again for every scan.
    response.headers.set(
      "Cache-Control",
      pathname.startsWith("/models/") || pathname.startsWith("/workers/ort-")
        ? "private, max-age=3600"
        : "private, no-store",
    );
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
