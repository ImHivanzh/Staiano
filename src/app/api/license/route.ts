import { NextRequest, NextResponse } from "next/server";
import {
  getAccessConfig,
  getSessionUser,
  isSameOrigin,
  SESSION_COOKIE,
} from "@/server/auth";
import {
  activateLicense,
  deactivateLicense,
  LicenseError,
  licenseSetup,
  licenseStatus,
} from "@/server/license";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

async function isAdmin(request: NextRequest): Promise<boolean> {
  try {
    const user = getSessionUser(
      request.cookies.get(SESSION_COOKIE)?.value,
      await getAccessConfig(),
    );
    return user?.role === "admin";
  } catch {
    return false;
  }
}

async function readRequest(request: NextRequest): Promise<{
  action: string;
  licenseKey: string;
  fromForm: boolean;
}> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("form")) {
    const data = await request.formData();
    return {
      action: String(data.get("action") ?? ""),
      licenseKey: String(data.get("licenseKey") ?? ""),
      fromForm: true,
    };
  }
  const data = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return {
    action: typeof data.action === "string" ? data.action : "",
    licenseKey: typeof data.licenseKey === "string" ? data.licenseKey : "",
    fromForm: false,
  };
}

async function view() {
  return {
    status: await licenseStatus({ force: true }),
    setup: await licenseSetup(),
  };
}

export async function GET() {
  try {
    return NextResponse.json(await view(), { headers });
  } catch {
    return NextResponse.json(
      { message: "Stato della licenza non disponibile." },
      { status: 503, headers },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request))
    return NextResponse.json(
      { message: "Origine non valida." },
      { status: 400, headers },
    );
  const { action, licenseKey, fromForm } = await readRequest(request);
  const redirect = (query: string) =>
    NextResponse.redirect(
      new URL(`/licenza?${query}`, request.nextUrl.origin),
      303,
    );
  try {
    if (action === "activate") {
      await activateLicense(licenseKey);
      if (fromForm) return redirect("ok=1");
      return NextResponse.json(await view(), { headers });
    }
    if (!["refresh", "deactivate"].includes(action)) {
      if (fromForm) return redirect("error=Operazione%20non%20riconosciuta.");
      return NextResponse.json(
        { message: "Operazione non riconosciuta." },
        { status: 400, headers },
      );
    }
    if (!(await isAdmin(request)))
      return NextResponse.json(
        { message: "Operazione riservata all'amministratore." },
        { status: 403, headers },
      );
    if (action === "refresh") {
      const status = await licenseStatus({ force: true });
      if (fromForm) return redirect(status.ok ? "ok=1" : "refresh=1");
      return NextResponse.json(await view(), { headers });
    }
    if (action === "deactivate") {
      await deactivateLicense();
      if (fromForm) return redirect("released=1");
      return NextResponse.json(await view(), { headers });
    }
    if (fromForm) return redirect("error=Operazione%20non%20riconosciuta.");
    return NextResponse.json(
      { message: "Operazione non riconosciuta." },
      { status: 400, headers },
    );
  } catch (error) {
    const message =
      error instanceof LicenseError
        ? error.message
        : "Operazione sulla licenza non riuscita.";
    if (fromForm) return redirect(`error=${encodeURIComponent(message)}`);
    return NextResponse.json({ message }, { status: 400, headers });
  }
}
