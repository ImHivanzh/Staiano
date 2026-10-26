import type { Point } from "@/schemas/project";
import { distance, lineIntersection, projection } from "./primitives";
import type { PlanAnalysis, WallCandidate } from "./plan-analysis";
import { consolidateWallCandidates } from "./plan-candidates";

type Stroke = {
  start: Point;
  end: Point;
  width: number;
  ink: number;
  oblique?: boolean;
};

/** Keep thick heuristic strokes only beside the semantic wall evidence. */
function nearSemanticMask(
  wall: WallCandidate,
  mask: Uint8Array,
  width: number,
  height: number,
) {
  const radius = Math.ceil(
    Math.min(24, Math.max(8, (wall.thicknessUnits ?? 0) * 1.5)),
  );
  let hits = 0;
  let first = false,
    last = false;
  samples: for (let step = 0; step <= 20; step++) {
    const x = Math.round(
        wall.start.x + ((wall.end.x - wall.start.x) * step) / 20,
      ),
      y = Math.round(wall.start.y + ((wall.end.y - wall.start.y) * step) / 20);
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const px = x + dx,
          py = y + dy;
        if (
          px >= 0 &&
          px < width &&
          py >= 0 &&
          py < height &&
          mask[py * width + px]
        ) {
          hits++;
          if (step <= 2) first = true;
          if (step >= 18) last = true;
          continue samples;
        }
      }
  }
  // A single contact with a wall does not make a dimension line structural.
  return hits >= 9 || (first && last);
}

function connectLocalJunctions(walls: WallCandidate[]) {
  // Connect only local junctions. Never fill a door-sized gap automatically.
  for (const a of walls)
    for (const key of ["start", "end"] as const) {
      const hits = walls
        .filter((b) => b !== a)
        .map((b) => ({
          b,
          p: lineIntersection(a.start, a.end, b.start, b.end),
        }))
        .filter(
          (v): v is { b: WallCandidate; p: Point } =>
            v.p !== null &&
            distance(a[key], v.p) <=
              Math.max(
                6,
                Math.min(
                  20,
                  Math.max(a.thicknessUnits ?? 2, v.b.thicknessUnits ?? 2) *
                    1.2,
                ),
              ) &&
            distance(v.p, projection(v.p, v.b.start, v.b.end)) <=
              Math.max(6, Math.min(20, (a.thicknessUnits ?? 2) * 1.2)),
        )
        .sort((x, y) => distance(a[key], x.p) - distance(a[key], y.p));
      if (hits[0]) a[key] = hits[0].p;
    }
}

/** Local line evidence, not semantic segmentation. Thin outlines stay reviewable.
 * ponytail: straight walls only; curved walls need a dedicated segmenter.
 */
