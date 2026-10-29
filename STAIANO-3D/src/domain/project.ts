import type { Point, Project, Room, Wall } from "@/schemas/project";
import { projectSchema, CURRENT_SCHEMA_VERSION } from "@/schemas/project";
import {
  add,
  area,
  bounds,
  cross,
  distance,
  lineIntersection,
  onSegment,
  pointInPolygon,
  samePoint,
  scale,
  subtract,
  projection,
} from "@/domain/geometry/primitives";
import { reconcileRooms, overlappingPolygons } from "@/domain/geometry/rooms";
import { followWallTransforms } from "@/domain/geometry/follow-walls";
import {
  positionRecessedAlongRoomWall,
  roomWallSpan,
} from "@/domain/geometry/placement";
import {
  fanCoilMaximumPoint,
  fanCoilProductAtVersion,
  isRecessedFanCoil,
} from "@/domain/catalogs/fan-coils";
import {
  fanCoilPlacementValid,
  highWallElevationM,
  isHighWallFanCoil,
} from "@/domain/fan-coils/placement";
import { wallRun, wallRunMeasuredLength } from "@/domain/geometry/wall-runs";
import { calculateRoomThermal } from "./geometry/ceilings";
import { THERMAL_COEFFICIENT_W_M3 } from "@/domain/thermal/calculate";
import { pillarFootprint } from "@/domain/geometry/pillars";
import { ensureInstallations } from "./installations";
import { roomCeilingHeightM } from "./air-conditioning/elevation";
import { refreshDuctedBindings } from "./ducted/refresh";
import { drywallGeometry } from "./geometry/drywall";
import {
  drywallSideForRoom,
  drywallSides,
  withDrywallSides,
} from "./geometry/drywall-sides";
import { clipToConvex } from "./geometry/pillars";

