import { NextRequest, NextResponse } from "next/server";
import { getAccessConfig, getSessionUser, SESSION_COOKIE } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = getSessionUser(
      request.cookies.get(SESSION_COOKIE)?.value,
      await getAccessConfig(),
    );
    if (!user)
      return NextResponse.json(
        { message: "Accesso richiesto." },
        { status: 401, headers },
      );
    return NextResponse.json(
      {
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { message: "Accesso non configurato." },
      { status: 503, headers },
    );
  }
}
