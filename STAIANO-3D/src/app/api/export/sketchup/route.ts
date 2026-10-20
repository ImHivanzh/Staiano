import { localDwgRequestAllowed } from "@/services/import/dwg-server";
import {
  exportSketchup,
  readSketchupRequest,
  sketchupRuntime,
} from "@/services/export/sketchup-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!localDwgRequestAllowed(request))
    return Response.json(
      { message: "Esportazione disponibile solo sul server locale." },
      { status: 403 },
    );
  return Response.json(
    { available: !!(await sketchupRuntime()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  if (!localDwgRequestAllowed(request))
    return Response.json(
      { message: "Esportazione disponibile solo sul server locale." },
      { status: 403 },
    );
  try {
    const bytes = await exportSketchup(await readSketchupRequest(request));
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": "attachment; filename=Staiano.skp",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Esportazione SKP non riuscita.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
