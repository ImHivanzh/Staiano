import type { Point } from "@/schemas/project";
import type { ParsedPlan, PlanSegment } from "@/services/import/plan-types";
import { distance, projection } from "./primitives";

export const PLAN_ANALYSIS_VERSION = "local-orthogonal-1";
export type WallCandidate = PlanSegment & {
  thicknessUnits: number | null;
  confidence: number;
  reason: string;
};
export type PlanAnalysis = {
  walls: WallCandidate[];
  openings: { start: Point; end: Point; confidence: number; reason: string }[];
  notes: string[];
};

/** Conservative local detector. Scores express heuristic evidence, not probability.
 * ponytail: orthogonal dark runs; use a dedicated recognizer for oblique or noisy scans.
 */
export function analyzeRasterPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): PlanAnalysis {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 2_000_000 ||
    pixels.length !== width * height * 4
  )
    throw new Error("Raster di analisi non valido o troppo grande.");
  const dark = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return (
      pixels[i + 3] > 100 &&
      pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722 < 135
    );
  };
  type Run = { low: number; high: number; from: number; to: number };
  const walls: WallCandidate[] = [];
  for (const horizontal of [true, false]) {
    const rows = horizontal ? height : width;
    const columns = horizontal ? width : height;
    const minimum = Math.max(24, columns * 0.035);
    let active: Run[] = [];
    const finished: Run[] = [];
    for (let row = 0; row < rows; row++) {
      const runs: { from: number; to: number }[] = [];
      let from = -1;
      for (let col = 0; col <= columns; col++) {
        const ink =
          col < columns && (horizontal ? dark(col, row) : dark(row, col));
        if (ink && from < 0) from = col;
        if (!ink && from >= 0) {
          if (col - from >= minimum) runs.push({ from, to: col - 1 });
          from = -1;
        }
      }
      const next: Run[] = [];
      const used = new Set<Run>();
      for (const run of runs) {
        const old = active.find(
          (v) =>
            !used.has(v) &&
            Math.abs(v.from - run.from) <= 3 &&
            Math.abs(v.to - run.to) <= 3,
        );
        if (old) {
          used.add(old);
          next.push({
            ...old,
            high: row,
            from: Math.min(old.from, run.from),
            to: Math.max(old.to, run.to),
          });
        } else next.push({ low: row, high: row, ...run });
      }
      finished.push(...active.filter((v) => !used.has(v)));
      active = next;
    }
    finished.push(...active);
    for (const run of finished) {
      const thickness = run.high - run.low + 1;
      const length = run.to - run.from;
      if (
        thickness < 2 ||
        thickness > Math.min(width, height) * 0.06 ||
        length < thickness * 4
      )
        continue;
      const axis = (run.low + run.high) / 2;
      const point = (v: number): Point =>
        horizontal ? { x: v, y: axis } : { x: axis, y: v };
      walls.push({
        id: `raster-${walls.length}`,
        layer: "Muri riconosciuti",
        kind: "raster-axis",
        start: point(run.from),
        end: point(run.to),
        thicknessUnits: thickness,
        confidence: 0.65,
        reason:
          "Tratto scuro ortogonale continuo; spessore misurato nel raster.",
      });
      if (walls.length > 2000)
        throw new Error(
          "Troppi candidati raster: usare una planimetria più pulita.",
        );
    }
  }
  // Thick strokes overlap at corners. Intersect centre lines instead of leaving
  // disconnected endpoints at the exterior pixel faces.
  for (const a of walls) {
    const horizontal = Math.abs(a.start.y - a.end.y) < 1e-6;
    for (const key of ["start", "end"] as const) {
      const end = a[key];
      const hits = walls
        .filter(
          (b) => b !== a && Math.abs(b.start.y - b.end.y) < 1e-6 !== horizontal,
        )
        .map((b) => ({
          b,
          p: horizontal
            ? { x: b.start.x, y: end.y }
            : { x: end.x, y: b.start.y },
        }))
        .filter(
          ({ b, p }) =>
            distance(end, p) <=
              Math.max(a.thicknessUnits!, b.thicknessUnits!) * 1.5 &&
            distance(p, projection(p, b.start, b.end)) <=
              a.thicknessUnits! * 1.5,
        )
        .sort((x, y) => distance(end, x.p) - distance(end, y.p));
      if (hits[0]) a[key] = hits[0].p;
    }
  }
  for (const a of walls) {
    const joined = [a.start, a.end].every((end) =>
      walls.some(
        (b) => b !== a && distance(end, projection(end, b.start, b.end)) < 0.5,
      ),
    );
    if (joined && a.thicknessUnits! >= 3) {
      a.confidence = 0.92;
      a.reason += " Entrambi gli estremi collegati ad altri muri.";
    }
  }
  const openings: PlanAnalysis["openings"] = [];
  // Gaps in collinear strokes are proposals only. Never infer door/window type
  // or a vertical dimension from a 2D image.
  const originalWalls = [...walls];
  for (let i = 0; i < originalWalls.length; i++)
    for (let j = i + 1; j < originalWalls.length; j++) {
      const a = originalWalls[i],
        b = originalWalls[j];
      const horizontal = a.start.y === a.end.y;
      if (horizontal !== (b.start.y === b.end.y)) continue;
      if (
        Math.abs(horizontal ? a.start.y - b.start.y : a.start.x - b.start.x) >
        1.5
      )
        continue;
      const pairs = [a.start, a.end]
        .flatMap((start) => [b.start, b.end].map((end) => ({ start, end })))
        .sort((x, y) => distance(x.start, x.end) - distance(y.start, y.end));
      const gap = pairs[0],
        length = distance(gap.start, gap.end);
      if (
        length < Math.max(a.thicknessUnits!, b.thicknessUnits!) * 2 ||
        length > Math.min(width, height) * 0.13
      )
        continue;
      if (
        distance(gap.start, projection(gap.start, b.start, b.end)) < 1 ||
        distance(gap.end, projection(gap.end, a.start, a.end)) < 1
      )
        continue;
      const reason =
        "Interruzione tra tratti allineati: apertura possibile, tipo e quote da confermare.";
      openings.push({ ...gap, confidence: 0.5, reason });
      walls.push({
        ...a,
        ...gap,
        id: `gap-${openings.length}`,
        confidence: 0.55,
        reason,
      });
    }
  return {
    walls,
    openings,
    notes: [
      "Analisi locale euristica di muri ortogonali. Testi, retini, linee sottili e muri obliqui possono non essere riconosciuti.",
      "Affidabilità alta ≥0,90; media ≥0,50 richiede conferma; bassa richiede disegno manuale. Nessuna probabilità certificata.",
      "Scala, aperture, altezze e destinazioni d’uso devono essere verificate dall’operatore.",
      ...(walls.length
        ? []
        : [
            "Nessun muro affidabile riconosciuto: utilizzare l’editor manuale.",
          ]),
    ],
  };
}

