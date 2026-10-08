import { NextRequest, NextResponse } from "next/server";
import {
  AccessConfigurationError,
  AccountManagementError,
  cookieOptions,
  createSession,
  getAccessConfig,
  getSessionUser,
  isSameOrigin,
  managedUsers,
  manageUser,
  SESSION_COOKIE,
} from "@/server/auth";
import { boundedForm } from "@/server/auth-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

async function administrator(request: NextRequest) {
  const config = await getAccessConfig();
  const user = getSessionUser(
    request.cookies.get(SESSION_COOKIE)?.value,
    config,
  );
  if (!user) throw new AccountManagementError("Accesso richiesto.", 401);
  if (user.role !== "admin" || user.mustChangePassword)
    throw new AccountManagementError(
      "Operazione riservata all’amministratore.",
      403,
    );
  return { config, user };
}

function failed(error: unknown) {
  const status =
    error instanceof AccountManagementError
      ? error.status
      : error instanceof AccessConfigurationError
        ? 503
        : 500;
  const message =
    error instanceof AccountManagementError
      ? error.message
      : "Gestione utenti non disponibile. Riprova.";
  return NextResponse.json({ message }, { status, headers });
}

export async function GET(request: NextRequest) {
  try {
    const { config } = await administrator(request);
    return NextResponse.json({ users: managedUsers(config) }, { headers });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request))
    return NextResponse.json(
      { message: "Origine non consentita." },
      { status: 403, headers },
    );
  try {
    const { user, config: previousConfig } = await administrator(request);
    let form: URLSearchParams;
    try {
      form = await boundedForm(request);
    } catch {
      throw new AccountManagementError("Richiesta non valida.");
    }
    const action = form.get("action");
    if (action !== "create" && action !== "reset")
      throw new AccountManagementError("Operazione non valida.");
    const password = form.get("password") ?? "";
    if (password !== form.get("confirmPassword"))
      throw new AccountManagementError("Le password non coincidono.");
    const updated = await manageUser(user, action, {
      username: form.get("username") ?? "",
      displayName: form.get("displayName") ?? undefined,
      password,
    });
    const config = await getAccessConfig();
    const response = NextResponse.json(
      {
        user: updated,
        users: managedUsers(config),
        message:
          action === "create"
            ? "Utente creato. Cambio password richiesto al primo accesso."
            : "Password impostata. Le sessioni dell’utente sono state revocate; cambio password richiesto al prossimo accesso.",
      },
      { status: action === "create" ? 201 : 200, headers },
    );
    // Renew the administrator's legacy cookie when the first named account is
    // created. The admin's existing password and identity remain unchanged.
    if (!previousConfig.users)
      response.cookies.set(
        SESSION_COOKIE,
        createSession(config, Date.now(), user),
        cookieOptions(request),
      );
    return response;
  } catch (error) {
    return failed(error);
  }
}
