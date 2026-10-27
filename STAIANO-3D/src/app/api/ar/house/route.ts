import { NextRequest, NextResponse } from "next/server";
import {
  getAccessConfig,
  getSessionUser,
  isSameOrigin,
  SESSION_COOKIE,
} from "@/server/auth";
import { ArBridgeError, createArHouseLink } from "@/server/ar-bridge";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const MAX_BYTES = 60 * 1024 * 1024;
const tooBig = () =>
  new ArBridgeError("Modello della casa troppo grande per l'AR.");

/** Riceve il GLB della casa (corpo binario) e crea un link AR da 30 minuti. */
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
    if (Number(request.headers.get("content-length")) > MAX_BYTES)
      throw tooBig();
    const glb = Buffer.from(await request.arrayBuffer());
    if (glb.length > MAX_BYTES) throw tooBig();
    let label = "Casa";
    try {
      label =
        decodeURIComponent(request.headers.get("x-ar-label") ?? "") || label;
    } catch {
      // etichetta non decodificabile: resta «Casa»
    }
    const link = await createArHouseLink(label, glb);
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
