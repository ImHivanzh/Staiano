import {
  projectSchema,
  CURRENT_SCHEMA_VERSION,
  type Project,
} from "@/schemas/project";
import { recomputeProject } from "@/domain/project";
import { refreshDuctedBindings } from "@/domain/ducted/refresh";
import { refreshSplitBindings } from "@/domain/air-conditioning/refresh";

// Retained original plan + raster preview can exceed the original 32 MB upload.
export const MAX_PROJECT_BYTES = 128 * 1024 * 1024;
export function migrateProject(data: unknown): unknown {
  if (typeof data !== "object" || data === null || !("schemaVersion" in data))
    throw new Error("Formato progetto non riconosciuto.");
  const version = (data as { schemaVersion: unknown }).schemaVersion;
  if (typeof version !== "number" || version > CURRENT_SCHEMA_VERSION)
    throw new Error(
      "Versione progetto non supportata. Aggiornare l'applicazione.",
    );
  if (version === 0) {
    const old = data as Record<string, unknown>;
    // v0 stored the same geometry; v1 introduced separate supply/return counts.
    return migrateProject({
      ...old,
      schemaVersion: 1,
      rooms: Array.isArray(old.rooms)
        ? old.rooms.map((r: Record<string, unknown>) => ({
            ...r,
            supplyPoints: r.supplyPoints ?? 1,
            returnPoints: r.returnPoints ?? 1,
          }))
        : old.rooms,
    });
  }
  if (version === 1) {
    const old = data as Record<string, unknown>;
    return migrateProject({
      ...old,
      schemaVersion: 2,
      airTerminals: Array.isArray(old.airTerminals)
        ? old.airTerminals.map((item: Record<string, unknown>) => ({
            ...item,
            systemId: item.systemId ?? null,
            mounting: item.mounting ?? "unknown",
            shape: item.shape ?? "unknown",
            elevationM: item.elevationM ?? null,
            operatingPointIndex: item.operatingPointIndex ?? null,
            noiseUpperBoundDbA: item.noiseUpperBoundDbA ?? null,
            noiseLabel:
              item.noiseLabel ??
              (item.noiseDbA == null
                ? "Dato non disponibile"
                : String(item.noiseDbA)),
            pressureDropPa: item.pressureDropPa ?? null,
            throwM: item.throwM ?? null,
            openingMm: item.openingMm ?? null,
            pointIndex: item.pointIndex ?? null,
            unitIndex: item.unitIndex ?? null,
            legacyUnverified: true,
          }))
        : [],
    });
  }
  if (version === 2) {
    const old = data as Record<string, unknown>;
    const asArray = (v: unknown) => (Array.isArray(v) ? v : []);
    // Additive only: v3 readers fill the same defaults, so rollback is key
    // removal and no v2 information is altered or dropped.
    return migrateProject({
      ...old,
      schemaVersion: 3,
      floors: asArray(old.floors).map((f: Record<string, unknown>) => ({
        ...f,
        importAnalysis: f.importAnalysis ?? null,
      })),
      walls: asArray(old.walls).map((w: Record<string, unknown>) => ({
        ...w,
        locked: w.locked ?? false,
      })),
      rooms: asArray(old.rooms).map((r: Record<string, unknown>) => ({
        ...r,
        usage: r.usage ?? "",
      })),
      hvacSystems: asArray(old.hvacSystems).map(
        (s: Record<string, unknown>) => ({
          ...s,
          linearPlan: s.linearPlan ?? null,
          decisionOrigin: s.decisionOrigin ?? "confirmed",
          indoorUnits: asArray(s.indoorUnits).map(
            (u: Record<string, unknown>) => ({
              ...u,
              locked: u.locked ?? false,
            }),
          ),
        }),
      ),
      plenums: asArray(old.plenums),
      pillars: asArray(old.pillars),
      ducts: asArray(old.ducts),
      fanCoils: asArray(old.fanCoils),
      hydronicSystems: asArray(old.hydronicSystems),
      radiators: asArray(old.radiators).map((d: Record<string, unknown>) => ({
        ...d,
        locked: d.locked ?? false,
      })),
      airTerminals: asArray(old.airTerminals).map(
        (t: Record<string, unknown>) => ({
          ...t,
          locked: t.locked ?? false,
          decisionOrigin:
            t.decisionOrigin ?? (t.legacyUnverified ? "manual" : "calculated"),
          style: t.style ?? "",
          color: t.color ?? "",
          finish: t.finish ?? "",
          productCode: t.productCode ?? "",
          plenumId: t.plenumId ?? null,
        }),
      ),
      projectSettings: {
        ...((old.projectSettings as Record<string, unknown>) ?? {}),
        dimensionMode:
          (old.projectSettings as Record<string, unknown> | undefined)
            ?.dimensionMode ?? "internal",
      },
    });
  }
  if (version === 3 || version === 4 || version === 5)
    return {
      ...(data as Record<string, unknown>),
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };
  if (version !== CURRENT_SCHEMA_VERSION)
    throw new Error("Migration mancante per questa versione progetto.");
  return data;
}
export function parseProject(data: unknown): Project {
  const parsed = projectSchema.safeParse(migrateProject(data));
  if (!parsed.success)
    throw new Error(
      `Progetto non valido: ${parsed.error.issues[0]?.message ?? "schema errato"}.`,
    );
  return refreshSplitBindings(
    refreshDuctedBindings(recomputeProject(parsed.data)),
  );
}
export function decodeProject(text: string): Project {
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES)
    throw new Error("Progetto troppo grande. Limite 128 MB.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Il file non contiene un progetto JSON valido.");
  }
  return parseProject(data);
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
