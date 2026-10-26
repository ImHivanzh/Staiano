import type { Point } from "@/schemas/project";
import type { PlanSegment } from "@/services/import/plan-types";
import type { WallCandidate } from "./plan-analysis";
import { distance, projection } from "./primitives";

/** Project onto the infinite axis; unlike projection(), this does not clamp. */
function relation(a: PlanSegment, b: PlanSegment) {
  const length = distance(a.start, a.end),
    span = distance(b.start, b.end);
  if (length < 1e-6 || span < 1e-6) return null;
  const ux = (a.end.x - a.start.x) / length,
    uy = (a.end.y - a.start.y) / length;
  if (
    Math.abs(((b.end.x - b.start.x) * ux + (b.end.y - b.start.y) * uy) / span) <
    0.9995
  )
    return null;
  const along = (p: Point) => (p.x - a.start.x) * ux + (p.y - a.start.y) * uy;
  const offset = (p: Point) =>
    Math.abs((p.x - a.start.x) * uy - (p.y - a.start.y) * ux);
  const from = Math.min(along(b.start), along(b.end)),
    to = Math.max(along(b.start), along(b.end));
  return {
    length,
    span,
    ux,
    uy,
    from,
    to,
    offset: Math.max(offset(b.start), offset(b.end)),
    overlap: Math.max(0, Math.min(length, to) - Math.max(0, from)),
  };
}

/** Overlapping wall envelopes represent competing interpretations, not a doorway. */
export function conflictingCandidates(a: WallCandidate, b: WallCandidate) {
  const r = relation(a, b);
  return (
    !!r &&
    r.overlap >= Math.min(r.length, r.span) * 0.6 &&
    r.offset <=
      Math.max(1.5, ((a.thicknessUnits ?? 0) + (b.thicknessUnits ?? 0)) / 2)
  );
}

/** Subtract only supported opening intervals; keep the original as an alternative. */
export function subtractWallOpenings(
  wall: WallCandidate,
  openings: { start: Point; end: Point }[],
) {
  const len = distance(wall.start, wall.end),
    ux = (wall.end.x - wall.start.x) / len,
    uy = (wall.end.y - wall.start.y) / len;
  if (len < 1e-6) return [];
  let spans = [[0, len]];
  for (const opening of openings) {
    const r = relation(wall, {
      ...wall,
      start: opening.start,
      end: opening.end,
    });
    if (
      !r ||
      r.offset > Math.max(8, (wall.thicknessUnits ?? 0) / 2) ||
      r.overlap <= 0
    )
      continue;
    spans = spans.flatMap(([from, to]) =>
      r.to <= from || r.from >= to
        ? [[from, to]]
        : [
            [from, Math.min(to, r.from)],
            [Math.max(from, r.to), to],
          ].filter(([a, b]) => b - a > 2),
    );
  }
  if (spans.length === 1 && spans[0][0] === 0 && spans[0][1] === len)
    return [wall];
  return [
    {
      ...wall,
      layer: "Contorni da verificare",
      confidence: Math.min(0.5, wall.confidence),
      reason:
        wall.reason +
        " Il tratto attraversa un varco vettoriale: interpretazione da verificare.",
    },
    ...spans.map(([from, to], i) => ({
      ...wall,
      id: `${wall.id}-part-${i}`,
      start: { x: wall.start.x + ux * from, y: wall.start.y + uy * from },
      end: { x: wall.start.x + ux * to, y: wall.start.y + uy * to },
    })),
  ];
}