export const newId = () => crypto.randomUUID();
export function createProject(
  name = "Nuovo progetto",
  coefficientWm3: number = THERMAL_COEFFICIENT_W_M3,
): Project {
  if (!Number.isFinite(coefficientWm3) || coefficientWm3 <= 0)
    throw new Error("Il coefficiente termico deve essere positivo e finito.");
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    floors: [
      {
        id: newId(),
        name: "Piano terra",
        elevationM: 0,
        scaleVerified: true,
        background: null,
        importAnalysis: null,
      },
    ],
    walls: [],
    rooms: [],
    openings: [],
    hvacSystems: [],
    installations: [],
    plenums: [],
    pillars: [],
    ducts: [],
    ductedDrafts: [],
    heatPumpDrafts: [],
    equipmentDrafts: [],
    fanCoils: [],
    hydronicSystems: [],
    radiators: [],
    airTerminals: [],
    projectSettings: {
      radiatorDeltaTK: 50,
      defaultHeightM: 3,
      internalWallThicknessM: 0.1,
      externalWallThicknessM: 0.5,
      coefficientWm3,
      maxNoiseDbA: 37,
      dimensionMode: "internal",
    },
    catalogVersions: {},
    sourceFilesMetadata: [],
  };
}
export function clearProjectSystems(project: Project): Project {
  return {
    ...project,
    installations: [],
    hvacSystems: [],
    hydronicSystems: [],
    radiators: [],
    fanCoils: [],
    airTerminals: [],
    plenums: [],
    ducts: [],
    ductedDrafts: [],
    heatPumpDrafts: [],
    equipmentDrafts: [],
    rooms: project.rooms.map((room) => ({
      ...room,
      systemType: "none",
      supplyPoints: 1,
      returnPoints: 1,
    })),
    floors: project.floors.map((floor) => ({
      ...floor,
      configurationWizard: floor.configurationWizard
        ? {
            step: Math.min(floor.configurationWizard.step, 8),
            confirmedSteps: floor.configurationWizard.confirmedSteps.filter(
              (step) => step < 8,
            ),
            status: "paused",
          }
        : floor.configurationWizard,
    })),
  };
}
export function recomputeProject(project: Project): Project {
  const p = structuredClone(project);
  // Ogni ventilconvettore lavora al punto di massima potenza pubblicata, anche
  // se il progetto salvato ricordava una velocità inferiore.
  for (const unit of p.fanCoils ?? []) {
    const product = fanCoilProductAtVersion(unit.productId, unit.catalogVersion);
    if (product)
      unit.operatingPointIndex = fanCoilMaximumPoint(product).index;
  }
  const previousRooms = structuredClone(p.rooms);
  // Materialize junctions so each boundary segment has independent identity.
  // Otherwise deleting a shared section could also delete an exterior wall.
  const expanded = new Map<string, string[]>();
  const splitWalls: Wall[] = [];
  for (const w of p.walls) {
    const cuts = [w.start, w.end];
    for (const other of p.walls) {
      if (other.id === w.id || other.floorId !== w.floorId) continue;
      const hit = lineIntersection(w.start, w.end, other.start, other.end);
      if (
        hit &&
        onSegment(hit, w.start, w.end) &&
        onSegment(hit, other.start, other.end)
      )
        cuts.push(hit);
      for (const v of [other.start, other.end])
        if (onSegment(v, w.start, w.end)) cuts.push(v);
    }
    const points = cuts
      .toSorted((a, b) => distance(a, w.start) - distance(b, w.start))
      .filter((v, i, list) => i === 0 || !samePoint(v, list[i - 1]));
    const ids: string[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const id = i === 0 ? w.id : newId();
      ids.push(id);
      const start = points[i],
        end = points[i + 1];
      if (
        !splitWalls.some(
          (v) =>
            v.floorId === w.floorId &&
            ((samePoint(v.start, start) && samePoint(v.end, end)) ||
              (samePoint(v.start, end) && samePoint(v.end, start))),
        )
      )
        splitWalls.push({ ...w, id, start, end });
    }
    expanded.set(w.id, ids);
  }
  p.walls = splitWalls;
  p.rooms = p.rooms.map((r) => ({
    ...r,
    wallIds: [...new Set(r.wallIds.flatMap((id) => expanded.get(id) ?? [id]))],
  }));
  p.rooms = p.floors.flatMap((f) =>
    reconcileRooms(
      p.walls,
      p.rooms,
      f.id,
      p.projectSettings.defaultHeightM,
      p.projectSettings.coefficientWm3,
    ),
  );
  p.rooms = p.rooms.map((room) => {
    const liningPolygons = p.walls.flatMap((w) => {
      if ((drywallSideForRoom(w, room.id)?.offsetM ?? 0) <= 0) return [];
      const lining = drywallGeometry(p, w, room.id);
      return lining ? [lining.polygon] : [];
    });
    const linings = liningPolygons.reduce(
      (sum, polygon) => sum + area(clipToConvex(room.polygon, polygon)),
      0,
    );
    const occupied = (p.pillars ?? [])
      .filter((c) => c.floorId === room.floorId)
      .reduce((sum, c) => {
        const clipped = clipToConvex(room.polygon, pillarFootprint(c));
        return (
          sum +
          area(clipped) -
          liningPolygons.reduce(
            (overlap, polygon) =>
              overlap + area(clipToConvex(clipped, polygon)),
            0,
          )
        );
      }, 0);
    const netAreaM2 = Math.max(0, room.netAreaM2 - occupied - linings);
    return {
      ...room,
      netAreaM2,
      ...calculateRoomThermal(p, { ...room, netAreaM2 }),
      ...(room.conditioningExclusion ? { designLoadW: 0 } : {}),
    };
  });
  // An unfinished edit must never silently discard the room or its devices.
  // Keep last closed geometry explicitly unresolved, with current valid wall references.
  const closedRooms = [...p.rooms];
  const survivingWalls = new Map(p.walls.map((wall) => [wall.id, wall]));
  for (const old of previousRooms) {
    if (!p.floors.some((floor) => floor.id === old.floorId)) continue;
    if (closedRooms.some((room) => room.id === old.id)) continue;
    const represented = closedRooms.some(
      (room) =>
        room.floorId === old.floorId &&
        (pointInPolygon(old.centroid, room.polygon) ||
          overlappingPolygons(old.polygon, room.polygon)),
    );
    if (represented) continue;
    p.rooms.push({
      ...old,
      geometryStatus: "unresolved",
      wallIds: [
        ...new Set(old.wallIds.flatMap((id) => expanded.get(id) ?? [id])),
      ].filter((id) => survivingWalls.get(id)?.floorId === old.floorId),
    });
  }
  // Keep associated devices when a room splits/merges, using their actual position.
  const reassociate = <
    T extends {
      floorId: string;
      roomId: string;
      position: Point;
      wallId: string | null;
    },
  >(
    items: T[],
  ) =>
    items
      .map((item) => {
        const room = p.rooms.find(
          (r) =>
            r.floorId === item.floorId &&
            pointInPolygon(item.position, r.polygon),
        );
        return {
          ...item,
          roomId: room?.id ?? item.roomId,
          wallId: item.wallId
            ? (p.walls
                .filter(
                  (w) =>
                    expanded.get(item.wallId!)?.includes(w.id) &&
                    (!room || room.wallIds.includes(w.id)),
                )
                .sort(
                  (a, b) =>
                    distance(
                      item.position,
                      projection(item.position, a.start, a.end),
                    ) -
                    distance(
                      item.position,
                      projection(item.position, b.start, b.end),
                    ),
                )[0]?.id ?? null)
            : null,
        };
      })
      .filter((item) => p.rooms.some((r) => r.id === item.roomId));
  p.radiators = reassociate(p.radiators);
  p.walls = p.walls.map((wall) => {
    const sides = drywallSides(wall).filter((side) =>
      p.rooms.some(
        (room) => room.id === side.roomId && room.wallIds.includes(wall.id),
      ),
    );
    return sides.length === drywallSides(wall).length
      ? wall
      : withDrywallSides(wall, sides);
  });
  p.fanCoils = reassociate(p.fanCoils ?? []).map((original) => {
    let unit = original;
    if (unit.locked || unit.mounting !== "wall") return unit;
    const product = fanCoilProductAtVersion(
      unit.productId,
      unit.catalogVersion,
    );
    const room = p.rooms.find(
      (r) => r.id === unit.roomId && r.floorId === unit.floorId,
    );
    // Filomuro inseriti prima della posa alta: ancora alla quota bassa di default, li alza.
    if (
      room &&
      product &&
      isHighWallFanCoil(product) &&
      Math.abs(unit.elevationM - (0.1 + unit.heightMm / 2000)) < 1e-3
    ) {
      const elevationM = highWallElevationM(p, room, product, unit.position, unit.rotation, unit.panelType ?? null);
      if (elevationM !== null) {
        const raised = { ...unit, elevationM };
        if (fanCoilPlacementValid(p, raised, product)) unit = raised;
      }
    }
    if (!isRecessedFanCoil(product)) return unit;
    const wall = p.walls.find(
      (w) => w.id === unit.wallId && w.floorId === unit.floorId,
    );
    if (!room || !wall) return unit;
    const span = roomWallSpan(room, wall);
    if (!span || span.lengthM + 1e-6 < unit.widthMm / 1000) return unit;
    const available =
      wall.thickness + (drywallSideForRoom(wall, room.id)?.offsetM ?? 0);
    if (available + 1e-6 < unit.depthMm / 1000 - 0.002) return unit;
    const along = Math.min(
      Math.max(
        distance(span.start, projection(unit.position, span.start, span.end)),
        unit.widthMm / 2000,
      ),
      span.lengthM - unit.widthMm / 2000,
    );
    if (!Number.isFinite(along)) return unit;
    const position = positionRecessedAlongRoomWall(
      room,
      wall,
      along,
      unit.depthMm / 1000,
    );
    return Math.abs(position.x - unit.position.x) < 1e-4 &&
      Math.abs(position.y - unit.position.y) < 1e-4
      ? unit
      : { ...unit, position };
  });
  p.airTerminals = reassociate(p.airTerminals);
  p.ductedDrafts = p.ductedDrafts?.filter(
    (draft) =>
      p.rooms.some((room) => room.id === draft.roomId) &&
      p.installations.some((item) => item.id === draft.installationId),
  );
  p.heatPumpDrafts = p.heatPumpDrafts?.filter((draft) =>
    p.floors.some((floor) => floor.id === draft.floorId),
  );
  p.equipmentDrafts = p.equipmentDrafts?.filter((draft) =>
    p.rooms.some(
      (room) => room.id === draft.roomId && room.floorId === draft.floorId,
    ),
  );
  p.openings = p.openings.filter((o) => p.walls.some((w) => w.id === o.wallId));
  p.hvacSystems = p.hvacSystems
    .map((s) => ({
      ...s,
      indoorUnits: reassociate(s.indoorUnits),
      roomIds:
        (s.type === "split" || s.type === "vrv") && s.indoorUnits.length
          ? [...new Set(reassociate(s.indoorUnits).map((u) => u.roomId))]
          : p.rooms
              .filter(
                (room) =>
                  s.roomIds.includes(room.id) ||
                  previousRooms.some(
                    (old) =>
                      s.roomIds.includes(old.id) &&
                      old.floorId === room.floorId &&
                      (!previousRooms.some((r) => r.id === room.id) ||
                        !p.rooms.some((r) => r.id === old.id)) &&
                      (pointInPolygon(room.centroid, old.polygon) ||
                        overlappingPolygons(old.polygon, room.polygon)),
                  ),
              )
              .map((room) => room.id),
    }))
    .filter(
      (s) =>
        s.roomIds.length > 0 ||
        (s.type === "ducted" && s.indoorUnits.length > 0),
    );
  const systemIds = new Set(p.hvacSystems.map((s) => s.id));
  p.airTerminals = p.airTerminals.map((t) => ({
    ...t,
    systemId: t.systemId && systemIds.has(t.systemId) ? t.systemId : null,
    pendingSystemId:
      t.pendingSystemId && systemIds.has(t.pendingSystemId)
        ? t.pendingSystemId
        : undefined,
  }));
  p.plenums = p.plenums
    .filter((pl) => !pl.systemId || systemIds.has(pl.systemId))
    .map((pl) => ({
      ...pl,
      roomId: p.hvacSystems.some(
        (s) =>
          s.id === pl.systemId &&
          (s.roomIds.includes(pl.roomId ?? "") ||
            s.indoorUnits.some((unit) => unit.roomId === pl.roomId)),
      )
        ? pl.roomId
        : null,
    }));
  const plenumUses = new Map(p.plenums.map((pl) => [pl.id, pl.use] as const)),
    plenumIds = new Set(p.plenums.map((pl) => pl.id));
  p.airTerminals = p.airTerminals.map((t) => ({
    ...t,
    // Ogni bocchetta sta sul plenum del proprio lato: mandata o ripresa.
    plenumId:
      t.plenumId &&
      plenumIds.has(t.plenumId) &&
      plenumUses.get(t.plenumId) === t.use
        ? t.plenumId
        : null,
  }));
  p.ducts = (p.ducts ?? []).filter(
    (d) =>
      plenumIds.has(d.plenumId) &&
      (!d.terminalId ||
        p.airTerminals.some(
          (t) => t.id === d.terminalId && t.plenumId === d.plenumId,
        )),
  );
  p.hydronicSystems = p.hydronicSystems
    ?.map((s) => ({
      ...s,
      roomIds: s.roomIds.filter((id) => p.rooms.some((r) => r.id === id)),
      fanCoilIds: s.fanCoilIds.filter((id) =>
        p.fanCoils?.some((u) => u.id === id && s.roomIds.includes(u.roomId)),
      ),
      pipeWaypoints: s.pipeWaypoints?.filter((route) =>
        p.fanCoils?.some((u) => u.id === route.fanCoilId),
      ),
    }))
    .filter((s) => s.roomIds.length > 0);
  p.rooms = p.rooms.map((room) => ({
    ...room,
    systemType: p.hvacSystems.some(
      (s) => s.type === "ducted" && s.roomIds.includes(room.id),
    )
      ? "ducted"
      : p.hvacSystems.some(
            (s) => s.type === "vrv" && s.roomIds.includes(room.id),
          )
        ? "vrv"
        : p.hvacSystems.some(
              (s) => s.type === "split" && s.roomIds.includes(room.id),
            )
          ? "split"
          : p.radiators.some((r) => r.roomId === room.id)
            ? "radiator"
            : p.fanCoils?.some((u) => u.roomId === room.id)
              ? "fanCoil"
              : room.systemType,
  }));
  return ensureInstallations(p);
}
export function addWall(
  p: Project,
  floorId: string,
  start: Point,
  end: Point,
  type: Wall["type"] = "INTERNO",
): Project {
  if (distance(start, end) < 0.05)
    throw new Error("Il muro deve misurare almeno 5 cm.");
  const wall: Wall = {
    id: newId(),
    floorId,
    start,
    end,
    type,
    thickness:
      type === "INTERNO"
        ? p.projectSettings.internalWallThicknessM
        : p.projectSettings.externalWallThicknessM,
    height: null,
    locked: false,
  };
  return recomputeProject({ ...p, walls: [...p.walls, wall] });
}
export function addRectangle(
  p: Project,
  floorId: string,
  input: {
    width: number;
    length: number;
    height: number;
    name: string;
    origin?: Point;
  },
): Project {
  if (
    ![input.width, input.length, input.height].every(
      (n) => Number.isFinite(n) && n >= 0.1 && n <= 100,
    )
  )
    throw new Error("Misure positive richieste, da 0,10 a 100 m.");
  if (input.height > 30) throw new Error("Altezza massima 30 m.");
  const t = p.projectSettings.externalWallThicknessM,
    existing = p.walls.filter((w) => w.floorId === floorId);
  const box = bounds(existing.flatMap((w) => [w.start, w.end]));
  const o = input.origin ?? {
    x: existing.length ? box.maxX + 1 : 0,
    y: existing.length ? box.minY : 0,
  };
  const width = input.width + t,
    length = input.length + t;
  const points = [
    o,
    { x: o.x + width, y: o.y },
    { x: o.x + width, y: o.y + length },
    { x: o.x, y: o.y + length },
  ];
  const walls: Wall[] = points.map((start, i) => ({
    id: newId(),
    floorId,
    start,
    end: points[(i + 1) % 4],
    type: "ESTERNO",
    thickness: t,
    height: null,
    locked: false,
  }));
  const result = recomputeProject({ ...p, walls: [...p.walls, ...walls] });
  const room = result.rooms.find((r) =>
    walls.every((w) => r.wallIds.includes(w.id)),
  );
  if (!room)
    throw new Error(
      "Il rettangolo interseca muri esistenti. Scegliere un'origine libera.",
    );
  room.name = input.name.trim() || "Nuovo ambiente";
  room.heightM = input.height;
  Object.assign(room, calculateRoomThermal(result, room));
  return result;
}
export function moveWall(p: Project, wallId: string, delta: Point): Project {
  const selected = p.walls.find((w) => w.id === wallId);
  if (!selected) return p;
  const walls = p.walls.map((w) =>
    w.floorId !== selected.floorId
      ? w
      : {
          ...w,
          start:
            samePoint(w.start, selected.start) ||
            samePoint(w.start, selected.end)
              ? add(w.start, delta)
              : w.start,
          end:
            samePoint(w.end, selected.start) || samePoint(w.end, selected.end)
              ? add(w.end, delta)
              : w.end,
        },
  );
  return recomputeProject(followWallTransforms(p, walls));
}
export function addAdjacentRoom(
  p: Project,
  wallId: string,
  depthM: number,
  name: string,
  heightM: number,
): Project {
  const w = p.walls.find((w) => w.id === wallId);
  const occupants = p.rooms.filter((r) => r.wallIds.includes(wallId));
  if (!w || occupants.length !== 1)
    throw new Error("Selezionare una parete esterna di una stanza.");
  if (
    ![depthM, heightM].every((v) => Number.isFinite(v) && v >= 0.1 && v <= 30)
  )
    throw new Error("Profondità e altezza da 0,10 a 30 m.");
  const direction = subtract(w.end, w.start),
    length = distance(w.start, w.end);
  const insideSign =
    cross(direction, subtract(occupants[0].centroid, w.start)) > 0 ? 1 : -1;
  const delta = scale(
    { x: -direction.y, y: direction.x },
    (-insideSign * (depthM + w.thickness)) / length,
  );
  const a = w.start,
    b = w.end,
    c = add(b, delta),
    d = add(a, delta);
  const added: Wall[] = [
    [b, c],
    [c, d],
    [d, a],
  ].map(([start, end]) => ({ ...w, id: newId(), start, end, type: "ESTERNO" }));
  const result = recomputeProject({ ...p, walls: [...p.walls, ...added] });
  const room = result.rooms.find((r) => r.wallIds.includes(added[1].id));
  if (!room || result.rooms.length !== p.rooms.length + 1)
    throw new Error("Spazio adiacente occupato o geometria non valida.");
  room.name = name || "Ambiente adiacente";
  room.heightM = heightM;
  Object.assign(room, calculateRoomThermal(result, room));
  return result;
}
export function resizeWall(
  p: Project,
  wallId: string,
  lengthM: number,
): Project {
  if (!Number.isFinite(lengthM) || lengthM < 0.05 || lengthM > 100)
    throw new Error("Lunghezza muro da 0,05 a 100 m.");
  const selected = p.walls.find((w) => w.id === wallId);
  if (!selected) return p;
  const end = add(
    selected.start,
    scale(
      subtract(selected.end, selected.start),
      lengthM / distance(selected.start, selected.end),
    ),
  );
  return recomputeProject(
    followWallTransforms(
      p,
      p.walls.map((w) =>
        w.floorId !== selected.floorId
          ? w
          : {
              ...w,
              start: samePoint(w.start, selected.end) ? end : w.start,
              end: samePoint(w.end, selected.end) ? end : w.end,
            },
      ),
    ),
  );
}

