import { NextResponse } from "next/server";
import {
  clearLoginAttempts,
  authenticateUser,
  cookieOptions,
  createSession,
  getAccessConfig,
  isSameOrigin,
  safeReturnPath,
  SESSION_COOKIE,
  takeLoginAttempt,
} from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { boundedForm } from "@/server/auth-form";

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json(
      { message: "Origine non consentita." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  let config;
  try {
    config = await getAccessConfig();
  } catch {
    return NextResponse.json(
      {
        message:
          "Accesso non configurato. Eseguire node scripts/configure-access.mjs sul server.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const retry = takeLoginAttempt(request);
  if (retry)
    return NextResponse.json(
      { message: "Troppi tentativi. Riprova più tardi." },
      {
        status: 429,
        headers: { "Retry-After": String(retry), "Cache-Control": "no-store" },
      },
    );
  let form: URLSearchParams;
  try {
    form = await boundedForm(request);
  } catch {
    return NextResponse.json(
      { message: "Richiesta non valida." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const next = safeReturnPath(form.get("next"));
  const user = await authenticateUser(
    form.get("username") || "",
    form.get("password") || "",
    config,
  );
  if (!user) {
    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: `/accedi?error=invalid&next=${encodeURIComponent(next)}`,
        "Cache-Control": "no-store",
      },
    });
  }
  clearLoginAttempts(request);
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: user.mustChangePassword
        ? `/accedi?password=change&next=${encodeURIComponent(next)}`
        : next,
      "Cache-Control": "private, no-store",
    },
  });
  response.cookies.set(
    SESSION_COOKIE,
    createSession(config, Date.now(), config.users ? user : undefined),
    cookieOptions(request),
  );
  return response;
}
