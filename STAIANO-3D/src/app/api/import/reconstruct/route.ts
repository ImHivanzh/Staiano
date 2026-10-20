import { localDwgRequestAllowed } from "@/services/import/dwg-server";
import {
  planRecognizerRuntime,
  reconstructImage,
} from "@/services/import/reconstruction-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!localDwgRequestAllowed(request))
    return Response.json({ available: false }, { status: 403 });
  return Response.json(
    { available: Boolean(await planRecognizerRuntime()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  if (!localDwgRequestAllowed(request))
    return Response.json(
      { message: "Ricostruzione disponibile solo sul server locale." },
      { status: 403 },
    );
  try {
    return Response.json(await reconstructImage(request), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Ricostruzione 2D non riuscita.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
