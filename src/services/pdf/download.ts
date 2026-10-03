import type { Project } from "@/schemas/project";
import { renderDossierPdf } from "./render";

export async function downloadDossier(project: Project): Promise<void> {
  const response = await fetch("/logo.svg");
  if (!response.ok)
    throw new Error("Logo Staiano non disponibile: riprovare l'esportazione.");
  const bytes = await renderDossierPdf(structuredClone(project), {
    logoSvg: await response.text(),
  });
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${project.name.replace(/[^a-zA-Z0-9àèéìòù _-]/g, "").slice(0, 100) || "progetto"}-dossier-tecnico.pdf`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
