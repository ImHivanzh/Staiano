import { NextRequest, NextResponse } from "next/server";
import {
  getAccessConfig,
  getSessionUser,
  isSameOrigin,
  SESSION_COOKIE,
} from "@/server/auth";
import { boundedForm } from "@/server/auth-form";
import {
  hostStatus,
  isHostAction,
  requestHostAction,
} from "@/server/host-maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

async function administrator(request: NextRequest) {
  const user = getSessionUser(
    request.cookies.get(SESSION_COOKIE)?.value,
    await getAccessConfig(),
  );
  if (!user) return { error: "Accesso richiesto.", status: 401 } as const;
  if (user.role !== "admin" || user.mustChangePassword)
    return {
      error: "Operazione riservata all’amministratore.",
      status: 403,
    } as const;
  return { user } as const;
}

export async function GET(request: NextRequest) {
  const admin = await administrator(request);
  if ("error" in admin)
    return NextResponse.json(
      { message: admin.error },
      { status: admin.status, headers },
    );
  return NextResponse.json(await hostStatus(), { headers });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request))
    return NextResponse.json(
      { message: "Origine non consentita." },
      { status: 403, headers },
    );
  const admin = await administrator(request);
  if ("error" in admin)
    return NextResponse.json(
      { message: admin.error },
      { status: admin.status, headers },
    );
  let action: string | null;
  try {
    action = (await boundedForm(request)).get("action");
  } catch {
    action = null;
  }
  if (!isHostAction(action))
    return NextResponse.json(
      { message: "Operazione non valida." },
      { status: 400, headers },
    );
  try {
    await requestHostAction(action, admin.user.username);
  } catch {
    return NextResponse.json(
      { message: "Richiesta non registrata. Riprova." },
      { status: 500, headers },
    );
  }
  return NextResponse.json(
    {
      message:
        action === "reboot"
          ? "Riavvio del computer richiesto: parte entro 5 minuti e il computer si spegne dopo 30 secondi."
          : "Riavvio di AnyDesk richiesto: parte entro 5 minuti.",
    },
    { status: 202, headers },
  );
}
