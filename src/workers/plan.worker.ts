import { parseDxf } from "@/services/import/dxf";
self.onmessage = (
  event: MessageEvent<{ text: string; filename: string; sizeBytes: number }>,
) => {
  try {
    self.postMessage({
      ok: true,
      plan: parseDxf(
        event.data.text,
        event.data.filename,
        event.data.sizeBytes,
      ),
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "DXF non leggibile.",
    });
  }
};