export function recognizeRaster(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  grayFills = true,
  semanticMask?: Uint8Array,
  options: { referenceSize?: number; metersPerUnit?: number } = {},
): PlanAnalysis {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 2200 ||
    height > 2200 ||
    width * height > 5_000_000 ||
    pixels.length !== width * height * 4 ||
    (semanticMask !== undefined && semanticMask.length !== width * height)
  )
    throw new Error("Raster di analisi non valido o troppo grande.");
  const semantic = semanticMask !== undefined;
  const referenceSize = options.referenceSize ?? Math.min(width, height);
  const size = width * height;
  const gray = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const alpha = pixels[i * 4 + 3] / 255;
    gray[i] = Math.round(
      255 * (1 - alpha) +
        alpha *
          (pixels[i * 4] * 0.2126 +
            pixels[i * 4 + 1] * 0.7152 +
            pixels[i * 4 + 2] * 0.0722),
    );
  }
  const mask = new Uint8Array(size);
  const fillRadius = Math.max(6, Math.round(referenceSize * 0.08));
  let fillsAdded = false;
  if (semanticMask) {
    for (let i = 0; i < size; i++) mask[i] = semanticMask[i] ? 1 : 0;
  } else
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x,
          value = gray[i];
        // Keep dark fills, and light ink with local contrast. Flat gray room fills
        // are not walls. Composite transparency onto white before thresholding.
        const local = Math.max(
          gray[y * width + Math.max(0, x - 3)],
          gray[y * width + Math.min(width - 1, x + 3)],
          gray[Math.max(0, y - 3) * width + x],
          gray[Math.min(height - 1, y + 3) * width + x],
        );
        const neutral =
          Math.max(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]) -
            Math.min(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]) <
          24;
        const narrowFill =
          grayFills &&
          value < 230 &&
          neutral &&
          (Math.min(
            gray[y * width + Math.max(0, x - fillRadius)],
            gray[y * width + Math.min(width - 1, x + fillRadius)],
          ) -
            value >=
            20 ||
            Math.min(
              gray[Math.max(0, y - fillRadius) * width + x],
              gray[Math.min(height - 1, y + fillRadius) * width + x],
            ) -
              value >=
              20);
        if (narrowFill && value >= 110 && !(value < 247 && local - value >= 8))
          fillsAdded = true;
        mask[i] =
          value < 110 || narrowFill || (value < 247 && local - value >= 8)
            ? 1
            : 0;
      }
  const minimum =
    options.metersPerUnit && options.metersPerUnit > 0
      ? Math.max(8, 0.25 / options.metersPerUnit)
      : Math.max(
          18,
          (options.referenceSize ?? Math.min(width, height)) * 0.025,
        );
  const at = (x: number, y: number) => {
    x = Math.round(x);
    y = Math.round(y);
    return x >= 0 && x < width && y >= 0 && y < height
      ? mask[y * width + x]
      : 0;
  };
  const strokes: Stroke[] = [];
  // Scan the principal directions without quantizing their coordinates.
  // Small gaps tolerate compression; a run still needs >=85% actual ink.
  for (const horizontal of [true, false]) {
    type Run = {
      from: number;
      to: number;
      low: number;
      high: number;
      ink: number;
    };
    const rows = horizontal ? height : width,
      columns = horizontal ? width : height;
    let active: Run[] = [];
    const finished: Run[] = [];
    for (let row = 0; row < rows; row++) {
      const runs: Run[] = [];
      let from = -1,
        last = -1,
        ink = 0;
      for (let col = 0; col <= columns + 3; col++) {
        const hit = col < columns && (horizontal ? at(col, row) : at(row, col));
        if (hit) {
          if (from < 0) from = col;
          last = col;
          ink++;
        } else if (from >= 0 && col - last > 3) {
          if (last - from + 1 >= minimum && ink / (last - from + 1) >= 0.85)
            runs.push({
              from,
              to: last,
              low: row,
              high: row,
              ink: ink / (last - from + 1),
            });
          from = -1;
          ink = 0;
        }
      }
      const used = new Set<Run>();
      const next = runs.map((run) => {
        const old = active.find(
          (v) =>
            !used.has(v) &&
            Math.abs(v.from - run.from) <= 4 &&
            Math.abs(v.to - run.to) <= 4,
        );
        if (!old) return run;
        used.add(old);
        return {
          ...old,
          high: row,
          from: Math.min(old.from, run.from),
          to: Math.max(old.to, run.to),
          ink: Math.min(old.ink, run.ink),
        };
      });
      finished.push(...active.filter((v) => !used.has(v)));
      active = next;
    }
    finished.push(...active);
    for (const run of finished) {
      const thickness = run.high - run.low + 1,
        length = run.to - run.from;
      if (thickness > referenceSize * 0.1 || length < thickness * 4) continue;
      const axis = (run.low + run.high) / 2;
      const point = (v: number) =>
        horizontal ? { x: v, y: axis } : { x: axis, y: v };
      strokes.push({
        start: point(run.from),
        end: point(run.to),
        width: thickness,
        ink: run.ink,
      });
    }
  }
  const denseResult: PlanAnalysis = {
    walls: [],
    openings: [],
    notes: [
      "Disegno troppo denso: selezionare una sola planimetria nell’area da riconoscere.",
    ],
  };
  if (strokes.length > 3000) return denseResult;
  // Hough votes are used only for oblique directions. Fit supported pixels back
  // to a line so rotated scans do not inherit the angle-bin error.
  const edgePoints: Point[] = [];
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (
        mask[i] &&
        (!mask[i - 1] || !mask[i + 1] || !mask[i - width] || !mask[i + width])
      )
        edgePoints.push({ x, y });
      if (edgePoints.length > 150000) return denseResult;
    }
  const sampleStep = Math.max(1, Math.ceil(edgePoints.length / 20000));
  const radius = Math.ceil(Math.hypot(width, height) / 3),
    bins = radius * 2 + 1;
  const peaks: { angle: number; rho: number; votes: number }[] = [];
  for (let degrees = 1; degrees < 180; degrees++) {
    if (degrees === 90) continue;
    const angle = (degrees * Math.PI) / 180,
      c = Math.cos(angle),
      s = Math.sin(angle);
    const votes = new Uint16Array(bins);
    for (let i = 0; i < edgePoints.length; i += sampleStep) {
      const p = edgePoints[i];
      votes[Math.round((p.x * c + p.y * s) / 3) + radius]++;
    }
    for (let r = 1; r < bins - 1; r++) {
      if (
        votes[r] >= Math.max(8, (minimum * 0.65) / sampleStep) &&
        votes[r] >= votes[r - 1] &&
        votes[r] > votes[r + 1]
      )
        peaks.push({ angle, rho: (r - radius) * 3, votes: votes[r] });
    }
  }
  const chosen: typeof peaks = [];
  for (const peak of peaks.sort((a, b) => b.votes - a.votes)) {
    if (
      chosen.some(
        (p) =>
          Math.abs(p.angle - peak.angle) < 0.07 &&
          Math.abs(
            p.rho -
              (width / 2) * Math.cos(p.angle) -
              (height / 2) * Math.sin(p.angle) -
              (peak.rho -
                (width / 2) * Math.cos(peak.angle) -
                (height / 2) * Math.sin(peak.angle)),
          ) < 8,
      )
    )
      continue;
    chosen.push(peak);
    if (chosen.length >= 96) break;
  }
  for (const peak of chosen) {
    let c = Math.cos(peak.angle),
      s = Math.sin(peak.angle);
    const near = edgePoints
      .filter((p) => Math.abs(p.x * c + p.y * s - peak.rho) <= 2.5)
      .sort((a, b) => -a.x * s + a.y * c - (-b.x * s + b.y * c));
    // Fit each continuous group independently. Isolated scan noise far along
    // the same Hough line must not rotate the regression of a real wall.
    const groups: Point[][] = [];
    for (const p of near) {
      const group = groups[groups.length - 1];
      const previous = group?.[group.length - 1];
      if (
        !previous ||
        Math.abs((p.x - previous.x) * -s + (p.y - previous.y) * c) > 4
      )
        groups.push([p]);
      else group.push(p);
    }
    for (const support of groups) {
      if (support.length < minimum) continue;
      const mx = support.reduce((sum, p) => sum + p.x, 0) / support.length;
      const my = support.reduce((sum, p) => sum + p.y, 0) / support.length;
      let xx = 0,
        xy = 0,
        yy = 0;
      for (const p of support) {
        xx += (p.x - mx) ** 2;
        xy += (p.x - mx) * (p.y - my);
        yy += (p.y - my) ** 2;
      }
      const angle = Math.atan2(2 * xy, xx - yy) / 2;
      const dx = Math.cos(angle),
        dy = Math.sin(angle);
      if (Math.min(Math.abs(dx), Math.abs(dy)) < 0.015) continue;
      c = -dy;
      s = dx;
      const coordinates = support.map((p) => (p.x - mx) * dx + (p.y - my) * dy);
      const low = Math.floor(
          coordinates.reduce((a, b) => Math.min(a, b), Infinity),
        ),
        high = Math.ceil(
          coordinates.reduce((a, b) => Math.max(a, b), -Infinity),
        );
      let from = NaN,
        last = low,
        count = 0;
      for (let t = low; t <= high + 4; t++) {
        const x = mx + t * dx,
          y = my + t * dy;
        // A diagonal centre can fall between two raster staircase pixels.
        // Sample its immediate pixel neighbours without widening the fitted axis.
        const hit =
          t <= high &&
          (at(x, y) ||
            at(x - 1, y) ||
            at(x + 1, y) ||
            at(x, y - 1) ||
            at(x, y + 1));
        if (hit) {
          if (Number.isNaN(from)) from = t;
          last = t;
          count++;
        } else if (!Number.isNaN(from) && t - last > 3) {
          let isolated = 0;
          const widths: number[] = [],
            offsets: number[] = [];
          const limit = referenceSize * 0.1;
          for (let j = 0; j <= 20; j++) {
            const v = from + ((last - from) * j) / 20;
            let px = mx + v * dx,
              py = my + v * dy;
            const ink = (n: number) => at(px + n * c, py + n * s);
            let center = [0, -0.5, 0.5, -1, 1, -1.5, 1.5, -2, 2].find(ink);
            if (center === undefined)
              for (const shift of [-0.5, 0.5]) {
                px = mx + (v + shift) * dx;
                py = my + (v + shift) * dy;
                center = [0, -0.5, 0.5, -1, 1, -1.5, 1.5, -2, 2].find(ink);
                if (center !== undefined) break;
              }
            if (center === undefined) continue;
            let low = center,
              high = center;
            while (center - low < limit && ink(low - 0.5)) low -= 0.5;
            while (high - center < limit && ink(high + 0.5)) high += 0.5;
            if (!ink(low - 3) && !ink(high + 3) && high - low < limit) {
              isolated++;
              widths.push(high - low + 0.5);
              offsets.push((low + high) / 2);
            }
          }
          if (
            last - from >= minimum &&
            count / (last - from + 1) >= 0.85 &&
            isolated >= 17
          ) {
            const strokeWidth = widths.sort((a, b) => a - b)[
              Math.floor(widths.length / 2)
            ];
            const offset = offsets.sort((a, b) => a - b)[
              Math.floor(offsets.length / 2)
            ];
            strokes.push({
              start: {
                x: mx + from * dx + c * offset,
                y: my + from * dy + s * offset,
              },
              end: {
                x: mx + last * dx + c * offset,
                y: my + last * dy + s * offset,
              },
              width: strokeWidth <= 2.5 ? 1 : strokeWidth,
              ink: count / (last - from + 1),
              oblique: true,
            });
          }
          from = NaN;
          count = 0;
        }
      }
    }
  }
  if (strokes.length > 3000) return denseResult;
  // Remove duplicate lines from the oblique fit, and avoid treating adjacent
  // ink rows as two wall faces. Pair partially overlapping, parallel faces.
  const unique: Stroke[] = [];
  for (const stroke of strokes.sort(
    (a, b) => distance(b.start, b.end) - distance(a.start, a.end),
  )) {
    if (
      unique.some(
        (s) =>
          distance(stroke.start, projection(stroke.start, s.start, s.end)) <
            Math.max(2, (stroke.width + s.width) / 2) &&
          distance(stroke.end, projection(stroke.end, s.start, s.end)) <
            Math.max(2, (stroke.width + s.width) / 2),
      )
    )
      continue;
    unique.push(stroke);
  }
  // Repeated narrow parallel lines describe hatches, tiles or stair treads.
  // Discard their frame too: a tile grid must not become four automatic walls.
  const repetitive = new Set<Stroke>();
  const sameBackground = (stroke: Stroke) => {
    const len = distance(stroke.start, stroke.end);
    const nx = -(stroke.end.y - stroke.start.y) / len,
      ny = (stroke.end.x - stroke.start.x) / len;
    let similar = 0;
    for (let i = 1; i < 12; i++) {
      const x = stroke.start.x + ((stroke.end.x - stroke.start.x) * i) / 12;
      const y = stroke.start.y + ((stroke.end.y - stroke.start.y) * i) / 12;
      const a = { x: Math.round(x + nx * 5), y: Math.round(y + ny * 5) };
      const b = { x: Math.round(x - nx * 5), y: Math.round(y - ny * 5) };
      if (
        [a, b].every(
          (p) => p.x >= 0 && p.x < width && p.y >= 0 && p.y < height,
        ) &&
        Math.abs(gray[a.y * width + a.x] - gray[b.y * width + b.x]) < 25
      )
        similar++;
    }
    return similar >= 9;
  };
  const repeatable = new Set(
    unique.filter(
      (s) => s.width <= Math.max(3, referenceSize * 0.015) && sameBackground(s),
    ),
  );
  for (const a of unique) {
    if (!repeatable.has(a)) continue;
    const len = distance(a.start, a.end),
      dx = (a.end.x - a.start.x) / len,
      dy = (a.end.y - a.start.y) / len;
    const parallel = unique
      .filter(
        (b) =>
          repeatable.has(b) &&
          Math.abs(
            ((b.end.x - b.start.x) * dx + (b.end.y - b.start.y) * dy) /
              distance(b.start, b.end),
          ) > 0.9995 &&
          distance(a.start, projection(a.start, b.start, b.end)) <
            minimum * 8 &&
          distance(a.end, projection(a.end, b.start, b.end)) < minimum * 8,
      )
      .map((b) => ({ b, offset: b.start.x * -dy + b.start.y * dx }))
      .sort((x, y) => x.offset - y.offset);
    for (let i = 1; i + 2 < parallel.length; i++) {
      const step = parallel[i].offset - parallel[i - 1].offset;
      if (step < 3) continue;
      if (
        [i + 1, i + 2].every(
          (j) =>
            Math.abs(parallel[j].offset - parallel[j - 1].offset - step) <
            Math.max(2, step * 0.15),
        )
      ) {
        repetitive.add(parallel[i].b);
        repetitive.add(parallel[i + 1].b);
        repetitive.add(parallel[i - 1].b);
        repetitive.add(parallel[i + 2].b);
      }
    }
  }
  const used = new Set<Stroke>();
  const walls: WallCandidate[] = [];
  const maximumThickness = options.metersPerUnit
    ? 0.8 / options.metersPerUnit
    : referenceSize * 0.1;
  const maximumFaceStroke = Math.max(8, referenceSize * 0.015);
  const available = unique.filter((s) => !repetitive.has(s));
  const grayAt = (p: Point) => {
    const x = Math.round(p.x),
      y = Math.round(p.y);
    return x < 0 || x >= width || y < 0 || y >= height
      ? 255
      : gray[y * width + x];
  };
  for (let index = 0; index < available.length; index++) {
    if (available.length > 6000) return denseResult;
    const a = available[index];
    if (used.has(a)) continue;
    const length = distance(a.start, a.end),
      dx = (a.end.x - a.start.x) / length,
      dy = (a.end.y - a.start.y) / length;
    const along = (t: number): Point => ({
      x: a.start.x + dx * t,
      y: a.start.y + dy * t,
    });
    const candidates = available
      .filter(
        (b) =>
          b !== a &&
          !used.has(b) &&
          a.width <= maximumFaceStroke &&
          b.width <= maximumFaceStroke,
      )
      .map((b) => {
        const len = distance(b.start, b.end);
        const dot =
          ((b.end.x - b.start.x) * dx + (b.end.y - b.start.y) * dy) / len;
        const ends = dot > 0 ? [b.start, b.end] : [b.end, b.start];
        const from =
          (ends[0].x - a.start.x) * dx + (ends[0].y - a.start.y) * dy;
        const to = (ends[1].x - a.start.x) * dx + (ends[1].y - a.start.y) * dy;
        const thickness = Math.abs(
          (b.start.x - a.start.x) * dy - (b.start.y - a.start.y) * dx,
        );
        const overlap = Math.max(0, Math.min(length, to) - Math.max(0, from));
        return { b, ends, dot, from, to, thickness, overlap };
      })
      .filter(
        (v) =>
          Math.abs(v.dot) > 0.9995 &&
          v.thickness >= Math.max(3, (a.width + v.b.width) / 2 + 1) &&
          v.thickness <= maximumThickness &&
          v.thickness < Math.min(length, distance(v.b.start, v.b.end)) * 0.2 &&
          v.overlap >= minimum,
      )
      .map((v) => {
        let filled = 0;
        for (let i = 1; i < 12; i++) {
          const p = along(Math.max(0, v.from) + (v.overlap * i) / 12);
          const q = projection(p, v.b.start, v.b.end);
          const middle = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
          const outsideA = {
            x: p.x + ((p.x - q.x) * 4) / v.thickness,
            y: p.y + ((p.y - q.y) * 4) / v.thickness,
          };
          const outsideB = {
            x: q.x + ((q.x - p.x) * 4) / v.thickness,
            y: q.y + ((q.y - p.y) * 4) / v.thickness,
          };
          const value = grayAt(middle);
          if (
            value < 230 &&
            Math.min(grayAt(outsideA), grayAt(outsideB)) - value > 18
          )
            filled++;
        }
        return { ...v, filled: filled >= 9 };
      })
      .filter(
        (v) =>
          v.filled ||
          (v.overlap >= Math.min(length, distance(v.b.start, v.b.end)) * 0.8 &&
            v.thickness < v.overlap * 0.2) ||
          (v.overlap >= Math.max(length, distance(v.b.start, v.b.end)) * 0.7 &&
            Math.abs(v.from) <= Math.max(v.thickness * 2, length * 0.08) &&
            Math.abs(v.to - length) <=
              Math.max(v.thickness * 2, length * 0.08)),
      );
    const pair = candidates.sort(
      (x, y) =>
        Number(y.filled) - Number(x.filled) || x.thickness - y.thickness,
    )[0];
    used.add(a);
    let start = a.start,
      end = a.end,
      thickness: number | null = a.width >= 3 ? a.width : null;
    let reason =
      thickness === null
        ? "Tratto sottile: asse e spessore da verificare."
        : "Tratto pieno continuo: asse e spessore misurati nell’immagine.";
    if (pair) {
      used.add(pair.b);
      const p = along(Math.max(0, pair.from)),
        q = along(Math.min(length, pair.to));
      const p2 = projection(p, pair.b.start, pair.b.end),
        q2 = projection(q, pair.b.start, pair.b.end);
      start = { x: (p.x + p2.x) / 2, y: (p.y + p2.y) / 2 };
      end = { x: (q.x + q2.x) / 2, y: (q.y + q2.y) / 2 };
      // Windows and junctions can split only one face. Retain the unpaired
      // remainder rather than shortening or consuming the entire adjacent wall.
      for (const [stroke, from, to] of [
        [a, a.start, p],
        [a, q, a.end],
        [pair.b, pair.ends[0], p2],
        [pair.b, q2, pair.ends[1]],
      ] as [Stroke, Point, Point][]) {
        if (distance(from, to) >= minimum)
          available.push({ ...stroke, start: from, end: to });
      }
      thickness = pair.thickness;
      reason =
        "Due facce parallele: asse centrale e spessore misurati; verificare quote e arredi.";
    }
    walls.push({
      id: `raster-${walls.length}`,
      layer:
        thickness === null ? "Contorni da verificare" : "Muri riconosciuti",
      kind: pair
        ? "raster-paired-faces"
        : a.oblique
          ? "raster-oblique-axis"
          : "raster-axis",
      start: { ...start },
      end: { ...end },
      thicknessUnits: thickness,
      confidence: thickness === null ? 0.5 : a.ink >= 0.98 || pair ? 0.7 : 0.65,
      reason,
    });
  }
  connectLocalJunctions(walls);
  const joined = (a: WallCandidate, end: Point) =>
    walls.some(
      (b) =>
        b !== a &&
        distance(end, projection(end, b.start, b.end)) < 1.5 &&
        Math.abs(
          ((a.end.x - a.start.x) * (b.end.x - b.start.x) +
            (a.end.y - a.start.y) * (b.end.y - b.start.y)) /
            (distance(a.start, a.end) * distance(b.start, b.end)),
        ) < 0.9,
    );
  const result = walls.filter((w) => {
    const both = joined(w, w.start) && joined(w, w.end);
    if (w.thicknessUnits === null) return both;
    // Strong automatic evidence requires an actual dark, thick stroke. Two
    // outline faces (also used by furniture/dimensions) never suffice alone.
    if (
      !semantic &&
      both &&
      w.confidence >= 0.7 &&
      w.kind === "raster-axis" &&
      w.thicknessUnits >= 5
    ) {
      const len = distance(w.start, w.end);
      let dark = 0;
      for (let t = 0; t <= 20; t++) {
        const x = Math.round(w.start.x + ((w.end.x - w.start.x) * t) / 20),
          y = Math.round(w.start.y + ((w.end.y - w.start.y) * t) / 20);
        if (
          x >= 0 &&
          x < width &&
          y >= 0 &&
          y < height &&
          gray[y * width + x] < 110
        )
          dark++;
      }
      if (dark >= 19 && len > Math.max(w.thicknessUnits * 6, minimum * 3)) {
        w.confidence = 0.92;
        w.reason += " Tratto scuro con entrambi gli estremi collegati.";
      }
    }
    return true;
  });
  // Filled-wall evidence can absorb an adjacent faint outline. Preserve the
  // alternative ink geometry in the review-only layer; never auto-import it.
  if (fillsAdded) {
    const outlines = recognizeRaster(
      pixels,
      width,
      height,
      false,
      undefined,
      options,
    ).walls;
    for (const outline of outlines) {
      if (
        result.some(
          (w) =>
            distance(outline.start, projection(outline.start, w.start, w.end)) <
              2 &&
            distance(outline.end, projection(outline.end, w.start, w.end)) < 2,
        )
      )
        continue;
      result.push({
        ...outline,
        id: `outline-${result.length}`,
        layer: "Contorni da verificare",
        confidence: Math.min(0.65, outline.confidence),
        reason:
          "Interpretazione alternativa del tratto originale; verificare asse, spessore e giunzioni.",
      });
    }
  }
  if (result.length > 5000) return denseResult;
  const deduplicated: WallCandidate[] = [];
  for (const candidate of result.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      distance(b.start, b.end) - distance(a.start, a.end),
  )) {
    if (
      deduplicated.some(
        (w) =>
          Math.abs((w.thicknessUnits ?? 0) - (candidate.thicknessUnits ?? 0)) <=
            2 &&
          distance(
            candidate.start,
            projection(candidate.start, w.start, w.end),
          ) < 1.5 &&
          distance(candidate.end, projection(candidate.end, w.start, w.end)) <
            1.5,
      )
    )
      continue;
    deduplicated.push(candidate);
  }
  let finalWalls = deduplicated;
  let imageWalls: WallCandidate[] | undefined;
  if (semantic && semanticMask) {
    // The model misses some thick, hatched walls. Keep those only when they sit
    // beside its evidence, then merge parallel faces into a single axis.
    const heuristic = recognizeRaster(
      pixels,
      width,
      height,
      true,
      undefined,
      options,
    );
    imageWalls = heuristic.walls;
    const filledWall = (wall: WallCandidate) => {
      let filled = 0;
      for (let step = 1; step < 20; step++) {
        const x = Math.round(
          wall.start.x + ((wall.end.x - wall.start.x) * step) / 20,
        );
        const y = Math.round(
          wall.start.y + ((wall.end.y - wall.start.y) * step) / 20,
        );
        const value = gray[y * width + x];
        if (value >= 110 && value < 230) filled++;
      }
      return filled >= 15;
    };
    const kept = heuristic.walls.flatMap((wall) => {
      if (wall.thicknessUnits === null) return [];
      const supported = nearSemanticMask(wall, semanticMask, width, height);
      const physical =
        (wall.confidence >= 0.9 || filledWall(wall)) &&
        wall.thicknessUnits >= 5 &&
        distance(wall.start, wall.end) >= referenceSize * 0.25;
      if (!supported && !physical) return [];
      return [
        {
          ...wall,
          layer: supported ? wall.layer : "Contorni da verificare",
          confidence: Math.min(supported ? 0.7 : 0.6, wall.confidence),
          reason: supported
            ? wall.reason + " Tratto coerente con la segmentazione AI."
            : wall.reason +
              " Tratto conservato dall’immagine originale, non confermato dall’AI: verificare.",
        },
      ];
    });
    // Keep a measured axis instead of averaging it with a competing interpretation.
    finalWalls = consolidateWallCandidates([...deduplicated, ...kept]).map(
      (wall, index) => ({ ...wall, id: `raster-${index}` }),
    );
    connectLocalJunctions(finalWalls);
    // Omitted image evidence stays separate and unconfirmed, without shifting the AI axes.
    for (const wall of heuristic.walls) {
      if (
        finalWalls.some(
          (candidate) =>
            distance(
              wall.start,
              projection(wall.start, candidate.start, candidate.end),
            ) < 1.5 &&
            distance(
              wall.end,
              projection(wall.end, candidate.start, candidate.end),
            ) < 1.5,
        )
      )
        continue;
      finalWalls.push({
        ...wall,
        id: `image-review-${wall.id}`,
        layer: "Contorni da verificare",
        confidence: Math.min(0.5, wall.confidence),
        reason:
          wall.reason +
          " Contorno originale non confermato dall’AI: verificare prima di includerlo.",
      });
      if (finalWalls.length > 5000) return denseResult;
    }
  }
  return {
    walls: finalWalls,
    ...(imageWalls ? { imageWalls } : {}),
    openings: [],
    notes: [
      semantic
        ? "Muri vettorizzati dalla segmentazione semantica AI locale con controllo dei tratti originali. I tratti non confermati dall’AI restano da verificare."
        : "Riconoscimento locale di tratti pieni, facce parallele e linee sottili, anche oblique. I punteggi indicano evidenza euristica.",
      "I muri arancioni richiedono verifica: quote, arredi e cartigli possono avere la stessa geometria. Selezionare una sola pianta nell’area da riconoscere.",
      "Scala, spessori, aperture e altezze vanno verificati su misure reali; le interruzioni non vengono chiuse automaticamente.",
      ...(finalWalls.length
        ? []
        : [
            "Nessun muro affidabile riconosciuto: utilizzare l’editor manuale.",
          ]),
    ],
  };
}
