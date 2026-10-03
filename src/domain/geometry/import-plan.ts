import type { Point, Project } from "@/schemas/project";
import type { ImportedPlan, ParsedPlan } from "@/services/import/plan-types";
import { newId, recomputeProject } from "@/domain/project";

export function calibrationScale(
  a: Point,
  b: Point,
  realDistanceM: number,
): number {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  if (
    ![a.x, a.y, b.x, b.y, realDistanceM].every(Number.isFinite) ||
    distance < 1e-6 ||
    realDistanceM <= 0 ||
    realDistanceM > 1000
  )
    throw new Error(
      "Selezionare due punti distinti e una distanza reale positiva (massimo 1000 m).",
    );
  return realDistanceM / distance;
}
export function preparePlanImport(
  plan: ParsedPlan,
  options: {
    selectedLayers: string[];
    excludedIds: string[];
    metersPerUnit: number;
    thicknessM: number;
    convertGeometry: boolean;
    origin: Point;
  },
): ImportedPlan {
  const { metersPerUnit, thicknessM, origin } = options;
  if (
    ![origin.x, origin.y].every(
      (v) => Number.isFinite(v) && Math.abs(v) <= 10000,
    )
  )
    throw new Error("Origine importazione non valida.");
  if (
    !Number.isFinite(metersPerUnit) ||
    metersPerUnit <= 0 ||
    metersPerUnit > 100
  )
    throw new Error(
      "Scala non valida. Verificare unità o misura di riferimento.",
    );
  if (!Number.isFinite(thicknessM) || thicknessM < 0.01 || thicknessM > 2)
    throw new Error("Spessore muro non valido (0,01–2 m).");
  const selected = options.convertGeometry
    ? plan.segments.filter(
        (s) =>
          options.selectedLayers.includes(s.layer) &&
          !options.excludedIds.includes(s.id),
      )
    : [];
  if (options.convertGeometry && !selected.length)
    throw new Error("Selezionare almeno una geometria da convertire.");
  if (!plan.background && !selected.length)
    throw new Error("Selezionare almeno un layer muri.");
  if (selected.length > 5000)
    throw new Error(
      "Massimo 5000 muri per progetto: ridurre layer o tracciati selezionati.",
    );
  const offset = plan.background
    ? { x: 0, y: 0 }
    : {
        x: Math.min(...selected.flatMap((s) => [s.start.x, s.end.x])),
        y: Math.min(...selected.flatMap((s) => [s.start.y, s.end.y])),
      };
  const map = (p: Point): Point => ({
    x: (p.x - offset.x) * metersPerUnit + origin.x,
    y: (p.y - offset.y) * metersPerUnit + origin.y,
  });
  const keys = new Set<string>();
  const walls = selected
    .map((s) => ({ start: map(s.start), end: map(s.end) }))
    .filter((w) => {
      if (
        ![w.start.x, w.start.y, w.end.x, w.end.y].every(
          (v) => Number.isFinite(v) && Math.abs(v) <= 10000,
        )
      )
        throw new Error(
          "Coordinate fuori dai limiti del progetto. Verificare la scala.",
        );
      const a = `${w.start.x.toFixed(5)},${w.start.y.toFixed(5)}`,
        b = `${w.end.x.toFixed(5)},${w.end.y.toFixed(5)}`,
        key = [a, b].sort().join(";");
      if (
        keys.has(key) ||
        Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) < 0.001
      )
        return false;
      keys.add(key);
      return true;
    });
  const background = plan.background
    ? { ...plan.background, metersPerPixel: metersPerUnit, origin }
    : null;
  return {
    walls,
    background,
    thicknessM,
    scaleVerified: true,
    source: {
      filename: plan.filename.slice(0, 255),
      mimeType: plan.mimeType,
      sizeBytes: plan.sizeBytes,
      sourceType: plan.sourceType,
    },
  };
}
export function applyPlanImport(
  project: Project,
  floorId: string,
  plan: ImportedPlan,
): Project {
  if (!project.floors.some((f) => f.id === floorId))
    throw new Error("Piano inesistente.");
  if (project.walls.length + plan.walls.length > 5000)
    throw new Error("Il progetto supera il limite di 5000 muri.");
  if (project.sourceFilesMetadata.length >= 100)
    throw new Error(
      "Limite di 100 file sorgente raggiunto. Usare un nuovo progetto.",
    );
  const next = {
    ...project,
    floors: project.floors.map((f) =>
      f.id === floorId
        ? {
            ...f,
            background: plan.background ?? f.background,
            scaleVerified: true,
          }
        : f,
    ),
    walls: [
      ...project.walls,
      ...plan.walls.map((w) => ({
        ...w,
        id: newId(),
        floorId,
        thickness: plan.thicknessM,
        type: "INTERNO" as const,
        height: null,
      })),
    ],
    sourceFilesMetadata: [
      ...project.sourceFilesMetadata,
      {
        ...plan.source,
        id: newId(),
        floorId,
        importedAt: new Date().toISOString(),
      },
    ],
  };
  return recomputeProject(next);
}
