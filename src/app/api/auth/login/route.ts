import { NextResponse } from "next/server";
import {
  clearLoginAttempts,
  cookieOptions,
  createSession,
  getAccessConfig,
  isSameOrigin,
  safeReturnPath,
  SESSION_COOKIE,
  takeLoginAttempt,
  verifyLoginPassword,
} from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function boundedForm(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/x-www-form-urlencoded")
  )
    throw new Error("invalid form");
  const declared = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(declared) || declared > 4096 || !request.body)
    throw new Error("invalid form");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) {
        await reader.cancel();
        throw new Error("invalid form");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

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
  if (!(await verifyLoginPassword(form.get("password") || "", config))) {
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
    headers: { Location: next, "Cache-Control": "private, no-store" },
  });
  response.cookies.set(
    SESSION_COOKIE,
    createSession(config),
    cookieOptions(request),
  );
  return response;
}