/**
 * Porta la misura INTERNA della fila di muri collineari al valore indicato.
 * La fila è una sola misura: si sposta l'estremo finale, non la giunzione
 * interna. L'asse viene così dimensionato aggiungendo la differenza fra la
 * misura richiesta e quella interna attuale.
 */
export function resizeWallRunInternal(
  p: Project,
  wallId: string,
  internalM: number,
): Project {
  if (!Number.isFinite(internalM) || internalM < 0.05 || internalM > 100)
    throw new Error("Lunghezza interna muro da 0,05 a 100 m.");
  const run = wallRun(p, wallId);
  if (!run) return p;
  const current = wallRunMeasuredLength(p, wallId, "internal");
  const moved = (delta: number): Project => {
    const axis = distance(run.start, run.end);
    if (!Number.isFinite(axis) || axis < 1e-9 || axis + delta < 0.05)
      throw new Error("Lunghezza muro da 0,05 a 100 m.");
    const end = add(run.end, scale(subtract(run.end, run.start), delta / axis));
    return recomputeProject(
      followWallTransforms(
        p,
        p.walls.map((w) =>
          w.floorId !== run.floorId
            ? w
            : {
                ...w,
                start: samePoint(w.start, run.end) ? end : w.start,
                end: samePoint(w.end, run.end) ? end : w.end,
              },
        ),
      ),
    );
  };
  // Spostando un solo estremo la parete collegata può inclinarsi: la misura
  // interna non è esattamente lineare nella lunghezza d'asse. Si corregge per
  // iterazioni successive finché il campo salvato coincide con il valore
  // digitato.
  let delta = internalM - current;
  let result = moved(delta);
  for (let i = 0; i < 16; i++) {
    const measured = wallRunMeasuredLength(result, wallId, "internal");
    const error = internalM - measured;
    if (Math.abs(error) < 1e-5) break;
    delta += error;
    result = moved(delta);
  }
  return result;
}
export function resizeRectangularRoom(
  p: Project,
  roomId: string,
  width: number,
  length: number,
): Project {
  const r = p.rooms.find((r) => r.id === roomId);
  if (!r || r.polygon.length !== 4)
    throw new Error("Quote stanza disponibili per rettangoli ortogonali.");
  const box = bounds(r.polygon);
  if (
    r.polygon.some((a, i) => {
      const b = r.polygon[(i + 1) % 4];
      return Math.abs(a.x - b.x) > 1e-5 && Math.abs(a.y - b.y) > 1e-5;
    })
  )
    throw new Error("Stanza non rettangolare ortogonale.");
  if (![width, length].every((n) => Number.isFinite(n) && n >= 0.1 && n <= 100))
    throw new Error("Quote nette da 0,10 a 100 m.");
  const points = p.walls
    .filter((w) => r.wallIds.includes(w.id))
    .flatMap((w) => [w.start, w.end]);
  const axes = bounds(points),
    dx = width - (box.maxX - box.minX),
    dy = length - (box.maxY - box.minY);
  const transform = (v: Point) => ({
    x: v.x + (Math.abs(v.x - axes.maxX) < 1e-5 ? dx : 0),
    y: v.y + (Math.abs(v.y - axes.maxY) < 1e-5 ? dy : 0),
  });
  return recomputeProject(
    followWallTransforms(
      p,
      p.walls.map((w) =>
        w.floorId !== r.floorId
          ? w
          : {
              ...w,
              start: points.some((v) => samePoint(v, w.start))
                ? transform(w.start)
                : w.start,
              end: points.some((v) => samePoint(v, w.end))
                ? transform(w.end)
                : w.end,
            },
      ),
    ),
  );
}
export function updateRoom(
  p: Project,
  roomId: string,
  patch: Partial<
    Pick<
      Room,
      | "name"
      | "heightM"
      | "ceilingHeightM"
      | "ceilingBands"
      | "roof"
      | "systemType"
      | "supplyPoints"
      | "returnPoints"
      | "conditioningExclusion"
    >
  >,
): Project {
  const before = p.rooms.find((r) => r.id === roomId);
  const next: Project = {
    ...p,
    rooms: p.rooms.map((r) => {
      if (r.id !== roomId) return r;
      const updated = { ...r, ...patch };
      return {
        ...updated,
        ...calculateRoomThermal(p, updated),
        ...(updated.conditioningExclusion ? { designLoadW: 0 } : {}),
      };
    }),
  };
  const after = next.rooms.find((r) => r.id === roomId);
  if (
    !before ||
    !after ||
    (patch.heightM === undefined &&
      patch.ceilingHeightM === undefined &&
      patch.ceilingBands === undefined &&
      patch.roof === undefined)
  )
    return next;
  // Keep plenums at the same relative depth under the new ceiling.
  const delta = roomCeilingHeightM(after) - roomCeilingHeightM(before);
  const shifted =
    delta === 0
      ? next
      : {
          ...next,
          plenums: next.plenums.map((pl) =>
            pl.roomId === roomId && pl.elevationM !== undefined
              ? { ...pl, elevationM: Math.max(0.1, pl.elevationM + delta) }
              : pl,
          ),
        };
  const refreshed = refreshDuctedBindings(shifted);
  return {
    ...refreshed,
    rooms: refreshed.rooms.map((room) =>
      room.id === roomId ? { ...room, systemType: after.systemType } : room,
    ),
  };
}
export function mergeRooms(
  p: Project,
  firstId: string,
  secondId: string,
  resultingHeightM?: number,
): Project {
  const a = p.rooms.find((r) => r.id === firstId),
    b = p.rooms.find((r) => r.id === secondId);
  if (!a || !b || a.floorId !== b.floorId)
    throw new Error("Selezionare due stanze dello stesso piano.");
  if (a.geometryStatus === "unresolved" || b.geometryStatus === "unresolved")
    throw new Error("Richiudere i contorni prima di unire gli ambienti.");
  if (resultingHeightM === undefined && a.heightM !== b.heightM)
    throw new Error(
      "Le stanze hanno altezze diverse. Indicare l’altezza del nuovo ambiente.",
    );
  if (
    JSON.stringify(a.conditioningExclusion) !==
    JSON.stringify(b.conditioningExclusion)
  )
    throw new Error(
      "Allineare la scelta di climatizzazione e il motivo di esclusione prima di unire gli ambienti.",
    );
  const heightM = resultingHeightM ?? a.heightM;
  if (!Number.isFinite(heightM) || heightM <= 0 || heightM > 30)
    throw new Error("Altezza risultante positiva, massimo 30 m.");
  const shared = a.wallIds.filter((id) => b.wallIds.includes(id));
  if (!shared.length) throw new Error("Le stanze non condividono una parete.");
  const result = recomputeProject({
    ...p,
    walls: p.walls.filter((w) => !shared.includes(w.id)),
  });
  const merged = result.rooms.find(
    (room) =>
      room.floorId === a.floorId &&
      room.geometryStatus === "closed" &&
      pointInPolygon(a.centroid, room.polygon) &&
      pointInPolygon(b.centroid, room.polygon),
  );
  if (!merged)
    throw new Error("L’unione non genera un contorno chiuso valido.");
  merged.heightM = heightM;
  Object.assign(merged, calculateRoomThermal(result, merged));
  if (merged.conditioningExclusion) merged.designLoadW = 0;
  return result;
}
export function duplicateProject(
  p: Project,
  name = `${p.name} — copia`,
): Project {
  const copy = structuredClone(p);
  copy.id = newId();
  copy.name = name;
  copy.createdAt = copy.updatedAt = new Date().toISOString();
  return projectSchema.parse(copy);
}
