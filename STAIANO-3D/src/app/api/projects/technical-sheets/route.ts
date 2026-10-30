import { NextRequest } from "next/server";
import {
  getAccessConfig,
  getSessionUser,
  isSameOrigin,
  SESSION_COOKIE,
} from "@/server/auth";
import { MAX_PROJECT_BYTES, parseProject } from "@/services/project/format";
import { technicalSheetsArchive } from "@/server/technical-sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request))
    return Response.json(
      { message: "Origine non consentita." },
      { status: 403 },
    );
  const user = getSessionUser(
    request.cookies.get(SESSION_COOKIE)?.value,
    await getAccessConfig(),
  );
  if (!user || user.mustChangePassword)
    return Response.json({ message: "Accesso richiesto." }, { status: 401 });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Progetto assente.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_PROJECT_BYTES) {
        await reader.cancel();
        return Response.json(
          { message: "Progetto troppo grande." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const project = parseProject(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    const result = await technicalSheetsArchive(project);
    const filename = `${project.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 70)}-schede-tecniche.zip`;
    return new Response(new Uint8Array(result.archive), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Sheet-Count": String(result.count),
        "X-Missing-Sheet-Count": String(result.missing),
      },
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error && error.message === "Progetto assente."
            ? error.message
            : "Progetto non valido.",
      },
      { status: 400 },
    );
  }
}
