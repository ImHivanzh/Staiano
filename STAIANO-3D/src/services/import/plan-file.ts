import type { ParsedPlan } from "./plan-types";
import { readRaster } from "./raster";
import { extractPdfVectors } from "./pdf-vectors";

export function validatePlanFile(
  file: Pick<File, "name" | "size" | "type">,
): "dxf" | "pdf" | "raster" | "dwg" {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (file.size === 0) throw new Error("Il file è vuoto.");
  if (file.size > 32 * 1024 * 1024)
    throw new Error(
      "Planimetria troppo grande. Limite 32 MB (immagini 15 MB).",
    );
  if (
    ext === "dwg" &&
    (!file.type ||
      [
        "application/octet-stream",
        "application/dwg",
        "application/acad",
        "image/vnd.dwg",
        "image/x-dwg",
      ].includes(file.type))
  )
    return "dwg";
  if (
    ext === "dxf" &&
    (!file.type ||
      [
        "application/dxf",
        "image/vnd.dxf",
        "image/x-dxf",
        "application/octet-stream",
        "text/plain",
      ].includes(file.type))
  )
    return "dxf";
  if (
    ext === "pdf" &&
    (!file.type ||
      file.type === "application/pdf" ||
      file.type === "application/octet-stream")
  )
    return "pdf";
  if (
    ["png", "jpg", "jpeg", "webp"].includes(ext ?? "") &&
    ["image/png", "image/jpeg", "image/webp"].includes(file.type)
  )
    return "raster";
  throw new Error(
    "Formato o tipo file non valido. Usare DXF ASCII, PDF, PNG o JPEG.",
  );
}
async function readDwg(file: File): Promise<ParsedPlan> {
  const unavailable =
    "DWG richiede un convertitore locale autorizzato. Esportare DXF ASCII 2D dal proprio CAD se la conversione non è disponibile.";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const statusResponse = await fetch("/api/import/dwg", {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!statusResponse.ok) throw new Error(unavailable);
    const status = (await statusResponse.json()) as {
      available: boolean;
      message: string;
      converter: string | null;
    };
    if (!status.available) throw new Error(status.message || unavailable);
    const response = await fetch("/api/import/dwg", {
      method: "POST",
      body: file,
      headers: { "Content-Type": "application/octet-stream" },
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      throw new Error(
        error?.message ||
          "Conversione DWG fallita. Esportare DXF ASCII dal CAD.",
      );
    }
    const result = (await response.json()) as {
      dxf: string;
      warnings: string[];
      originalVersion: string;
      parser: string;
    };
    if (
      typeof result.dxf !== "string" ||
      new TextEncoder().encode(result.dxf).byteLength > 32 * 1024 * 1024 ||
      !Array.isArray(result.warnings)
    )
      throw new Error("Risultato DWG non valido.");
    const converted = new File(
      [result.dxf],
      file.name.replace(/\.dwg$/i, ".dxf"),
      { type: "application/dxf" },
    );
    const parsed = await readDxf(converted);
    return {
      ...parsed,
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      sourceType: "dwg",
      warnings: [
        `DWG ${result.originalVersion} letto localmente con ${result.parser}. Verificare layer, assi e scala prima dell’importazione.`,
        ...result.warnings
          .slice(0, 100)
          .filter((warning) => typeof warning === "string")
          .map((warning) => `Lettore DWG: ${warning}`),
        ...parsed.warnings,
      ],
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("Conversione DWG scaduta. Esportare DXF ASCII dal CAD.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
async function readDxf(file: File): Promise<ParsedPlan> {
  const text = await file.text();
  return new Promise((resolve, reject) => {
    const worker = new Worker("/workers/plan.worker.js", { type: "module" });
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("DXF troppo complesso. Ridurre i layer e riprovare."));
    }, 30000);
    const done = () => {
      clearTimeout(timeout);
      worker.terminate();
    };
    worker.onmessage = (
      event: MessageEvent<{ ok: boolean; plan: ParsedPlan; error: string }>,
    ) => {
      done();
      if (event.data.ok) resolve(event.data.plan);
      else reject(new Error(event.data.error));
    };
    worker.onerror = () => {
      done();
      reject(
        new Error(
          "Importazione DXF interrotta. Esportare un DXF ASCII 2D semplificato.",
        ),
      );
    };
    worker.postMessage({ text, filename: file.name, sizeBytes: file.size });
  });
}
async function readPdf(file: File, pageNumber: number): Promise<ParsedPlan> {
  const buffer = await file.arrayBuffer();
  if (
    new TextDecoder("ascii").decode(buffer.slice(0, 8)).slice(0, 5) !== "%PDF-"
  )
    throw new Error("Il file non contiene un PDF valido.");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/workers/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useSystemFonts: true,
    maxImageSize: 40_000_000,
    stopAtErrors: true,
  });
  const timeout = setTimeout(() => void task.destroy(), 30000);
  try {
    const pdf = await task.promise;
    if (pageNumber < 1 || pageNumber > pdf.numPages)
      throw new Error(`Selezionare una pagina tra 1 e ${pdf.numPages}.`);
    const page = await pdf.getPage(pageNumber);
    const original = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 2200 / Math.max(original.width, original.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Anteprima PDF non disponibile nel browser.");
    // Extract before rendering: PDF.js mutates the packed operators into Path2D during render.
    const operators = await page.getOperatorList();
    let vectors: { segments: ParsedPlan["segments"]; warnings: string[] };
    try {
      vectors = extractPdfVectors(operators, pdfjs.OPS, viewport.transform);
    } catch {
      vectors = {
        segments: [],
        warnings: [
          "Troppi tracciati vettoriali: disponibile l'importazione come sfondo.",
        ],
      };
    }
    await page.render({
      canvas,
      canvasContext: context,
      viewport,
      background: "white",
    }).promise;
    const dataUrl = canvas.toDataURL("image/png");
    const textOps = new Set([
      pdfjs.OPS.showText,
      pdfjs.OPS.showSpacedText,
      pdfjs.OPS.nextLineShowText,
      pdfjs.OPS.nextLineSetSpacingShowText,
    ]);
    let analysisDataUrl: string | undefined;
    if (operators.fnArray.some((op) => textOps.has(op))) {
      // Omit glyph painting instead of erasing boxes that may overlap walls.
      await page.render({
        canvas,
        canvasContext: context,
        viewport,
        background: "white",
        operationsFilter: (index) => !textOps.has(operators.fnArray[index]),
      }).promise;
      analysisDataUrl = canvas.toDataURL("image/png");
    }
    if (Math.max(dataUrl.length, analysisDataUrl?.length ?? 0) > 28_000_000)
      throw new Error(
        "Pagina PDF troppo pesante. Ridurre la risoluzione e riprovare.",
      );
    const text = await page.getTextContent();
    const annotations: ParsedPlan["annotations"] = [];
    for (const item of text.items) {
      if ("str" in item && item.str && annotations.length < 2000) {
        const p = viewport.convertToViewportPoint(
          item.transform[4],
          item.transform[5],
        );
        annotations.push({
          layer: "Testi PDF",
          text: item.str.slice(0, 300),
          position: { x: p[0], y: p[1] },
        });
      }
    }
    return {
      sourceType: "pdf",
      filename: file.name,
      mimeType: "application/pdf",
      sizeBytes: file.size,
      segments: vectors.segments,
      annotations,
      analysisDataUrl,
      layers: vectors.segments.length
        ? [
            {
              name: "Tracciati PDF",
              count: vectors.segments.length,
              visible: true,
            },
          ]
        : [],
      warnings: [
        ...vectors.warnings,
        "La scala della pagina PDF non è la scala reale: calibrare su una misura nota.",
        ...(vectors.segments.length
          ? [
              "I tracciati PDF includono quote, simboli e bordi: selezionare solo assi muri verificati.",
            ]
          : [
              "Pagina raster o senza tracciati supportati: disegnare i muri sopra lo sfondo calibrato.",
            ]),
      ],
      suggestedMetersPerUnit: null,
      unitLabel: "pixel anteprima",
      pageCount: pdf.numPages,
      pageNumber,
      background: {
        dataUrl,
        widthPx: canvas.width,
        heightPx: canvas.height,
        metersPerPixel: 10 / canvas.width,
        origin: { x: 0, y: 0 },
        opacity: 0.5,
        filename: `${file.name} · pagina ${pageNumber}`,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException")
      throw new Error(
        "PDF protetto da password. Esportare una copia non protetta dal programma originale.",
      );
    if (
      error instanceof Error &&
      /Worker was destroyed|Loading aborted/.test(error.message)
    )
      throw new Error(
        "PDF troppo complesso. Esportare solo la pagina della planimetria.",
      );
    throw new Error(
      error instanceof Error ? error.message : "PDF non leggibile.",
    );
  } finally {
    clearTimeout(timeout);
    await task.destroy();
  }
}
export async function readPlanFile(
  file: File,
  pageNumber = 1,
): Promise<ParsedPlan> {
  const type = validatePlanFile(file);
  if (type === "dwg") return readDwg(file);
  if (type === "dxf") return readDxf(file);
  if (type === "pdf") return readPdf(file, pageNumber);
  const background = await readRaster(file);
  return {
    sourceType: "raster",
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    segments: [],
    annotations: [],
    layers: [],
    warnings: [
      "Immagine: calibrare due punti e disegnare manualmente i muri sopra lo sfondo.",
    ],
    suggestedMetersPerUnit: null,
    unitLabel: "pixel",
    background,
  };
}
