import { NextRequest, NextResponse } from "next/server";
import {
  authenticateUser,
  changeUserPassword,
  clearLoginAttempts,
  cookieOptions,
  createSession,
  getAccessConfig,
  getSessionUser,
  isSameOrigin,
  safeReturnPath,
  SESSION_COOKIE,
  takeLoginAttempt,
} from "@/server/auth";
import { boundedForm } from "@/server/auth-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!isSameOrigin(request))
    return NextResponse.json(
      { message: "Origine non consentita." },
      { status: 403, headers },
    );
  let config;
  try {
    config = await getAccessConfig();
  } catch {
    return NextResponse.json(
      { message: "Accesso non configurato." },
      { status: 503, headers },
    );
  }
  const session = getSessionUser(
    request.cookies.get(SESSION_COOKIE)?.value,
    config,
  );
  if (!session)
    return NextResponse.json(
      { message: "Accesso richiesto." },
      { status: 401, headers },
    );
  const retry = takeLoginAttempt(request);
  if (retry)
    return NextResponse.json(
      { message: "Troppi tentativi. Riprova più tardi." },
      { status: 429, headers: { ...headers, "Retry-After": String(retry) } },
    );
  let form;
  try {
    form = await boundedForm(request);
  } catch {
    return NextResponse.json(
      { message: "Richiesta non valida." },
      { status: 400, headers },
    );
  }
  const next = safeReturnPath(form.get("next"));
  const failed = () =>
    new NextResponse(null, {
      status: 303,
      headers: {
        ...headers,
        Location: `/accedi?password=change&error=password&next=${encodeURIComponent(next)}`,
      },
    });
  const password = form.get("password") || "";
  if (
    password !== form.get("confirmPassword") ||
    !(await authenticateUser(
      session.username,
      form.get("currentPassword") || "",
      config,
    ))
  )
    return failed();
  try {
    const user = await changeUserPassword(session, password);
    config = await getAccessConfig();
    clearLoginAttempts(request);
    const response = new NextResponse(null, {
      status: 303,
      headers: { ...headers, Location: next },
    });
    response.cookies.set(
      SESSION_COOKIE,
      createSession(config, Date.now(), user),
      cookieOptions(request),
    );
    return response;
  } catch {
    return failed();
  }
}
