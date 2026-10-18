import { decodeProject } from "@/services/project/format";
self.onmessage = (event: MessageEvent<{ text: string }>) => {
  try {
    self.postMessage({ project: decodeProject(event.data.text) });
  } catch (e) {
    self.postMessage({
      error: e instanceof Error ? e.message : "Importazione progetto fallita.",
    });
  }
};
