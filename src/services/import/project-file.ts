import type { Project } from "@/schemas/project";
import { MAX_PROJECT_BYTES, decodeProject } from "@/services/project/format";
export async function importProjectFile(file: File): Promise<Project> {
  if (!file.name.toLowerCase().endsWith(".hvacproj"))
    throw new Error("Selezionare un file .hvacproj.");
  if (file.size > MAX_PROJECT_BYTES)
    throw new Error("Progetto troppo grande. Limite 128 MB.");
  if (
    file.type &&
    !["application/json", "application/octet-stream", "text/plain"].includes(
      file.type,
    )
  )
    throw new Error("Tipo file progetto non valido.");
  const text = await file.text();
  if (typeof Worker === "undefined") return decodeProject(text);
  return new Promise<Project>((resolve, reject) => {
    const worker = new Worker("/workers/project.worker.js");
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(
        new Error(
          "Importazione troppo complessa. Ridurre il progetto e riprovare.",
        ),
      );
    }, 20000);
    const finish = () => {
      clearTimeout(timeout);
      worker.terminate();
    };
    worker.onmessage = (
      event: MessageEvent<{ project?: Project; error?: string }>,
    ) => {
      finish();
      if (event.data.project) resolve(event.data.project);
      else reject(new Error(event.data.error ?? "Importazione fallita."));
    };
    worker.onerror = () => {
      finish();
      reject(new Error("Non è stato possibile analizzare il progetto."));
    };
    worker.postMessage({ text });
  });
}
