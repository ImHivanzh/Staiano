import { decodeProjectBuffer } from "@/services/project/parse";
self.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer }>) => {
  try {
    self.postMessage({
      project: decodeProjectBuffer(event.data.buffer),
    });
  } catch (e) {
    self.postMessage({
      error: e instanceof Error ? e.message : "Importazione progetto fallita.",
    });
  }
};
