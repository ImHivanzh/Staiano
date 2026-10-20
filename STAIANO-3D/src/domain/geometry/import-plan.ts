import type { Point, Project } from "@/schemas/project";
import type { ImportedPlan, ParsedPlan } from "@/services/import/plan-types";
import { newId, recomputeProject } from "@/domain/project";
import { PLAN_ANALYSIS_VERSION } from "./plan-analysis";
import { distance, projection } from "./primitives";
import { saveOpening } from "./openings";

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
    .map((s) => {
      const candidate = plan.analysis?.walls.find((w) => w.id === s.id);
      return {
        start: map(s.start),
        end: map(s.end),
        ...(candidate
          ? {
              thickness:
                candidate.thicknessUnits === null
                  ? thicknessM
                  : Math.max(
                      0.01,
                      Math.min(2, candidate.thicknessUnits * metersPerUnit),
                    ),
              recognition: {
                confidence: candidate.confidence,
                origin:
                  candidate.confidence >= 0.9
                    ? ("calculated" as const)
                    : ("confirmed" as const),
                reason: candidate.reason,
              },
            }
          : {}),
      };
    })
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
    openings: (plan.analysis?.openings ?? []).flatMap((opening) => {
      if (!opening.type || !opening.wallCandidateId) return [];
      const candidate = selected.find(
        (wall) => wall.id === opening.wallCandidateId,
      );
      if (!candidate) return [];
      const start = map(candidate.start),
        end = map(candidate.end);
      const wallIndex = walls.findIndex(
        (wall) =>
          distance(wall.start, start) < 1e-5 && distance(wall.end, end) < 1e-5,
      );
      if (wallIndex < 0) return [];
      const a = distance(start, projection(map(opening.start), start, end));
      const b = distance(start, projection(map(opening.end), start, end));
      return Math.abs(b - a) >= 0.05
        ? [
            {
              wallIndex,
              type: opening.type,
              offsetM: Math.min(a, b),
              widthM: Math.abs(b - a),
            },
          ]
        : [];
    }),
    background,
    thicknessM,
    scaleVerified: true,
    source: {
      filename: plan.filename.slice(0, 255),
      mimeType: plan.mimeType,
      sizeBytes: plan.sizeBytes,
      sourceType: plan.sourceType,
      ...(plan.originalDataUrl
        ? { originalDataUrl: plan.originalDataUrl }
        : {}),
    },
    analysis: {
      algorithmVersion: plan.analysis?.reconstructed
        ? `${PLAN_ANALYSIS_VERSION}+raster2seq`
        : PLAN_ANALYSIS_VERSION,
      analyzedAt: new Date().toISOString(),
      sourceType: plan.sourceType,
      scaleConfidence: "high",
      wallCandidates: plan.analysis?.walls.length ?? 0,
      wallsAutoCreated: walls.filter(
        (w) => w.recognition?.origin === "calculated",
      ).length,
      wallsConfirmedByOperator: walls.filter(
        (w) => w.recognition?.origin === "confirmed",
      ).length,
      wallsManual: walls.filter((w) => !w.recognition).length,
      roomsDetected: 0,
      openingsDetected: plan.analysis?.openings.length ?? 0,
      notes: (
        plan.analysis?.notes ?? ["Tracciati selezionati manualmente."]
      ).slice(0, 50),
      candidates: plan.analysis?.walls.map((w) => ({
        id: w.id,
        start: map(w.start),
        end: map(w.end),
        thicknessM:
          w.thicknessUnits === null ? null : w.thicknessUnits * metersPerUnit,
        confidence: w.confidence,
        reason: w.reason,
        status: selected.some((s) => s.id === w.id)
          ? w.confidence >= 0.9
            ? ("automatic" as const)
            : ("confirmed" as const)
          : ("rejected" as const),
      })),
      openingCandidates: plan.analysis?.openings.map((o) => ({
        ...o,
        start: map(o.start),
        end: map(o.end),
      })),
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
  const importedWalls = plan.walls.map((w) => ({
    ...w,
    id: newId(),
    floorId,
    thickness: w.thickness ?? plan.thicknessM,
    type: "INTERNO" as const,
    height: null,
    locked: false,
  }));
  const next = {
    ...project,
    floors: project.floors.map((f) =>
      f.id === floorId
        ? {
            ...f,
            background: plan.background ?? f.background,
            scaleVerified: true,
            importAnalysis: plan.analysis ?? null,
            configurationWizard: {
              step: 0,
              confirmedSteps: [],
              status: "active" as const,
            },
          }
        : f,
    ),
    walls: [...project.walls, ...importedWalls],
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
  let computed = recomputeProject(next);
  for (const opening of plan.openings ?? []) {
    const wall = importedWalls[opening.wallIndex];
    if (!wall) continue;
    const height = computed.projectSettings.defaultHeightM;
    const sillHeightM =
      opening.type === "window" ? Math.min(0.9, height / 3) : 0;
    try {
      computed = saveOpening(computed, wall.id, {
        type: opening.type,
        offsetM: opening.offsetM,
        widthM: opening.widthM,
        heightM: Math.min(
          opening.type === "door" ? 2.1 : 1.2,
          height - sillHeightM,
        ),
        sillHeightM,
      });
    } catch {
      computed.floors
        .find((floor) => floor.id === floorId)
        ?.importAnalysis?.notes.push(
          "Una proposta di apertura non compatibile con la parete è stata esclusa; verificarla nell’editor 2D.",
        );
    }
  }
  const floor = computed.floors.find((f) => f.id === floorId)!;
  if (floor.importAnalysis)
    floor.importAnalysis.roomsDetected = computed.rooms.filter(
      (r) => r.floorId === floorId && r.geometryStatus === "closed",
    ).length;
  return computed;
}
