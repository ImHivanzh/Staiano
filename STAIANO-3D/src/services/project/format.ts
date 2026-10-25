import { projectSchema, type Project } from "@/schemas/project";
import { recomputeProject } from "@/domain/project";
import { refreshDuctedBindings } from "@/domain/ducted/refresh";
import { refreshSplitBindings } from "@/domain/air-conditioning/refresh";
import { loadProjectCatalogs } from "./catalogs";
import {
  MAX_PROJECT_BYTES,
  parseProject as parseProjectData,
  decodeProject as decodeProjectData,
  decodeProjectBuffer as decodeProjectBufferData,
} from "./parse";
export { MAX_PROJECT_BYTES, migrateProject } from "./parse";
function refreshProject(project: Project): Project {
  return refreshSplitBindings(refreshDuctedBindings(recomputeProject(project)));
}
export function parseProject(data: unknown): Project {
  return refreshProject(parseProjectData(data));
}
export async function prepareProject(data: unknown): Promise<Project> {
  const project = parseProjectData(data);
  await loadProjectCatalogs(project);
  return refreshProject(project);
}
export function decodeProject(text: string): Project {
  return refreshProject(decodeProjectData(text));
}
export function decodeProjectBuffer(buffer: ArrayBuffer): Project {
  return refreshProject(decodeProjectBufferData(buffer));
}
export function encodeProject(p: Project): string {
  const text = JSON.stringify(
    projectSchema.parse(
      refreshSplitBindings(refreshDuctedBindings(recomputeProject(p))),
    ),
    null,
    2,
  );
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES)
    throw new Error(
      "Progetto troppo grande. Limite 128 MB incluso il file originale.",
    );
  return text;
}
export function downloadFile(name: string, data: Blob) {
  const url = URL.createObjectURL(data),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function exportProject(p: Project) {
  const name =
    p.name.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 100) || "progetto";
  downloadFile(
    `${name}.hvacproj`,
    new Blob([encodeProject(p)], { type: "application/json" }),
  );
}
