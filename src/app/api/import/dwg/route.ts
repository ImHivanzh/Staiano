import {
  boundedDwgBody,
  convertDwgDetailed,
  dwgConverterStatus,
  localDwgRequestAllowed,
} from "@/services/import/dwg-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!localDwgRequestAllowed(request))
    return Response.json(
      { message: "Conversione DWG disponibile solo sul server locale." },
      { status: 403 },
    );
  return Response.json(await dwgConverterStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!localDwgRequestAllowed(request))
    return Response.json(
      { message: "Conversione DWG disponibile solo sul server locale." },
      { status: 403 },
    );
  const status = await dwgConverterStatus();
  if (!status.available)
    return Response.json({ message: status.message }, { status: 503 });
  try {
    const result = await convertDwgDetailed(await boundedDwgBody(request));
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Conversione DWG fallita. Esportare DXF ASCII dal CAD.",
      },
      { status: 400 },
    );
  }
}
