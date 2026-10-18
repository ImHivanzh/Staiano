import { NextRequest, NextResponse } from "next/server";
import {
  cookieOptions,
  getAccessConfig,
  isSameOrigin,
  SESSION_COOKIE,
  verifySession,
} from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request))
    return NextResponse.json(
      { message: "Origine non consentita." },
      { status: 403 },
    );
  try {
    const config = await getAccessConfig();
    if (!verifySession(request.cookies.get(SESSION_COOKIE)?.value, config))
      return NextResponse.json(
        { message: "Accesso richiesto." },
        { status: 401 },
      );
  } catch {
    return NextResponse.json(
      { message: "Accesso non configurato." },
      { status: 503 },
    );
  }
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/accedi",
      "Cache-Control": "private, no-store",
      "Clear-Site-Data": '"cache"',
    },
  });
  response.cookies.set(SESSION_COOKIE, "", {
    ...cookieOptions(request),
    maxAge: 0,
  });
  return response;
}
