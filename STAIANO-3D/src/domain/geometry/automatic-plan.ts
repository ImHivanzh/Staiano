import type { PlanAnalysis, WallCandidate } from "./plan-analysis";
import type { Reconstruction } from "@/services/import/reconstruction-schema";
import { distance, lineIntersection, projection } from "./primitives";
import type { Point } from "@/schemas/project";
import { detectRoomFaces } from "./rooms";
import { consolidateWallCandidates } from "./plan-candidates";

/** Keep the learned room topology, anchoring it to visible wall axes. */
export function reconstructPlan2D(
  model: Reconstruction,
  physical: PlanAnalysis,
): PlanAnalysis {
  const tolerance = Math.max(12, Math.min(model.width, model.height) * 0.04);
  const walls: WallCandidate[] = [];
  const imageWalls = (physical.imageWalls ?? physical.walls).filter(
    (w) => w.layer !== "Contorni da verificare",
  );
  const openingShapes: (Reconstruction["shapes"][number] & {
    reason?: string;
  })[] = model.shapes.filter(
    (shape) => shape.label === 9 || shape.label === 10,
  );
  const onLine = (p: Point, wall: WallCandidate) => {
    const dx = wall.end.x - wall.start.x,
      dy = wall.end.y - wall.start.y;
    const t =
      ((p.x - wall.start.x) * dx + (p.y - wall.start.y) * dy) /
      (dx * dx + dy * dy);
    return { x: wall.start.x + t * dx, y: wall.start.y + t * dy };
  };
  for (const shape of model.shapes.filter(
    (s) => s.label > 0 && s.label < 9 && s.points.length >= 3,
  )) {
    for (let i = 0; i < shape.points.length; i++) {
      const start = shape.points[i],
        end = shape.points[(i + 1) % shape.points.length],
        length = distance(start, end);
      if (length < 8) continue;
      const matches = imageWalls
        .flatMap((wall) => {
          const span = distance(wall.start, wall.end);
          if (span < 8 || wall.confidence < 0.5) return [];
          const dot = Math.abs(
            ((end.x - start.x) * (wall.end.x - wall.start.x) +
              (end.y - start.y) * (wall.end.y - wall.start.y)) /
              (length * span),
          );
          const a = onLine(start, wall),
            b = onLine(end, wall);
          const offset = (distance(start, a) + distance(end, b)) / 2;
          const overlap = distance(
            projection(a, wall.start, wall.end),
            projection(b, wall.start, wall.end),
          );
          return dot >= 0.985 && offset <= tolerance && overlap >= length * 0.3
            ? [
                {
                  wall,
                  offset,
                  overlap,
                  fit: Math.max(0, offset - (wall.thicknessUnits ?? 0) / 2),
                  priority:
                    wall.kind === "raster-paired-faces"
                      ? 0
                      : wall.confidence >= 0.7
                        ? 1
                        : 2,
                },
              ]
            : [];
        })
        .sort(
          (a, b) =>
            a.priority - b.priority || a.fit - b.fit || b.overlap - a.overlap,
        );
      const match = matches[0]?.wall;
      if (!match) continue;
      walls.push({
        ...match,
        id: `auto-${walls.length}`,
        start: onLine(start, match),
        end: onLine(end, match),
        confidence: Math.min(0.8, match.confidence),
        reason:
          "Ricostruzione 2D delle stanze, allineata a un muro visibile nell’immagine: verificare la posa.",
      });
    }
  }
  // A gap in the image stays open unless the model also identifies an opening.
  const supportedWalls: WallCandidate[] = [];
  for (const wall of walls) {
    const length = distance(wall.start, wall.end),
      ux = (wall.end.x - wall.start.x) / length,
      uy = (wall.end.y - wall.start.y) / length;
    const along = (p: Point) =>
      (p.x - wall.start.x) * ux + (p.y - wall.start.y) * uy;
    const intervals = imageWalls
      .flatMap((ink) => {
        const span = distance(ink.start, ink.end);
        if (
          span < Math.max(24, Math.min(model.width, model.height) * 0.08) ||
          Math.abs(
            ((ink.end.x - ink.start.x) * ux + (ink.end.y - ink.start.y) * uy) /
              span,
          ) < 0.995 ||
          distance(ink.start, onLine(ink.start, wall)) > 4
        )
          return [];
        return [
          [
            Math.max(0, Math.min(along(ink.start), along(ink.end))),
            Math.min(length, Math.max(along(ink.start), along(ink.end))),
          ],
        ];
      })
      .filter(([a, b]) => b > a)
      .sort((a, b) => a[0] - b[0]);
    const merged: number[][] = [];
    for (const interval of intervals) {
      const previous = merged[merged.length - 1];
      if (previous && interval[0] <= previous[1] + 3)
        previous[1] = Math.max(previous[1], interval[1]);
      else merged.push([...interval]);
    }
    const cuts: number[][] = [];
    for (let i = 1; i < merged.length; i++) {
      const gap = [merged[i - 1][1], merged[i][0]];
      const explained = openingShapes.some((shape) => {
        if (shape.label !== 9 && shape.label !== 10) return false;
        const a = shape.points[0],
          b = shape.points[shape.points.length - 1];
        const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        return (
          distance(middle, projection(middle, wall.start, wall.end)) <=
            tolerance &&
          Math.min(along(a), along(b)) <= gap[0] + tolerance / 2 &&
          Math.max(along(a), along(b)) >= gap[1] - tolerance / 2
        );
      });
      if (!explained) {
        if (
          gap[1] - gap[0] >= 6 &&
          gap[1] - gap[0] <=
            Math.min(length * 0.6, Math.min(model.width, model.height) * 0.18)
        )
          openingShapes.push({
            label: 10,
            points: gap.map((at) => ({
              x: wall.start.x + ux * at,
              y: wall.start.y + uy * at,
            })),
            reason:
              "Varco visibile tra due tratti muro: tipo porta proposto, da verificare.",
          });
        else cuts.push(gap);
      }
    }
    const firstInk = merged[0]?.[0] ?? 0;
    const lastInk = merged[merged.length - 1]?.[1] ?? length;
    let from = firstInk > tolerance ? firstInk : 0;
    const through = length - lastInk > tolerance ? lastInk : length;
    for (const [a, b] of [...cuts, [through, through]]) {
      if (a - from >= 2)
        supportedWalls.push({
          ...wall,
          id: `auto-${supportedWalls.length}`,
          start: { x: wall.start.x + ux * from, y: wall.start.y + uy * from },
          end: { x: wall.start.x + ux * a, y: wall.start.y + uy * a },
        });
      from = b;
    }
  }
  walls.splice(0, walls.length, ...supportedWalls);
  // Snap only nearby intersections; an unsupported model partition stays absent.
  for (const wall of walls)
    for (const key of ["start", "end"] as const) {
      const intersections = walls
        .filter((other) => other !== wall)
        .flatMap((other) => {
          const hit = lineIntersection(
            wall.start,
            wall.end,
            other.start,
            other.end,
          );
          return hit &&
            distance(hit, wall[key]) <= tolerance &&
            distance(hit, projection(hit, other.start, other.end)) <= tolerance
            ? [{ point: hit, other }]
            : [];
        })
        .sort(
          (a, b) => distance(a.point, wall[key]) - distance(b.point, wall[key]),
        );
      const junction = intersections[0];
      if (junction) {
        wall[key] = junction.point;
        const otherKey =
          distance(junction.point, junction.other.start) <
          distance(junction.point, junction.other.end)
            ? "start"
            : "end";
        if (distance(junction.point, junction.other[otherKey]) <= tolerance)
          junction.other[otherKey] = junction.point;
      }
    }
  // Small raster differences at a shared corner otherwise create tiny spurs and
  // self-intersections when room areas are inset by the measured wall thickness.
  const joints: {
    point: Point;
    ends: { wall: WallCandidate; key: "start" | "end" }[];
  }[] = [];
  for (const wall of walls)
    for (const key of ["start", "end"] as const) {
      const joint = joints.find(
        (joint) => distance(joint.point, wall[key]) <= 2.01,
      );
      if (joint) joint.ends.push({ wall, key });
      else joints.push({ point: wall[key], ends: [{ wall, key }] });
    }
  for (const joint of joints) {
    const point = {
      x:
        joint.ends.reduce((sum, end) => sum + end.wall[end.key].x, 0) /
        joint.ends.length,
      y:
        joint.ends.reduce((sum, end) => sum + end.wall[end.key].y, 0) /
        joint.ends.length,
    };
    for (const end of joint.ends) end.wall[end.key] = point;
  }
  const unique = new Map<string, WallCandidate>();
  for (const wall of walls) {
    if (distance(wall.start, wall.end) < 2) continue;
    const key = [wall.start, wall.end]
      .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .sort()
      .join("|");
    if (!unique.has(key)) unique.set(key, wall);
  }
  const selected = consolidateWallCandidates([...unique.values()]).filter(
    (w) => w.layer !== "Contorni da verificare",
  );
  const roomsDetected = detectRoomFaces(
    selected.map((wall) => ({
      ...wall,
      floorId: "preview",
      thickness: wall.thicknessUnits ?? 4,
      height: null,
      locked: false,
      type: "INTERNO" as const,
    })),
  ).length;
  if (!roomsDetected)
    return {
      ...physical,
      notes: [
        "Ricostruzione delle stanze non sufficientemente coerente: sono disponibili i muri riconosciuti nell’immagine.",
        ...physical.notes,
      ],
    };
  const openings: PlanAnalysis["openings"] = [];
  for (const shape of openingShapes) {
    const a = shape.points[0],
      b = shape.points[shape.points.length - 1];
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const wall = selected
      .map((wall) => ({
        wall,
        delta: distance(middle, projection(middle, wall.start, wall.end)),
      }))
      .filter((item) => item.delta <= tolerance)
      .sort((a, b) => a.delta - b.delta)[0]?.wall;
    if (!wall) continue;
    const start = projection(a, wall.start, wall.end),
      end = projection(b, wall.start, wall.end);
    if (distance(start, end) < 3) continue;
    if (
      openings.some(
        (opening) =>
          opening.wallCandidateId === wall.id &&
          distance(
            {
              x: (opening.start.x + opening.end.x) / 2,
              y: (opening.start.y + opening.end.y) / 2,
            },
            { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
          ) < Math.max(3, distance(start, end) * 0.4),
      )
    )
      continue;
    openings.push({
      start,
      end,
      wallCandidateId: wall.id,
      type: shape.label === 10 ? "door" : "window",
      confidence: shape.reason ? 0.5 : 0.7,
      reason:
        shape.reason ??
        "Apertura 2D proposta dal modello; verificare larghezza e quote verticali.",
    });
  }
  return {
    walls: selected,
    openings,
    reconstructed: true,
    roomsDetected,
    notes: [
      "Planimetria 2D ricostruita automaticamente: muri e stanze restano modificabili. Verificare la scala su una misura reale prima dell’importazione.",
      "Porte e finestre sono proposte 2D; le quote verticali iniziali usano i valori preliminari del programma.",
      ...physical.notes,
    ],
  };
}
