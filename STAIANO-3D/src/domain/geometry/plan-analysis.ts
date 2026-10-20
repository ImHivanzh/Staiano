import type { Point } from "@/schemas/project";
import type { ParsedPlan, PlanSegment } from "@/services/import/plan-types";
import { distance, projection, lineIntersection } from "./primitives";

export const PLAN_ANALYSIS_VERSION = "local-lines-6";
export type WallCandidate = PlanSegment & {
  thicknessUnits: number | null;
  confidence: number;
  reason: string;
};
export type PlanAnalysis = {
  reconstructed?: boolean;
  roomsDetected?: number;
  imageWalls?: WallCandidate[];
  walls: WallCandidate[];
  openings: {
    start: Point;
    end: Point;
    confidence: number;
    reason: string;
    type?: "door" | "window";
    wallCandidateId?: string;
  }[];
  notes: string[];
};

export { recognizeRaster as analyzeRasterPixels } from "./raster-lines";

/** Vector lines: pair parallel faces; unclassified CAD axes stay operator choices. */
export function analyzeVectorPlan(plan: ParsedPlan): PlanAnalysis {
  const walls: WallCandidate[] = [];
  const used = new Set<string>();
  const unit = plan.suggestedMetersPerUnit;
  const segments = plan.segments
    .filter(
      (s) =>
        [s.start.x, s.start.y, s.end.x, s.end.y].every(Number.isFinite) &&
        distance(s.start, s.end) > 1e-6 &&
        !/quot[ae]|dimension|(^|[-_ ])dim($|[-_ ])|test[oi]|text|hatch|retin|arred|furnitur|grid/i.test(
          s.layer,
        ),
    )
    .sort((a, b) => distance(b.start, b.end) - distance(a.start, a.end));
  // Avoid a quadratic scan on huge CAD corpora. The existing layer selection
  // remains available without silently truncating the geometry.
  if (segments.length > 3000)
    return {
      walls: [],
      openings: [],
      notes: [
        "Oltre 3000 tracciati: selezionare i layer e gli assi manualmente; analisi automatica non applicata.",
      ],
    };
  const remaining = [...segments];
  const originalIds = new Set(segments.map((s) => s.id));
  for (let index = 0; index < remaining.length; index++) {
    if (remaining.length > 6000)
      return {
        walls: [],
        openings: [],
        notes: ["Troppe facce parziali: selezionare gli assi manualmente."],
      };
    const a = remaining[index];
    if (used.has(a.id)) continue;
    const len = distance(a.start, a.end);
    const d = {
      x: (a.end.x - a.start.x) / len,
      y: (a.end.y - a.start.y) / len,
    };
    const pair = remaining
      .filter((b) => b !== a && !used.has(b.id) && b.layer === a.layer)
      .map((b) => {
        const length = distance(b.start, b.end);
        const dot =
          ((b.end.x - b.start.x) * d.x + (b.end.y - b.start.y) * d.y) / length;
        const thickness = Math.abs(
          (b.start.x - a.start.x) * d.y - (b.start.y - a.start.y) * d.x,
        );
        const ends = dot > 0 ? [b.start, b.end] : [b.end, b.start];
        const from =
          (ends[0].x - a.start.x) * d.x + (ends[0].y - a.start.y) * d.y;
        const to =
          (ends[1].x - a.start.x) * d.x + (ends[1].y - a.start.y) * d.y;
        const overlap = Math.max(0, Math.min(len, to) - Math.max(0, from));
        const farThickness = Math.abs(
          (b.end.x - a.start.x) * d.y - (b.end.y - a.start.y) * d.x,
        );
        return {
          b,
          dot,
          thickness,
          ends,
          from,
          to,
          overlap,
          farThickness,
          length,
        };
      })
      .filter(
        (v) =>
          Math.abs(v.dot) > 0.9999 &&
          Math.abs(v.farThickness - v.thickness) <
            Math.max(1e-6, v.thickness * 0.02) &&
          v.overlap >= Math.min(len, v.length) * 0.8 &&
          v.thickness >
            (unit ? 0.04 / unit : Math.min(len, v.length) * 0.005) &&
          v.thickness < v.overlap * 0.2 &&
          (!unit || (v.thickness * unit >= 0.04 && v.thickness * unit <= 0.8)),
      )
      .sort((x, y) => x.thickness - y.thickness)[0];
    if (pair) {
      used.add(a.id);
      used.add(pair.b.id);
      const mid = (p: Point, q: Point) => ({
        x: (p.x + q.x) / 2,
        y: (p.y + q.y) / 2,
      });
      const start = {
        x: a.start.x + d.x * Math.max(0, pair.from),
        y: a.start.y + d.y * Math.max(0, pair.from),
      };
      const end = {
        x: a.start.x + d.x * Math.min(len, pair.to),
        y: a.start.y + d.y * Math.min(len, pair.to),
      };
      const start2 = projection(start, pair.b.start, pair.b.end),
        end2 = projection(end, pair.b.start, pair.b.end);
      for (const [s, p, q] of [
        [a, a.start, start],
        [a, end, a.end],
        [pair.b, pair.ends[0], start2],
        [pair.b, end2, pair.ends[1]],
      ] as [PlanSegment, Point, Point][]) {
        if (
          distance(p, q) >
          Math.max(pair.thickness * 2, unit ? 0.3 / unit : len * 0.01)
        )
          remaining.push({
            ...s,
            id: `remainder-${remaining.length}`,
            start: p,
            end: q,
          });
      }
      walls.push({
        ...a,
        id: `paired-${a.id}`,
        start: mid(start, start2),
        end: mid(end, end2),
        layer: "Muri riconosciuti",
        kind: "paired-faces",
        thicknessUnits: pair.thickness,
        confidence: 0.7,
        reason:
          "Due facce parallele nello stesso layer: asse e spessore proposti, verificare giunzioni.",
      });
    } else if (
      originalIds.has(a.id) &&
      (/wall|mur[oi]|paret/i.test(a.layer) ||
        [a.start, a.end].every((p) =>
          segments.some(
            (b) =>
              b.id !== a.id &&
              [b.start, b.end].some((q) => distance(p, q) < len * 0.0001),
          ),
        ))
    ) {
      used.add(a.id);
      walls.push({
        ...a,
        id: `axis-${a.id}`,
        layer: "Muri riconosciuti",
        thicknessUnits: null,
        confidence: 0.6,
        reason:
          "Layer di muro o contorno vettoriale chiuso; interpretazione dell’asse e spessore da verificare.",
      });
    }
  }
  // Only measured face pairs are joined; CAD axes keep their original exact
  // endpoints. Local intersections cannot bridge an opening-sized gap.
  for (const a of walls.filter((w) => w.thicknessUnits !== null))
    for (const key of ["start", "end"] as const) {
      const tolerance = a.thicknessUnits! * 0.8;
      const hits = walls
        .filter((b) => b !== a && b.thicknessUnits !== null)
        .map((b) => ({
          b,
          p: lineIntersection(a.start, a.end, b.start, b.end),
        }))
        .filter(
          (v): v is { b: WallCandidate; p: Point } =>
            v.p !== null &&
            distance(a[key], v.p) <= tolerance &&
            distance(v.p, projection(v.p, v.b.start, v.b.end)) <=
              v.b.thicknessUnits! * 0.8,
        )
        .sort((x, y) => distance(a[key], x.p) - distance(a[key], y.p));
      if (hits[0]) a[key] = hits[0].p;
    }
  return {
    walls,
    openings: [],
    notes: [
      "CAD/PDF: coppie di facce e nomi layer producono suggerimenti, non una certificazione del disegno.",
      "Porte, finestre e giunzioni ambigue richiedono verifica manuale; tracciati originali sempre selezionabili.",
    ],
  };
}