/** Vector lines: pair parallel faces; unclassified CAD axes stay operator choices. */
export function analyzeVectorPlan(plan: ParsedPlan): PlanAnalysis {
  const walls: WallCandidate[] = [];
  const used = new Set<string>();
  const unit = plan.suggestedMetersPerUnit;
  const segments = plan.segments.filter((s) => distance(s.start, s.end) > 1e-6);
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
  for (const a of segments) {
    if (used.has(a.id)) continue;
    const len = distance(a.start, a.end);
    const d = {
      x: (a.end.x - a.start.x) / len,
      y: (a.end.y - a.start.y) / len,
    };
    const pair = segments
      .filter((b) => b !== a && !used.has(b.id) && b.layer === a.layer)
      .map((b) => {
        const length = distance(b.start, b.end);
        const dot =
          ((b.end.x - b.start.x) * d.x + (b.end.y - b.start.y) * d.y) / length;
        const thickness = Math.abs(
          (b.start.x - a.start.x) * d.y - (b.start.y - a.start.y) * d.x,
        );
        const ends = dot > 0 ? [b.start, b.end] : [b.end, b.start];
        const aligned =
          Math.abs(
            (ends[0].x - a.start.x) * d.x + (ends[0].y - a.start.y) * d.y,
          ) <
            len * 0.05 &&
          Math.abs((ends[1].x - a.end.x) * d.x + (ends[1].y - a.end.y) * d.y) <
            len * 0.05;
        return { b, dot, thickness, ends, aligned };
      })
      .filter(
        (v) =>
          Math.abs(v.dot) > 0.999 &&
          v.aligned &&
          v.thickness > len * 0.005 &&
          v.thickness < len * 0.12 &&
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
      walls.push({
        ...a,
        id: `paired-${a.id}`,
        start: mid(a.start, pair.ends[0]),
        end: mid(a.end, pair.ends[1]),
        layer: "Muri riconosciuti",
        kind: "paired-faces",
        thicknessUnits: pair.thickness,
        confidence: 0.7,
        reason:
          "Due facce parallele nello stesso layer: asse e spessore proposti, verificare giunzioni.",
      });
    } else if (
      /wall|mur[oi]|paret/i.test(a.layer) ||
      [a.start, a.end].every((p) =>
        segments.some(
          (b) =>
            b.id !== a.id &&
            [b.start, b.end].some((q) => distance(p, q) < len * 0.0001),
        ),
      )
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
  return {
    walls,
    openings: [],
    notes: [
      "CAD/PDF: coppie di facce e nomi layer producono suggerimenti, non una certificazione del disegno.",
      "Porte, finestre e giunzioni ambigue richiedono verifica manuale; tracciati originali sempre selezionabili.",
    ],
  };
}
