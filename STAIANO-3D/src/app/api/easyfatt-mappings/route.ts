import { NextRequest, NextResponse } from "next/server";
import {
  getAccessConfig,
  getSessionUser,
  isSameOrigin,
  SESSION_COOKIE,
} from "@/server/auth";
import {
  readSharedProjects,
  sharedTransaction,
} from "@/server/project-sharing";
import { easyfattMappingSchema } from "@/domain/catalogs/easyfatt-mapping";
import { resolve } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const file = resolve(process.cwd(), ".cache/easyfatt-mappings.json");
const headers = { "Cache-Control": "private, no-store" };

async function authorized(request: NextRequest) {
  const user = getSessionUser(
    request.cookies.get(SESSION_COOKIE)?.value,
    await getAccessConfig(),
  );
  return user && !user.mustChangePassword;
}
export async function GET(request: NextRequest) {
  try {
    if (!(await authorized(request)))
      return NextResponse.json(
        { message: "Accesso richiesto." },
        { status: 401, headers },
      );
    return NextResponse.json(
      { mappings: await readSharedProjects(file) },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { message: "Archivio codici non disponibile." },
      { status: 500, headers },
    );
  }
}
export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request))
      return NextResponse.json(
        { message: "Origine non consentita." },
        { status: 403, headers },
      );
    if (!(await authorized(request)))
      return NextResponse.json(
        { message: "Accesso richiesto." },
        { status: 401, headers },
      );
    const reader = request.body?.getReader();
    if (!reader) throw new Error("body");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return NextResponse.json(
          { message: "Richiesta troppo grande." },
          { status: 413, headers },
        );
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    const body = JSON.parse(text);
    if (
      typeof body.key !== "string" ||
      body.key.length > 500 ||
      !body.key ||
      ["__proto__", "constructor", "prototype"].includes(body.key)
    )
      throw new Error("key");
    const mapping =
      body.mapping === null ? null : easyfattMappingSchema.parse(body.mapping);
    await sharedTransaction((records) => {
      if (mapping)
        (records as unknown as Record<string, unknown>)[body.key] = mapping;
      else delete records[body.key];
    }, file);
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json(
      { message: "Codice non salvato. Controllare i dati e riprovare." },
      { status: 400, headers },
    );
  }
}
