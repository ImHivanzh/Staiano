import type { Project } from "@/schemas/project";
import { renderDossierPdf } from "./render";
import type { PanoramaOptions } from "@/services/render3d/export";
import { downloadFile } from "@/services/project/format";

export type DossierDownloadOptions = PanoramaOptions & {
  variant?: "complete" | "summary";
  monochrome?: boolean;
};

export async function generateDossier(
  project: Project,
  options: DossierDownloadOptions = {},
): Promise<{ blob: Blob; name: string }> {
  const snapshot = structuredClone(project);
  options.signal?.throwIfAborted();
  const response = await fetch("/logo.svg");
  if (!response.ok)
    throw new Error("Logo Staiano non disponibile: riprovare l'esportazione.");
  const logoSvg = await response.text();
  const renderImages = await (
    await import("@/services/render3d/export")
  ).renderProjectPanoramas(snapshot, {
    ...options,
    floorId: undefined,
    roomId: undefined,
    includeRooms: true,
  });
  if (!renderImages.length)
    throw new Error(
      "Il dossier richiede un render 3D. Inserisci la geometria del progetto prima di esportare.",
    );
  options.signal?.throwIfAborted();
  options.onProgress?.("Composizione dossier PDF");
  const bytes = await renderDossierPdf(snapshot, {
    logoSvg,
    renderImages,
    variant: options.variant,
    monochrome: options.monochrome,
  });
  options.signal?.throwIfAborted();
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  return {
    blob,
    name: `${snapshot.name.replace(/[^a-zA-Z0-9àèéìòù _-]/g, "").slice(0, 100) || "progetto"}-dossier-${options.variant === "summary" ? "sintetico" : "completo"}${options.monochrome ? "-bianco-nero" : ""}.pdf`,
  };
}

export async function downloadDossier(
  project: Project,
  options: DossierDownloadOptions = {},
): Promise<void> {
  const document = await generateDossier(project, options);
  downloadFile(document.name, document.blob);
}

export async function downloadMaterials(project: Project): Promise<void> {
  const snapshot = structuredClone(project);
  const bytes = await (
    await import("./materials")
  ).renderMaterialsPdf(snapshot);
  const name = `${snapshot.name.replace(/[^a-zA-Z0-9àèéìòù _-]/g, "").slice(0, 100) || "progetto"}-distinta-materiali.pdf`;
  downloadFile(
    name,
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
  );
}
