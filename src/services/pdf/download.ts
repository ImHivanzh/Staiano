import type { Project } from "@/schemas/project";
import { renderDossierPdf } from "./render";
import type { PanoramaOptions } from "@/services/render3d/export";

export type DossierDownloadOptions = PanoramaOptions & {
  includeRenders?: boolean;
};

export async function downloadDossier(
  project: Project,
  options: DossierDownloadOptions = {},
): Promise<void> {
  const snapshot = structuredClone(project);
  options.signal?.throwIfAborted();
  const response = await fetch("/logo.svg");
  if (!response.ok)
    throw new Error("Logo Staiano non disponibile: riprovare l'esportazione.");
  const logoSvg = await response.text();
  const renderImages = options.includeRenders
    ? await (
        await import("@/services/render3d/export")
      ).renderProjectPanoramas(snapshot, options)
    : undefined;
  options.signal?.throwIfAborted();
  options.onProgress?.("Composizione dossier PDF");
  const bytes = await renderDossierPdf(snapshot, {
    logoSvg,
    renderImages,
  });
  options.signal?.throwIfAborted();
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${snapshot.name.replace(/[^a-zA-Z0-9àèéìòù _-]/g, "").slice(0, 100) || "progetto"}-dossier-tecnico.pdf`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
