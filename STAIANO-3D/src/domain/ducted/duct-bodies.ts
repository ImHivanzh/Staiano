import { Box3, Vector3 } from "three";
import type { Point, Project } from "@/schemas/project";
import {
  projectDeviceEnvelopes,
  type DeviceEnvelope,
} from "../geometry/device-envelope";
import { footprintCorners } from "../geometry/footprint";
import { drywallGeometry } from "../geometry/drywall";
import { projectOutdoorUnits } from "../hydronic/placement";
import {
  architecturalWallHeight,
  measuredOpenings,
  wallPanels,
} from "@/configurator/viewer3d/architecture-geometry";

export type Body = DeviceEnvelope & {
  label: string;
  bounds: Box3;
  center: Vector3;
  axes: Vector3[];
  half: number[];
};

/** Ogni volume fisico che un flessibile non deve attraversare, per piano. */
export function bodies(
  project: Project,
  floors: Set<string>,
  labels: Map<string, string>,
): Body[] {
  const result: Body[] = [];
  const add = (
    id: string,
    floorId: string,
    polygon: Point[],
    minZ: number,
    maxZ: number,
    label: string,
  ) => {
    if (!floors.has(floorId) || maxZ <= minZ || polygon.length !== 4) return;
    labels.set(id, label);
    result.push({
      deviceId: id,
      floorId,
      roomId: "",
      cornersXY: polygon,
      minZ,
      maxZ,
      label,
      center: new Vector3(
        (polygon[0].x + polygon[2].x) / 2,
        (minZ + maxZ) / 2,
        (polygon[0].y + polygon[2].y) / 2,
      ),
      axes: [
        new Vector3(
          polygon[1].x - polygon[0].x,
          0,
          polygon[1].y - polygon[0].y,
        ).normalize(),
        new Vector3(0, 1, 0),
        new Vector3(
          polygon[3].x - polygon[0].x,
          0,
          polygon[3].y - polygon[0].y,
        ).normalize(),
      ],
      half: [
        Math.hypot(polygon[1].x - polygon[0].x, polygon[1].y - polygon[0].y) /
          2,
        (maxZ - minZ) / 2,
        Math.hypot(polygon[3].x - polygon[0].x, polygon[3].y - polygon[0].y) /
          2,
      ],
      bounds: new Box3().setFromPoints(
        polygon.flatMap((p) => [
          new Vector3(p.x, minZ, p.y),
          new Vector3(p.x, maxZ, p.y),
        ]),
      ),
    });
  };
  for (const e of projectDeviceEnvelopes(project))
    add(
      e.deviceId,
      e.floorId,
      e.cornersXY,
      e.minZ,
      e.maxZ,
      `apparecchio ${labels.get(e.deviceId) ?? e.deviceId}`,
    );
  for (const system of project.hvacSystems.filter(
    (s) => s.type === "ducted" && !s.fanCoilId,
  ))
    for (const unit of system.indoorUnits) {
      const room = project.rooms.find((r) => r.id === unit.roomId);
      if (!room) continue;
      const center = room.heightM - unit.heightMm / 2000 - 0.05;
      add(
        unit.id,
        unit.floorId,
        footprintCorners(
          unit.position,
          unit.widthMm / 1000,
          unit.depthMm / 1000,
          unit.rotation,
        ),
        center - unit.heightMm / 2000,
        center + unit.heightMm / 2000,
        `macchina ${labels.get(unit.id) ?? unit.productId}`,
      );
    }
  for (const unit of projectOutdoorUnits(project))
    add(
      unit.id,
      unit.floorId,
      footprintCorners(
        unit.position,
        unit.widthMm / 1000,
        unit.depthMm / 1000,
        unit.rotation,
      ),
      unit.elevationM - unit.heightMm / 2000,
      unit.elevationM + unit.heightMm / 2000,
      `unità esterna ${labels.get(unit.id) ?? ""}`,
    );
  // Solo i plenum salvati hanno un corpo fisico: quelli proposti (macchina o
  // catalogo della bocchetta) non vengono disegnati e quindi non possono
  // nemmeno essere attraversati.
  for (const p of project.plenums)
    add(
      p.id,
      p.floorId,
      footprintCorners(
        p.position,
        p.widthMm / 1000,
        p.depthMm / 1000,
        p.rotation,
      ),
      (p.elevationM ?? 2) - p.heightMm / 2000,
      (p.elevationM ?? 2) + p.heightMm / 2000,
      `plenum ${labels.get(p.id) ?? ""}`,
    );
  for (const p of project.pillars ?? [])
    add(
      p.id,
      p.floorId,
      footprintCorners(
        p.position,
        p.widthMm / 1000,
        p.depthMm / 1000,
        p.rotation,
      ),
      0,
      p.heightMm / 1000,
      `pilastro ${labels.get(p.id) ?? ""}`,
    );
  const wallBody = (
    wall: Project["walls"][number],
    openings = project.openings,
  ) => {
    const dx = wall.end.x - wall.start.x,
      dy = wall.end.y - wall.start.y,
      length = Math.hypot(dx, dy);
    if (!length) return;
    const height = architecturalWallHeight(
      wall,
      project.rooms,
      project.projectSettings.defaultHeightM,
    );
    for (const panel of wallPanels(
      length,
      height,
      measuredOpenings(wall, openings, height),
    )) {
      const along = (panel.left + panel.right) / 2;
      add(
        wall.id,
        wall.floorId,
        footprintCorners(
          {
            x: wall.start.x + (dx * along) / length,
            y: wall.start.y + (dy * along) / length,
          },
          panel.right - panel.left,
          wall.thickness,
          Math.atan2(dy, dx),
        ),
        panel.bottom,
        panel.top,
        `parete ${labels.get(wall.id) ?? ""}`,
      );
    }
  };
  for (const wall of project.walls.filter((w) => floors.has(w.floorId))) {
    const cavity = drywallGeometry(project, wall);
    if (!cavity) {
      wallBody(wall);
      continue;
    }
    // L'intercapedine è vuota: verificare soltanto le due pelli e le chiusure.
    const dx = wall.end.x - wall.start.x,
      dy = wall.end.y - wall.start.y,
      length = Math.hypot(dx, dy);
    for (const [face, thickness] of [
      [cavity.front, 0.0125],
      [cavity.back, wall.thickness],
    ] as const) {
      const forward =
        (face.end.x - face.start.x) * dx + (face.end.y - face.start.y) * dy >=
        0;
      const start = forward ? face.start : face.end,
        end = forward ? face.end : face.start;
      const copy = {
        ...wall,
        thickness,
        start: {
          x: start.x - (cavity.normal.x * thickness) / 2,
          y: start.y - (cavity.normal.y * thickness) / 2,
        },
        end: {
          x: end.x - (cavity.normal.x * thickness) / 2,
          y: end.y - (cavity.normal.y * thickness) / 2,
        },
      };
      const shift =
        ((copy.start.x - wall.start.x) * dx +
          (copy.start.y - wall.start.y) * dy) /
        length;
      wallBody(
        copy,
        project.openings.map((o) =>
          o.wallId === wall.id ? { ...o, offsetM: o.offsetM - shift } : o,
        ),
      );
    }
    for (const end of ["start", "end"] as const)
      if (!cavity[end === "start" ? "joinedStart" : "joinedEnd"])
        wallBody(
          {
            ...wall,
            thickness: 0.0125,
            start: cavity.back[end],
            end: cavity.front[end],
          },
          [],
        );
  }
  return result;
}

