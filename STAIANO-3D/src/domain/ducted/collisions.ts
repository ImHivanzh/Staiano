import { Box3, Quaternion, Vector3 } from "three";
import type { Duct, Point, Project } from "@/schemas/project";
import { airConnectionRoutes, ductRoute, type RoutePoint } from "./routes";
import { flexibleDuctCurve } from "./flexible-curve";
import { machinePlenum } from "./placement";
import { terminalPlenum } from "./attached-plenums";
import {
  projectDeviceEnvelopes,
  type DeviceEnvelope,
} from "../geometry/device-envelope";
import { footprintCorners } from "../geometry/footprint";
import { pointInPolygon } from "../geometry/primitives";
import { roofHeightAt, ceilingBandPolygon } from "../geometry/ceilings";
import { drywallGeometry } from "../geometry/drywall";
import { projectOutdoorUnits } from "../hydronic/placement";
import { splitCenterElevationM } from "../air-conditioning/elevation";
import {
  architecturalWallHeight,
  measuredOpenings,
  wallPanels,
} from "@/configurator/viewer3d/architecture-geometry";
import { deviceCodes } from "@/services/export/device-codes";

export type DuctScenePath = {
  id: string;
  entityId: string;
  floorId: string;
  terminalId: string | null;
  portIndex?: number;
  duct?: Duct;
  points: RoutePoint[];
  fallbackPoint?: RoutePoint;
  flexible: boolean;
  diameterMm: number;
  radiusM: number;
  startIds: string[];
  endIds: string[];
};
export type DuctCollision = {
  entityId: string;
  floorId: string;
  point: RoutePoint;
  withIds: string[];
  message: string;
};

/** The same saved and proposed hoses feed the scene and its physical checks. */
export function ductScenePaths(
  project: Project,
  floorId?: string,
): DuctScenePath[] {
  const make = (
    id: string,
    terminalId: string | null,
    systemId: string,
    floor: string,
    points: RoutePoint[],
    diameterMm: number,
    duct?: Duct,
    portIndex?: number,
    fallbackPoint?: RoutePoint,
  ): DuctScenePath => {
    const terminal = project.airTerminals.find((t) => t.id === terminalId);
    const source = terminal && machinePlenum(project, systemId, terminal.use);
    const target = terminal && terminalPlenum(project, terminal);
    return {
      id,
      entityId: duct?.id ?? terminalId!,
      floorId: floor,
      terminalId,
      portIndex,
      duct,
      points,
      diameterMm,
      flexible: !duct || duct.kind === "flexible",
      radiusM:
        !duct || duct.shape === "circle"
          ? diameterMm / 2000
          : Math.hypot(duct.widthMm ?? 0, duct.heightMm ?? 0) / 2000,
      fallbackPoint:
        fallbackPoint ??
        (terminal
          ? { ...terminal.position, elevationM: terminal.elevationM ?? 2 }
          : undefined),
      startIds: [
        source?.id,
        ...(project.hvacSystems
          .find((s) => s.id === systemId)
          ?.indoorUnits.map((u) => u.id) ?? []),
      ].filter((id): id is string => !!id),
      endIds: [
        target?.id,
        terminal?.id,
        terminal?.wallId,
        terminal?.ceilingBandId,
      ].filter((id): id is string => !!id),
    };
  };
  const saved = (project.ducts ?? []).flatMap((duct) => {
    const plenum = project.plenums.find((p) => p.id === duct.plenumId);
    const terminal = project.airTerminals.find((t) => t.id === duct.terminalId);
    if (
      !plenum ||
      (floorId && plenum.floorId !== floorId) ||
      (duct.terminalId && (!terminal || !terminalPlenum(project, terminal)))
    )
      return [];
    return [
      make(
        duct.id,
        duct.terminalId,
        duct.systemId,
        plenum.floorId,
        ductRoute(project, duct),
        duct.diameterMm ?? 160,
        duct,
      ),
    ];
  });
  const proposed = project.floors
    .filter((f) => !floorId || f.id === floorId)
    .flatMap((floor) =>
      airConnectionRoutes(project, floor.id).map((connection) => {
        const terminal = project.airTerminals.find(
          (t) => t.id === connection.terminalId,
        )!;
        return make(
          `air:${terminal.id}:${connection.portIndex}`,
          terminal.id,
          terminal.systemId!,
          floor.id,
          connection.points,
          connection.diameterMm,
          undefined,
          connection.portIndex,
          connection.end,
        );
      }),
    );
  return [...saved, ...proposed];
}

