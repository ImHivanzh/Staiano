import { NextRequest, NextResponse } from "next/server";
import {
  getAccessConfig,
  getSessionUser,
  isSameOrigin,
  SESSION_COOKIE,
} from "@/server/auth";
import { ArBridgeError, createArLink } from "@/server/ar-bridge";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

/** Crea un link AR valido 30 minuti, apribile da iPad/telefono senza accesso. */
export async function POST(request: NextRequest) {
  const user = getSessionUser(
    request.cookies.get(SESSION_COOKIE)?.value,
    await getAccessConfig(),
  );
  if (!user || user.mustChangePassword)
    return NextResponse.json(
      { message: "Accesso richiesto." },
      { status: 401, headers },
    );
  if (!isSameOrigin(request))
    return NextResponse.json(
      { message: "Origine non valida." },
      { status: 403, headers },
    );
  try {
    const body = (await request.json()) as { items?: unknown };
    const link = await createArLink(body.items);
    if (!link.hosts.length)
      throw new ArBridgeError(
        "Nessuna rete locale rilevata: collega il PC alla rete.",
      );
    return NextResponse.json(
      {
        urls: link.hosts.map(
          (host) => `http://${host}:${link.port}/ar/${link.token}`,
        ),
        expiresAt: link.expiresAt,
      },
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof ArBridgeError
            ? error.message
            : "Link AR non creato.",
      },
      { status: error instanceof ArBridgeError ? 400 : 500, headers },
    );
  }
}