/** Exact segment-to-box distance: minimise each quadratic interval between face crossings. */
export function segmentBodyDistance(a: Vector3, b: Vector3, body: Body) {
  const { half } = body;
  const local = (p: Vector3) =>
    body.axes.map((axis) => axis.dot(p.clone().sub(body.center)));
  const start = local(a),
    end = local(b),
    d = end.map((v, i) => v - start[i]),
    cuts = [0, 1];
  for (let i = 0; i < 3; i++)
    if (Math.abs(d[i]) > 1e-12)
      for (const face of [-half[i], half[i]]) {
        const t = (face - start[i]) / d[i];
        if (t > 0 && t < 1) cuts.push(t);
      }
  cuts.sort((a, b) => a - b);
  const distance = (t: number) =>
    start.reduce(
      (sum, v, i) => sum + Math.max(0, Math.abs(v + d[i] * t) - half[i]) ** 2,
      0,
    );
  let best = Infinity;
  for (let j = 1; j < cuts.length; j++) {
    const lo = cuts[j - 1],
      hi = cuts[j],
      mid = (lo + hi) / 2;
    let aa = 0,
      bb = 0;
    for (let i = 0; i < 3; i++) {
      const value = start[i] + d[i] * mid;
      if (Math.abs(value) <= half[i]) continue;
      aa += d[i] ** 2;
      bb += d[i] * (start[i] - Math.sign(value) * half[i]);
    }
    best = Math.min(
      best,
      distance(lo),
      distance(hi),
      distance(aa ? Math.max(lo, Math.min(hi, -bb / aa)) : mid),
    );
  }
  return best;
}

export function segmentDistance(
  a: Vector3,
  b: Vector3,
  c: Vector3,
  d: Vector3,
) {
  const u = b.clone().sub(a),
    v = d.clone().sub(c),
    w = a.clone().sub(c);
  const uu = u.lengthSq(),
    vv = v.lengthSq(),
    uv = u.dot(v),
    uw = u.dot(w),
    vw = v.dot(w),
    det = uu * vv - uv * uv;
  const pointDistance = (
    p: Vector3,
    q: Vector3,
    direction: Vector3,
    length: number,
  ) =>
    p.distanceToSquared(
      q
        .clone()
        .addScaledVector(
          direction,
          length
            ? Math.max(0, Math.min(1, p.clone().sub(q).dot(direction) / length))
            : 0,
        ),
    );
  let best = Math.min(
    pointDistance(a, c, v, vv),
    pointDistance(b, c, v, vv),
    pointDistance(c, a, u, uu),
    pointDistance(d, a, u, uu),
  );
  if (det > 1e-12) {
    const s = (uv * vw - vv * uw) / det,
      t = (uu * vw - uv * uw) / det;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1)
      best = Math.min(
        best,
        a
          .clone()
          .addScaledVector(u, s)
          .distanceToSquared(c.clone().addScaledVector(v, t)),
      );
  }
  return best;
}
