import type { Point, Room, Wall } from "@/schemas/project";
import {
  EPS,
  add,
  area,
  centroid,
  cross,
  distance,
  lineIntersection,
  onSegment,
  pointInPolygon,
  samePoint,
  scale,
  selfIntersects,
  signedArea,
  subtract,
  perimeter,
} from "./primitives";
import { calculateThermal } from "@/domain/thermal/calculate";

type Edge = { a: Point; b: Point; wall: Wall };
export type RoomFace = {
  polygon: Point[];
  centerPolygon: Point[];
  wallIds: string[];
};
const key = (p: Point) => `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)}`;

/** Build planar half-edge faces, splitting crossings and collinear T junctions. */
export function detectRoomFaces(walls: Wall[]): RoomFace[] {
  const edges: Edge[] = [];
  const valid = walls.filter(
    (w) => distance(w.start, w.end) > EPS && w.thickness > 0,
  );
  for (const w of valid) {
    const cuts = [w.start, w.end];
    for (const v of valid) {
      if (v.id === w.id) continue;
      const hit = lineIntersection(w.start, w.end, v.start, v.end);
      if (
        hit &&
        onSegment(hit, w.start, w.end) &&
        onSegment(hit, v.start, v.end)
      )
        cuts.push(hit);
      for (const p of [v.start, v.end])
        if (onSegment(p, w.start, w.end)) cuts.push(p);
    }
    const unique = [...new Map(cuts.map((p) => [key(p), p])).values()].toSorted(
      (a, b) => distance(a, w.start) - distance(b, w.start),
    );
    for (let i = 0; i < unique.length - 1; i++)
      edges.push({ a: unique[i], b: unique[i + 1], wall: w });
  }
  const uniqueEdges = [
    ...new Map(
      edges.map((e) => [[key(e.a), key(e.b)].sort().join("|"), e]),
    ).values(),
  ];
  const outgoing = new Map<
    string,
    { edge: Edge; next: string; point: Point; angle: number }[]
  >();
  for (const e of uniqueEdges)
    for (const [a, b] of [
      [e.a, e.b],
      [e.b, e.a],
    ]) {
      const list = outgoing.get(key(a)) ?? [];
      list.push({
        edge: e,
        next: key(b),
        point: b,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      });
      outgoing.set(key(a), list);
    }
  for (const list of outgoing.values()) list.sort((a, b) => a.angle - b.angle);
  const visited = new Set<string>(),
    faces: RoomFace[] = [];
  for (const [origin, list] of outgoing)
    for (const initial of list) {
      if (visited.has(`${origin}>${initial.next}`)) continue;
      let from = origin,
        to = initial.next;
      const vertices: Point[] = [],
        faceEdges: Wall[] = [];
      let closed = false;
      for (let step = 0; step <= uniqueEdges.length * 2; step++) {
        const token = `${from}>${to}`;
        if (visited.has(token)) {
          closed = from === origin && to === initial.next;
          break;
        }
        visited.add(token);
        const current = outgoing.get(from)!.find((e) => e.next === to)!;
        vertices.push(
          current.edge.a && key(current.edge.a) === from
            ? current.edge.a
            : current.edge.b,
        );
        faceEdges.push(current.edge.wall);
        const choices = outgoing.get(to)!;
        const reverse = choices.findIndex((e) => e.next === from);
        const next = choices[(reverse - 1 + choices.length) % choices.length];
        from = to;
        to = next.next;
      }
      if (!closed || vertices.length < 3 || signedArea(vertices) <= EPS)
        continue;
      // Remove spurs retraced by dangling walls inside a closed face.
      let changed = true;
      while (changed && vertices.length >= 3) {
        changed = false;
        for (let i = 0; i < vertices.length; i++) {
          const before = (i - 1 + vertices.length) % vertices.length,
            after = (i + 1) % vertices.length;
          if (samePoint(vertices[before], vertices[after])) {
            const remove = [i, after].sort((a, b) => b - a);
            for (const index of remove) {
              vertices.splice(index, 1);
              faceEdges.splice(index, 1);
            }
            changed = true;
            break;
          }
        }
      }
      if (vertices.length < 3 || selfIntersects(vertices)) continue;
      const offsetLines = vertices.map((p, i) => {
        const q = vertices[(i + 1) % vertices.length],
          v = subtract(q, p),
          len = distance(p, q);
        const normal = scale(
          { x: -v.y, y: v.x },
          faceEdges[i].thickness / (2 * len),
        );
        return [add(p, normal), add(q, normal)];
      });
      const inset: Point[] = [];
      let invalid = false;
      for (let i = 0; i < vertices.length; i++) {
        const previous =
            offsetLines[(i - 1 + vertices.length) % vertices.length],
          current = offsetLines[i];
        const hit = lineIntersection(
          previous[0],
          previous[1],
          current[0],
          current[1],
        );
        if (hit) inset.push(hit);
        else if (distance(previous[1], current[0]) < 1e-5)
          inset.push(current[0]);
        else {
          invalid = true;
          break;
        }
      }
      if (
        invalid ||
        inset.length < 3 ||
        signedArea(inset) <= EPS ||
        selfIntersects(inset) ||
        inset.some((p) => !pointInPolygon(p, vertices))
      )
        continue;
      faces.push({
        polygon: inset,
        centerPolygon: vertices,
        wallIds: [...new Set(faceEdges.map((w) => w.id))],
      });
    }
  return faces;
}

