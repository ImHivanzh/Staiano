import { createProject, newId, recomputeProject } from "../src/domain/project";
import { projectSchema, type Project, type Wall } from "../src/schemas/project";
import { radiatorProducts } from "../src/domain/catalogs/radiators";
import { sizeRadiators } from "../src/domain/radiators/size";
import { applyRadiatorSolution } from "../src/domain/radiators/apply";
import { applySplitSystem } from "../src/domain/air-conditioning/apply";
import { applyDuctedSystem } from "../src/domain/ducted/apply";
import { airTerminalCatalog } from "../src/domain/catalogs/air-terminals";
import { sizeAirTerminal } from "../src/domain/air-terminals/size";
import { applyAirTerminalSolution } from "../src/domain/air-terminals/apply";
import {
  positionAlongRoomWall,
  roomWallSpan,
} from "../src/domain/geometry/placement";

/** Shared walls, measured openings and source-backed products; no invented SKU. */
export function realisticProjectFixture(): Project {
  let p = createProject("Casa Staiano — verifica realismo 3D");
  const floorId = p.floors[0].id;
  const segments = [
    [0, 0, 9.2, 0, "ESTERNO"],
    [9.2, 0, 9.2, 8.4, "ESTERNO"],
    [9.2, 8.4, 0, 8.4, "ESTERNO"],
    [0, 8.4, 0, 0, "ESTERNO"],
    [4.6, 0, 4.6, 8.4, "INTERNO"],
    [0, 4.2, 9.2, 4.2, "INTERNO"],
  ] as const;
  const walls: Wall[] = segments.map(([x, y, endX, endY, type]) => ({
    id: newId(),
    floorId,
    start: { x, y },
    end: { x: endX, y: endY },
    type,
    thickness: type === "ESTERNO" ? 0.3 : 0.12,
    height: null,
  }));
  p = recomputeProject({ ...p, walls });
  p.rooms = p.rooms.map((room) => ({
    ...room,
    name:
      room.centroid.y < 4.2
        ? room.centroid.x < 4.6
          ? "Soggiorno"
          : "Camera"
        : room.centroid.x < 4.6
          ? "Studio"
          : "Cucina",
    supplyPoints: 2,
  }));
  const room = (name: string) => p.rooms.find((r) => r.name === name)!;
  for (const [name, manufacturer, family] of [
    ["Soggiorno", "Cordivari", "Ardesia 3 colonne"],
    ["Studio", "Global", "VIP"],
  ]) {
    const variants = radiatorProducts.filter(
      (v) =>
        v.manufacturer === manufacturer &&
        v.family === family &&
        (manufacturer !== "Cordivari" || v.columns === 3) &&
        v.heightMm >= 550 &&
        v.heightMm <= 700,
    );
    const solution = sizeRadiators(room(name).designLoadW, variants, 50, {
      manufacturer,
      family,
      numberOfRadiators: 1,
      maxWidthMm: 2200,
    })[0];
    if (!solution) throw new Error(`No real radiator solution for ${name}`);
    p = applyRadiatorSolution(p, room(name).id, solution, null);
  }
  p = applySplitSystem(p, [room("Camera").id], "Daikin", null);
  p = applyDuctedSystem(p, [room("Cucina").id], "Mitsubishi Electric", null);
  const system = p.hvacSystems.find((s) => s.type === "ducted")!;
  for (const [familyCode, use, points] of [
    ["EDLS", "supply", 2],
    ["EGQ", "return", 1],
  ] as const) {
    const family = airTerminalCatalog.families.find(
      (f) => f.familyCode === familyCode,
    )!;
    const solution = sizeAirTerminal(
      system.airflowM3h!,
      points,
      family,
      use,
    )[0];
    if (!solution)
      throw new Error(`No real terminal solution for ${familyCode}`);
    p = applyAirTerminalSolution(
      p,
      room("Cucina").id,
      system.id,
      use,
      familyCode,
      solution,
      "ceiling",
    );
  }
  // Put the products on the outside faces where their silhouettes remain legible.
  p.radiators = p.radiators.map((radiator) => {
    const r = p.rooms.find((entry) => entry.id === radiator.roomId)!;
    const wall = p.walls.find(
      (w) => r.wallIds.includes(w.id) && w.start.x === 0 && w.end.x === 0,
    )!;
    const span = roomWallSpan(r, wall)!;
    return {
      ...radiator,
      wallId: wall.id,
      position: positionAlongRoomWall(
        r,
        wall,
        span.lengthM / 2,
        radiator.depthMm / 1000,
      ),
      rotation: Math.atan2(
        span.end.y - span.start.y,
        span.end.x - span.start.x,
      ),
    };
  });
  const camera = room("Camera");
  p.hvacSystems = p.hvacSystems.map((s) =>
    s.type !== "split"
      ? s
      : {
          ...s,
          indoorUnits: s.indoorUnits.map((unit) => {
            const wall = p.walls.find(
              (w) =>
                camera.wallIds.includes(w.id) &&
                w.start.y === 0 &&
                w.end.y === 0,
            )!;
            const span = roomWallSpan(camera, wall)!;
            return {
              ...unit,
              wallId: wall.id,
              position: positionAlongRoomWall(
                camera,
                wall,
                span.lengthM / 2,
                unit.depthMm / 1000,
              ),
              rotation: Math.atan2(
                span.end.y - span.start.y,
                span.end.x - span.start.x,
              ),
            };
          }),
        },
  );
  p.openings = p.walls.flatMap<Project["openings"][number]>((wall) => {
    const length = Math.hypot(
      wall.end.x - wall.start.x,
      wall.end.y - wall.start.y,
    );
    if (wall.type === "INTERNO")
      return [
        {
          id: newId(),
          wallId: wall.id,
          floorId,
          offsetM: length / 2 - 0.45,
          widthM: 0.9,
          heightM: 2.1,
          sillHeightM: 0,
          type: "door" as const,
        },
      ];
    if (wall.start.y !== wall.end.y) return [];
    return [
      {
        id: newId(),
        wallId: wall.id,
        floorId,
        offsetM: length / 2 - 0.7,
        widthM: 1.4,
        heightM: 1.25,
        sillHeightM: 0.95,
        type: "window" as const,
      },
    ];
  });
  return projectSchema.parse(recomputeProject(p));
}

/** Additional real face styles, without filling unpublished body dimensions. */
export function realisticTerminalStyleFixture(
  familyCode: "EBLF" | "EVVMC" | "EGS",
) {
  let p = realisticProjectFixture();
  const room = p.rooms.find((r) => r.name === "Cucina")!;
  const system = p.hvacSystems.find((s) => s.type === "ducted")!;
  const family = airTerminalCatalog.families.find(
    (f) => f.familyCode === familyCode,
  )!;
  const solution = sizeAirTerminal(system.airflowM3h!, 2, family, "supply")[0];
  if (!solution) throw new Error(`No source-backed solution for ${familyCode}`);
  p = applyAirTerminalSolution(
    p,
    room.id,
    system.id,
    "supply",
    familyCode,
    solution,
    familyCode === "EVVMC" ? "ceiling" : "wall",
  );
  p.name = `Casa Staiano — terminali ${familyCode}`;
  return projectSchema.parse(p);
}
