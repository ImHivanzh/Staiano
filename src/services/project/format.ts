import { projectSchema, type Project } from "@/schemas/project";
import { recomputeProject } from "@/domain/project";

export const MAX_PROJECT_BYTES = 32 * 1024 * 1024;
export function migrateProject(data: unknown): unknown {
  if (typeof data !== "object" || data === null || !("schemaVersion" in data))
    throw new Error("Formato progetto non riconosciuto.");
  const version = (data as { schemaVersion: unknown }).schemaVersion;
  if (typeof version !== "number" || version > 1)
    throw new Error(
      "Versione progetto non supportata. Aggiornare l'applicazione.",
    );
  if (version === 0) {
    const old = data as Record<string, unknown>;
    // v0 stored the same geometry; v1 introduced separate supply/return counts.
    return {
      ...old,
      schemaVersion: 1,
      rooms: Array.isArray(old.rooms)
        ? old.rooms.map((r: Record<string, unknown>) => ({
            ...r,
            supplyPoints: r.supplyPoints ?? 1,
            returnPoints: r.returnPoints ?? 1,
          }))
        : old.rooms,
    };
  }
  if (version !== 1)
    throw new Error("Migration mancante per questa versione progetto.");
  return data;
}
export function parseProject(data: unknown): Project {
  const parsed = projectSchema.safeParse(migrateProject(data));
  if (!parsed.success)
    throw new Error(
      `Progetto non valido: ${parsed.error.issues[0]?.message ?? "schema errato"}.`,
    );
  return recomputeProject(parsed.data);
}
export function decodeProject(text: string): Project {
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES)
    throw new Error("Progetto troppo grande. Limite 32 MB.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Il file non contiene un progetto JSON valido.");
  }
  return parseProject(data);
}
export function encodeProject(p: Project): string {
  return JSON.stringify(projectSchema.parse(recomputeProject(p)), null, 2);
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
