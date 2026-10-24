import { Box3, Quaternion, Vector3 } from "three";
import type { Duct, Project } from "@/schemas/project";
import { airConnectionRoutes, ductRoute, type RoutePoint } from "./routes";
import { flexibleDuctCurve } from "./flexible-curve";
import { bodies, segmentBodyDistance, segmentDistance } from "./duct-bodies";
import { machinePlenum } from "./placement";
import { terminalPlenum } from "./attached-plenums";
import { pointInPolygon } from "../geometry/primitives";
import { roofHeightAt } from "../geometry/ceilings";
import {
  ceilingSurfaces,
  segmentHitsCeilingSurface,
  type CeilingSurface,
} from "./ceiling-surfaces";
import type { Body } from "./duct-bodies";
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

export function findDuctCollisions(
  project: Project,
  paths: DuctScenePath[],
): Map<string, DuctCollision> {
  if (!paths.some((path) => path.flexible)) return new Map();
  const result = new Map<string, DuctCollision>(),
    labels = deviceCodes(project);
  const floors = new Set(paths.map((p) => p.floorId));
  const volumes: Array<Body | CeilingSurface> = [
    ...bodies(project, floors, labels),
    ...[...floors].flatMap((floor) => ceilingSurfaces(project, floor)),
  ];
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
        if (
          "triangles" in body
            ? segmentHitsCeilingSurface(a, b, radius, body)
            : segmentBodyDistance(a, b, body) < (radius - 1e-5) ** 2
        ) {
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
