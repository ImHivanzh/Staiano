import type { Point } from "@/schemas/project";
import type { ParsedPlan, PlanSegment } from "@/services/import/plan-types";
import { distance, projection, lineIntersection } from "./primitives";
import { pdfWallSegments } from "./pdf-wall-segments";
import { consolidateWallCandidates } from "./plan-candidates";

export const PLAN_ANALYSIS_VERSION = "local-lines-9";
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
  const unit = plan.analysisMetersPerUnit ?? plan.suggestedMetersPerUnit;
  const segments = pdfWallSegments(plan)
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
          v.thickness < v.overlap * (plan.sourceType === "pdf" ? 0.65 : 0.2) &&
          (plan.sourceType !== "pdf" ||
            v.thickness >=
              ((a.pdfStyle?.width ?? 0) + (v.b.pdfStyle?.width ?? 0)) * 0.7) &&
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
        layer:
          plan.sourceType === "pdf"
            ? "Contorni da verificare"
            : "Muri riconosciuti",
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
  const openings: PlanAnalysis["openings"] = [];
  if (plan.sourceType === "pdf")
    for (const wall of walls.filter(
      (w) =>
        w.kind === "paired-faces" &&
        w.thicknessUnits !== null &&
        w.layer !== "Contorni da verificare",
    )) {
      const len = distance(wall.start, wall.end),
        ux = (wall.end.x - wall.start.x) / len,
        uy = (wall.end.y - wall.start.y) / len;
      if (len < Math.max(48, wall.thicknessUnits! * 3)) continue;
      const along = (p: Point) =>
        (p.x - wall.start.x) * ux + (p.y - wall.start.y) * uy;
      const intervals = segments
        .flatMap((s) => {
          const span = distance(s.start, s.end);
          if (
            span < 12 ||
            (s.pdfStyle?.width ?? 0) < (wall.pdfStyle?.width ?? 0) * 0.8 ||
            Math.abs(
              ((s.end.x - s.start.x) * ux + (s.end.y - s.start.y) * uy) / span,
            ) < 0.9995
          )
            return [];
          if (
            [s.start, s.end].some(
              (p) =>
                Math.abs(
                  (p.x - wall.start.x) * uy - (p.y - wall.start.y) * ux,
                ) >
                wall.thicknessUnits! * 0.7,
            )
          )
            return [];
          return [
            [
              Math.min(along(s.start), along(s.end)),
              Math.max(along(s.start), along(s.end)),
            ],
          ];
        })
        .sort((a, b) => a[0] - b[0]);
      const merged: number[][] = [];
      for (const interval of intervals) {
        const previous = merged.at(-1);
        if (previous && interval[0] <= previous[1] + 1)
          previous[1] = Math.max(previous[1], interval[1]);
        else merged.push(interval);
      }
      for (let i = 1; i < merged.length; i++) {
        const from = merged[i - 1][1],
          to = merged[i][0],
          gap = to - from;
        if (
          gap < Math.max(6, wall.thicknessUnits! * 0.8) ||
          gap > (unit ? 4 / unit : 400)
        )
          continue;
        const point = (t: number) => ({
          x: wall.start.x + ux * t,
          y: wall.start.y + uy * t,
        });
        const start = point(from),
          end = point(to),
          mid = point((from + to) / 2);
        if (
          openings.some(
            (o) =>
              distance(mid, {
                x: (o.start.x + o.end.x) / 2,
                y: (o.start.y + o.end.y) / 2,
              }) < Math.max(4, wall.thicknessUnits!),
          )
        )
          continue;
        openings.push({
          start,
          end,
          confidence: 0.5,
          reason:
            "Varco fra tratti murari vettoriali: verificare porta o finestra, larghezza e quote verticali.",
        });
      }
    }
  if (plan.sourceType === "pdf")
    for (const wall of walls.filter(
      (w) => w.kind === "paired-faces" && w.thicknessUnits !== null,
    )) {
      const len = distance(wall.start, wall.end);
      const neighbors = walls.filter(
        (other) =>
          other !== wall &&
          other.thicknessUnits !== null &&
          other.thicknessUnits > wall.thicknessUnits! * 2.5 &&
          Math.abs(
            ((wall.end.x - wall.start.x) * (other.end.x - other.start.x) +
              (wall.end.y - wall.start.y) * (other.end.y - other.start.y)) /
              (len * distance(other.start, other.end)),
          ) > 0.9995,
      );
      if (
        [wall.start, wall.end].every((p) =>
          neighbors.some((n) =>
            [n.start, n.end].some(
              (q) => distance(p, q) <= n.thicknessUnits! * 0.8,
            ),
          ),
        )
      ) {
        wall.layer = "Contorni da verificare";
        wall.confidence = 0.5;
        wall.reason =
          "Tratto sottile fra due pareti più spesse: possibile serramento, verificare prima di includerlo come muro.";
        openings.push({
          start: wall.start,
          end: wall.end,
          confidence: 0.5,
          type: "window",
          reason:
            "Possibile serramento fra due tratti murari: tipo e quote da verificare.",
        });
      }
    }
  return {
    walls:
      plan.sourceType === "pdf"
        ? consolidateWallCandidates(walls)
        : [
            ...consolidateWallCandidates(
              walls.filter((w) => w.thicknessUnits !== null),
            ),
            ...walls.filter((w) => w.thicknessUnits === null),
          ],
    openings,
    notes: [
      "CAD/PDF: coppie di facce e nomi layer producono suggerimenti, non una certificazione del disegno.",
      "Porte, finestre e giunzioni ambigue richiedono verifica manuale; tracciati originali sempre selezionabili.",
    ],
  };
}