type Body = DeviceEnvelope & {
  label: string;
  bounds: Box3;
  center: Vector3;
  axes: Vector3[];
  half: number[];
};
function bodies(
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
    (s) => (s.type === "ducted" && !s.fanCoilId) || s.type === "vrv",
  ))
    for (const unit of system.indoorUnits) {
      const room = project.rooms.find((r) => r.id === unit.roomId);
      if (!room) continue;
      const center =
        system.type === "vrv"
          ? splitCenterElevationM(room, unit)
          : room.heightM - unit.heightMm / 2000 - 0.05;
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
      unit.elevationM,
      unit.elevationM + unit.heightMm / 1000,
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
function segmentBodyDistance(a: Vector3, b: Vector3, body: Body) {
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

function segmentDistance(a: Vector3, b: Vector3, c: Vector3, d: Vector3) {
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

export function findDuctCollisions(
  project: Project,
  paths: DuctScenePath[],
): Map<string, DuctCollision> {
  if (!paths.some((path) => path.flexible)) return new Map();
  const result = new Map<string, DuctCollision>(),
    labels = deviceCodes(project);
  const volumes = bodies(project, new Set(paths.map((p) => p.floorId)), labels);
  const traces = paths.flatMap((path) => {
    const curve = path.flexible
      ? flexibleDuctCurve(path.points, path.diameterMm)?.curve
      : null;
    if (
      (path.flexible && !curve) ||
      path.points.length < 2 ||
      path.radiusM <= 0
    )
      return [];
    const points = curve
      ? curve.getSpacedPoints(
          Math.min(
            4096,
            Math.max(
              2,
              Math.ceil(curve.getLength() / Math.min(0.025, path.radiusM / 2)),
            ),
          ),
        )
      : path.points.map((p) => new Vector3(p.x, p.elevationM, p.y));
    const lengths = [0];
    for (let i = 1; i < points.length; i++)
      lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
    labels.set(path.id, `canale ${labels.get(path.entityId) ?? ""}`);
    return [
      {
        path,
        points,
        lengths,
        bounds: new Box3().setFromPoints(points).expandByScalar(path.radiusM),
      },
    ];
  });
  const hit = (
    path: DuctScenePath,
    id: string,
    point: Vector3,
    label: string,
  ) => {
    if (!path.flexible) return;
    const value = result.get(path.id) ?? {
      entityId: path.entityId,
      floorId: path.floorId,
      point: { x: point.x, y: point.z, elevationM: point.y },
      withIds: [],
      message: "",
    };
    if (!value.withIds.includes(id)) value.withIds.push(id);
    labels.set(id, label);
    result.set(path.id, value);
  };
  for (const { path, points } of traces.filter(
    (t) => !t.path.flexible && t.path.duct?.shape === "rectangle",
  )) {
    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1],
        end = points[i],
        direction = end.clone().sub(start),
        length = direction.length();
      if (length < 1e-8) continue;
      const rotation = new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        direction.normalize(),
      );
      const axes = [
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0),
        new Vector3(0, 0, 1),
      ].map((axis) => axis.applyQuaternion(rotation));
      const half = [
          (path.duct!.widthMm ?? 0) / 2000,
          length / 2,
          (path.duct!.heightMm ?? 0) / 2000,
        ],
        center = start.clone().lerp(end, 0.5);
      const corners = [-1, 1].flatMap((x) =>
        [-1, 1].flatMap((y) =>
          [-1, 1].map((z) =>
            center
              .clone()
              .addScaledVector(axes[0], x * half[0])
              .addScaledVector(axes[1], y * half[1])
              .addScaledVector(axes[2], z * half[2]),
          ),
        ),
      );
      volumes.push({
        deviceId: path.id,
        floorId: path.floorId,
        roomId: "",
        cornersXY: [],
        minZ: Math.min(...corners.map((p) => p.y)),
        maxZ: Math.max(...corners.map((p) => p.y)),
        label: labels.get(path.id)!,
        bounds: new Box3().setFromPoints(corners),
        center,
        axes,
        half,
      });
    }
  }
  for (const { path, points, lengths, bounds } of traces.filter(
    (t) => t.path.flexible,
  )) {
    const radius = path.radiusM,
      total = lengths.at(-1)!;
    for (const body of volumes) {
      if (body.floorId !== path.floorId || !bounds.intersectsBox(body.bounds))
        continue;
      for (let i = 1; i < points.length; i++) {
        let lo = lengths[i - 1],
          hi = lengths[i];
        // Ignora soltanto il contatto del collare, mai il resto del corpo collegato.
        if (path.startIds.includes(body.deviceId))
          lo = Math.max(lo, radius + 0.065);
        if (path.endIds.includes(body.deviceId))
          hi = Math.min(hi, total - radius - 0.065);
        if (hi <= lo) continue;
        const span = lengths[i] - lengths[i - 1];
        const a = points[i - 1]
            .clone()
            .lerp(points[i], span ? (lo - lengths[i - 1]) / span : 0),
          b = points[i - 1]
            .clone()
            .lerp(points[i], span ? (hi - lengths[i - 1]) / span : 1);
        if (segmentBodyDistance(a, b, body) < (radius - 1e-5) ** 2) {
          hit(path, body.deviceId, a, body.label);
          break;
        }
      }
    }
    for (const point of points) {
      if (point.y < radius - 1e-5)
        hit(path, `floor:${path.floorId}`, point, "pavimento");
      for (const room of project.rooms.filter(
        (r) =>
          r.floorId === path.floorId &&
          pointInPolygon({ x: point.x, y: point.z }, r.polygon),
      )) {
        if (
          point.y + radius >
          roofHeightAt(project, room, { x: point.x, y: point.z }) + 1e-5
        )
          hit(path, `roof:${room.id}`, point, `soffitto ${room.name}`);
        if (
          room.ceilingHeightM !== null &&
          Math.abs(point.y - room.ceilingHeightM) < radius - 1e-5
        )
          hit(path, `ceiling:${room.id}`, point, `controsoffitto ${room.name}`);
        for (const band of room.ceilingBands ?? [])
          if (
            pointInPolygon(
              { x: point.x, y: point.z },
              ceilingBandPolygon(project, room, band),
            ) &&
            Math.abs(point.y - band.elevationM) < radius - 1e-5
          )
            hit(path, band.id, point, `fascia ${band.name}`);
      }
    }
  }
  for (let a = 0; a < traces.length; a++)
    for (let b = a + 1; b < traces.length; b++) {
      const first = traces[a],
        second = traces[b];
      if (
        (!first.path.flexible && first.path.duct?.shape === "rectangle") ||
        (!second.path.flexible && second.path.duct?.shape === "rectangle") ||
        (!first.path.flexible && !second.path.flexible) ||
        first.path.floorId !== second.path.floorId ||
        !first.bounds.intersectsBox(second.bounds)
      )
        continue;
      const radius = first.path.radiusM + second.path.radiusM - 1e-5;
      let intersects = false;
      for (let i = 1; i < first.points.length && !intersects; i++)
        for (let j = 1; j < second.points.length; j++) {
          const p = first.points[i - 1],
            q = first.points[i],
            r = second.points[j - 1],
            s = second.points[j];
          if (
            Math.max(p.x, q.x) + radius < Math.min(r.x, s.x) ||
            Math.max(r.x, s.x) + radius < Math.min(p.x, q.x) ||
            Math.max(p.y, q.y) + radius < Math.min(r.y, s.y) ||
            Math.max(r.y, s.y) + radius < Math.min(p.y, q.y) ||
            Math.max(p.z, q.z) + radius < Math.min(r.z, s.z) ||
            Math.max(r.z, s.z) + radius < Math.min(p.z, q.z)
          )
            continue;
          if (segmentDistance(p, q, r, s) < radius ** 2) {
            hit(first.path, second.path.id, p, labels.get(second.path.id)!);
            hit(second.path, first.path.id, r, labels.get(first.path.id)!);
            intersects = true;
            break;
          }
        }
    }
  for (const value of result.values())
    value.message = `Collisione con ${value.withIds
      .slice(0, 3)
      .map((id) => labels.get(id) ?? id)
      .join(
        ", ",
      )}${value.withIds.length > 3 ? ` e altri ${value.withIds.length - 3} elementi` : ""}. Sposta il percorso.`;
  return result;
}