/** Retain metadata through movement, split and merge using wall identity and containment. */
export function reconcileRooms(
  walls: Wall[],
  previous: Room[],
  floorId: string,
  defaultHeightM: number,
): Room[] {
  const used = new Set<string>();
  return detectRoomFaces(walls.filter((w) => w.floorId === floorId)).map(
    (face, i) => {
      const center = centroid(face.polygon);
      const candidates = previous
        .filter((r) => r.floorId === floorId && !used.has(r.id))
        .map((r) => {
          const shared = r.wallIds.filter((wid) =>
            face.wallIds.includes(wid),
          ).length;
          const exact =
            r.wallIds.length === face.wallIds.length &&
            shared === face.wallIds.length;
          return {
            r,
            score:
              (exact ? 1000 : 0) +
              shared * 10 +
              (pointInPolygon(r.centroid, face.centerPolygon) ? 100 : 0) +
              (pointInPolygon(center, r.polygon) ? 50 : 0),
          };
        })
        .filter((c) => c.score > 0)
        .toSorted((a, b) => b.score - a.score);
      const old = candidates[0]?.r;
      if (old) used.add(old.id);
      const netAreaM2 = area(face.polygon),
        heightM = old?.heightM ?? defaultHeightM;
      return {
        id: old?.id ?? crypto.randomUUID(),
        floorId,
        name: old?.name ?? `Ambiente ${i + 1}`,
        polygon: face.polygon,
        wallIds: face.wallIds,
        netAreaM2,
        perimeterM: perimeter(face.polygon),
        centroid: center,
        heightM,
        ...calculateThermal(netAreaM2, heightM),
        systemType: old?.systemType ?? "none",
        supplyPoints: old?.supplyPoints ?? 1,
        returnPoints: old?.returnPoints ?? 1,
      };
    },
  );
}

export function overlappingPolygons(a: Point[], b: Point[]) {
  if (
    a.some((p) => pointInPolygon(p, b)) ||
    b.some((p) => pointInPolygon(p, a))
  )
    return true;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) {
      const av = subtract(a[(i + 1) % a.length], a[i]),
        bv = subtract(b[(j + 1) % b.length], b[j]);
      const denom = cross(av, bv);
      if (Math.abs(denom) < EPS) continue;
      const delta = subtract(b[j], a[i]),
        t = cross(delta, bv) / denom,
        u = cross(delta, av) / denom;
      if (t > EPS && t < 1 - EPS && u > EPS && u < 1 - EPS) return true;
    }
  return false;
}
