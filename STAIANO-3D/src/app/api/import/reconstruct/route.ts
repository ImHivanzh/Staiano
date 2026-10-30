import { localDwgRequestAllowed } from "@/services/import/dwg-server";
import {
  planRecognizerRuntime,
  recognitionAiStatus,
  recognizerBusy,
  reconstructImage,
} from "@/services/import/reconstruction-server";
import {
  installPython312,
  prepareRecognizer,
} from "@/services/import/plan-recognizer-setup";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!localDwgRequestAllowed(request))
    return Response.json({ available: false }, { status: 403 });
  const check = new URL(request.url).searchParams.get("check") === "1";
  // Installa o sostituisce da solo il modello AI quando manca o è cambiato.
  await prepareRecognizer(
    check,
    await planRecognizerRuntime(),
    recognizerBusy(),
  );
  return Response.json(await recognitionAiStatus(check), {
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(request: Request) {
  if (!localDwgRequestAllowed(request))
    return Response.json(
      { message: "Ricostruzione disponibile solo sul server locale." },
      { status: 403 },
    );
  try {
    if (new URL(request.url).searchParams.get("action") === "install-python") {
      installPython312();
      return Response.json(await recognitionAiStatus(false), {
        headers: { "Cache-Control": "no-store" },
      });
    }
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