/** Keep the best axis and retain incompatible nearby evidence as review-only. */
export function consolidateWallCandidates(walls: WallCandidate[]) {
  const rank = (w: WallCandidate) =>
    (w.layer === "Contorni da verificare" ? 0 : 10) +
    (w.kind === "paired-faces" ? 4 : w.kind.includes("paired") ? 2 : 0) +
    w.confidence;
  const result: WallCandidate[] = [];
  for (const original of [...walls].sort(
    (a, b) =>
      rank(b) - rank(a) || distance(b.start, b.end) - distance(a.start, a.end),
  )) {
    const w = {
      ...original,
      start: { ...original.start },
      end: { ...original.end },
    };
    const match = result.find((a) => {
      const r = relation(a, w);
      return (
        r &&
        r.from <= r.length + 1e-6 &&
        r.to >= -1e-6 &&
        r.offset <=
          Math.max(
            0.05,
            Math.min(a.thicknessUnits ?? 2, w.thicknessUnits ?? 2) * 0.15,
          ) &&
        Math.abs((a.thicknessUnits ?? 0) - (w.thicknessUnits ?? 0)) <=
          Math.max(1, (a.thicknessUnits ?? 0) * 0.25) &&
        a.layer === w.layer
      );
    });
    if (match) {
      const r = relation(match, w)!;
      const start = { ...match.start };
      match.start = {
        x: start.x + r.ux * Math.min(0, r.from),
        y: start.y + r.uy * Math.min(0, r.from),
      };
      match.end = {
        x: start.x + r.ux * Math.max(r.length, r.to),
        y: start.y + r.uy * Math.max(r.length, r.to),
      };
      continue;
    }
    if (
      w.layer !== "Contorni da verificare" &&
      result.some(
        (a) =>
          a.layer !== "Contorni da verificare" && conflictingCandidates(a, w),
      )
    ) {
      w.layer = "Contorni da verificare";
      w.confidence = Math.min(w.confidence, 0.5);
      w.reason += " Interpretazione alternativa di una parete già proposta.";
    }
    result.push(w);
  }
  return result;
}

/** A selection group follows only touching collinear intervals; gaps stay open. */
export function candidateRun(
  segments: PlanSegment[],
  id: string,
  tolerance: number,
) {
  const base = segments.find((w) => w.id === id);
  if (!base) return [];
  const found = [base],
    ids = new Set([id]);
  for (let i = 0; i < found.length; i++)
    for (const w of segments) {
      if (ids.has(w.id)) continue;
      const r = relation(base, w);
      if (!r || r.offset > tolerance) continue;
      if (
        [w.start, w.end].some((p) =>
          [found[i].start, found[i].end].some(
            (q) => distance(p, q) <= tolerance,
          ),
        )
      ) {
        ids.add(w.id);
        found.push(w);
      }
    }
  return found.map((w) => w.id);
}

export function nearestPlanSegment(
  segments: PlanSegment[],
  point: Point,
  tolerance: number,
) {
  let best: PlanSegment | undefined,
    delta = tolerance;
  for (const segment of segments) {
    const d = distance(point, projection(point, segment.start, segment.end));
    if (d < delta) {
      delta = d;
      best = segment;
    }
  }
  return best;
}

/** Clip to the recognition area before applying its local coordinate transform. */
export function clipPlanSegment(
  segment: PlanSegment,
  left: number,
  top: number,
  width: number,
  height: number,
  factor = 1,
): PlanSegment | null {
  const dx = segment.end.x - segment.start.x,
    dy = segment.end.y - segment.start.y;
  let low = 0,
    high = 1;
  for (const [p, q] of [
    [-dx, segment.start.x - left],
    [dx, left + width - segment.start.x],
    [-dy, segment.start.y - top],
    [dy, top + height - segment.start.y],
  ]) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) low = Math.max(low, t);
    else high = Math.min(high, t);
    if (low >= high) return null;
  }
  const map = (t: number) => ({
    x: (segment.start.x + dx * t - left) * factor,
    y: (segment.start.y + dy * t - top) * factor,
  });
  return {
    ...segment,
    start: map(low),
    end: map(high),
    ...(segment.pdfStyle
      ? {
          pdfStyle: {
            ...segment.pdfStyle,
            width: segment.pdfStyle.width * factor,
          },
        }
      : {}),
  };
}
