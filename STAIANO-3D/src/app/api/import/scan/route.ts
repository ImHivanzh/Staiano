import { z } from "zod";
import { isSameOrigin } from "@/server/auth";
import { scanPantum, ScannerError } from "@/services/import/pantum-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const options = z
  .object({
    dpi: z.union([z.literal(150), z.literal(300), z.literal(600)]),
    sorgente: z.enum(["piano", "adf"]),
  })
  .strict();
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return Response.json(
      { message: "Origine non consentita." },
      { status: 403, headers },
    );
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return Response.json(
      { message: "Richiesto un corpo JSON." },
      { status: 415, headers },
    );
  const length = Number(request.headers.get("content-length"));
  if (!Number.isInteger(length) || length <= 0 || length > 1024)
    return Response.json(
      { message: "Richiesta troppo grande o senza dimensione." },
      { status: 413, headers },
    );
  const parsed = options.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { message: "Scegli piano/vassoio e 150/300/600 DPI." },
      { status: 400, headers },
    );
  try {
    const pdf = await scanPantum(parsed.data.dpi, parsed.data.sorgente);
    return new Response(pdf, {
      headers: { ...headers, "Content-Type": "application/pdf" },
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof ScannerError
            ? error.message
            : "Scansione non riuscita. Verifica il driver Pantum e riprova.",
      },
      { status: error instanceof ScannerError ? error.status : 502, headers },
    );
  }
}
