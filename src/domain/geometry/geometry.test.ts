import { describe, expect, it } from "vitest";
import {
  addAdjacentRoom,
  addRectangle,
  addWall,
  createProject,
  mergeRooms,
  moveWall,
  recomputeProject,
  resizeRectangularRoom,
  resizeWall,
  updateRoom,
} from "@/domain/project";
import {
  area,
  calibratedScale,
  centroid,
  distance,
  selfIntersects,
  snapPoint,
} from "./primitives";
import { detectRoomFaces } from "./rooms";
import { calculateThermal } from "@/domain/thermal/calculate";
import { validateProject } from "@/domain/validation";
const rectangle = () => {
  const p = createProject();
  return addRectangle(p, p.floors[0].id, {
    width: 4.2,
    length: 3.8,
    height: 2.7,
    name: "Soggiorno",
  });
};
describe("geometria e creazione manuale", () => {
  it("snap parallelo e a45° conservano la direzione scelta e la distanza", () => {
    const wall = {
      ...rectangle().walls[0],
      start: { x: 0, y: 0 },
      end: { x: 4, y: 2 },
    };
    const options = {
      enabled: true,
      orthogonal: false,
      parallel: true,
      angle45: false,
      grid: false,
      stepM: 0.1,
      toleranceM: 0.15,
    };
    const anchor = { x: 10, y: 10 },
      point = { x: 14, y: 12.08 };
    const parallel = snapPoint(point, [wall], anchor, options).point;
    expect((parallel.y - anchor.y) / (parallel.x - anchor.x)).toBeCloseTo(
      0.5,
      8,
    );
    expect(distance(anchor, parallel)).toBeCloseTo(distance(anchor, point), 8);
    const diagonal = snapPoint({ x: 14, y: 13.97 }, [], anchor, {
      ...options,
      parallel: false,
      angle45: true,
    }).point;
    expect(diagonal.x - anchor.x).toBeCloseTo(diagonal.y - anchor.y, 8);
  });
  it("ogni parte di una stanza divisa eredita altezza e impianto originali", () => {
    const p = rectangle();
    const original = updateRoom(p, p.rooms[0].id, {
      heightM: 3.4,
      systemType: "ducted",
    });
    const divided = addWall(
      original,
      original.floors[0].id,
      { x: 2, y: 0 },
      { x: 2, y: 4.1 },
    );
    expect(divided.rooms).toHaveLength(2);
    expect(
      divided.rooms.every(
        (room) => room.heightM === 3.4 && room.systemType === "ducted",
      ),
    ).toBe(true);
    expect(
      divided.rooms.every(
        (room) => room.designLoadW === room.netAreaM2 * 3.4 * 35,
      ),
    ).toBe(true);
  });
  it("unione con altezze diverse richiede scelta esplicita e aggiorna volume/carico", () => {
    const p = rectangle();
    const adjacent = addAdjacentRoom(p, p.walls[1].id, 3, "Camera", 2.9);
    expect(() =>
      mergeRooms(adjacent, adjacent.rooms[0].id, adjacent.rooms[1].id),
    ).toThrow(/altezze diverse/);
    const merged = mergeRooms(
      adjacent,
      adjacent.rooms[0].id,
      adjacent.rooms[1].id,
      2.8,
    );
    expect(merged.rooms).toHaveLength(1);
    expect(merged.rooms[0].heightM).toBe(2.8);
    expect(merged.rooms[0].volumeM3).toBeCloseTo(
      merged.rooms[0].netAreaM2 * 2.8,
    );
    expect(merged.rooms[0].designLoadW).toBeCloseTo(
      merged.rooms[0].netAreaM2 * 2.8 * 35,
    );
  });
  it("calcola rettangolo e poligono irregolare", () => {
    expect(
      area([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 5 },
        { x: 0, y: 5 },
      ]),
    ).toBe(20);
    const p = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(area(p)).toBe(12);
    expect(centroid(p).x).toBeCloseTo(5 / 3);
  });
  it("usa dimensioni NETTE, contorno interno e altezza esplicita", () => {
    const p = rectangle(),
      r = p.rooms[0];
    expect(p.walls).toHaveLength(4);
    expect(p.rooms).toHaveLength(1);
    expect(r.netAreaM2).toBeCloseTo(15.96);
    expect(r.perimeterM).toBeCloseTo(16);
    expect(r.volumeM3).toBeCloseTo(43.092);
    expect(r.designLoadW).toBeCloseTo(1508.22);
    expect(area(p.walls.map((w) => w.start))).toBeGreaterThan(r.netAreaM2);
  });
  it("35 W/m³ fisso, nessun arrotondamento intermedio", () => {
    expect(calculateThermal(20, 2.7)).toEqual({
      volumeM3: 54,
      designLoadW: 1890,
    });
    expect(() => calculateThermal(0, 2.7)).toThrow();
  });
  it("aggiorna stanza e carico dopo modifica quote nette", () => {
    const p = rectangle(),
      old = p.rooms[0];
    const changed = resizeRectangularRoom(p, old.id, 5, 4);
    expect(changed.rooms[0].id).toBe(old.id);
    expect(changed.rooms[0].name).toBe("Soggiorno");
    expect(changed.rooms[0].netAreaM2).toBeCloseTo(20);
    expect(changed.rooms[0].designLoadW).toBeCloseTo(1890);
  });
  it("quote muro e spostamento mantengono connessioni", () => {
    let p = rectangle();
    const wall = p.walls[0];
    p = resizeWall(p, wall.id, 5);
    expect(distance(p.walls[0].start, p.walls[0].end)).toBeCloseTo(5);
    expect(p.rooms).toHaveLength(1);
    p = moveWall(p, wall.id, { x: 0, y: -0.5 });
    expect(p.rooms).toHaveLength(1);
    expect(p.rooms[0].netAreaM2).toBeGreaterThan(15.96);
  });
  it("altezza individuale e nomi persistono", () => {
    const p = rectangle(),
      next = updateRoom(p, p.rooms[0].id, { name: "Camera", heightM: 3 });
    const rebuilt = recomputeProject(next);
    expect(rebuilt.rooms[0].name).toBe("Camera");
    expect(rebuilt.rooms[0].designLoadW).toBeCloseTo(15.96 * 3 * 35);
  });
  it("contorno libero irregolare e muri inclinati chiudono stanza", () => {
    let p = createProject();
    const f = p.floors[0].id;
    const vertices = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 2 },
      { x: 3, y: 4 },
      { x: 0, y: 4 },
    ];
    for (let i = 0; i < vertices.length; i++)
      p = addWall(p, f, vertices[i], vertices[(i + 1) % vertices.length]);
    expect(p.rooms).toHaveLength(1);
    expect(p.rooms[0].polygon).toHaveLength(5);
    expect(p.rooms[0].netAreaM2).toBeLessThan(18);
    expect(p.rooms[0].netAreaM2).toBeGreaterThan(16);
  });
  it("contorno aperto mantiene ultima stanza come geometria non risolta", () => {
    const p = rectangle();
    const next = recomputeProject({ ...p, walls: p.walls.slice(0, 3) });
    expect(next.rooms).toHaveLength(1);
    expect(next.rooms[0].geometryStatus).toBe("unresolved");
    expect(
      validateProject(next).some(
        (c) =>
          (c.code === "closure" || c.code === "geometry") &&
          c.status !== "valid",
      ),
    ).toBe(true);
  });
  it("divisione e unione eliminano solo parete condivisa", () => {
    const p = rectangle(),
      f = p.floors[0].id;
    const divided = addWall(p, f, { x: 2, y: 0 }, { x: 2, y: 4.1 });
    expect(divided.rooms).toHaveLength(2);
    expect(divided.walls).toHaveLength(7);
    const merged = mergeRooms(
      divided,
      divided.rooms[0].id,
      divided.rooms[1].id,
    );
    expect(merged.rooms).toHaveLength(1);
    expect(merged.rooms[0].netAreaM2).toBeCloseTo(15.96);
  });
  it("ambiente adiacente con parete condivisa", () => {
    const p = rectangle(),
      next = addAdjacentRoom(p, p.walls[1].id, 3, "Camera", 2.9);
    expect(next.rooms).toHaveLength(2);
    expect(next.walls).toHaveLength(7);
    expect(next.rooms.find((r) => r.name === "Camera")?.netAreaM2).toBeCloseTo(
      3 * 3.8,
    );
    expect(
      validateProject(next).find((c) => c.code === "overlap")?.status,
    ).toBe("valid");
  });
  it("spessore cambiato modifica superficie netta", () => {
    const p = rectangle(),
      next = recomputeProject({
        ...p,
        walls: p.walls.map((w) => ({ ...w, thickness: 0.4 })),
      });
    expect(next.rooms[0].netAreaM2).toBeCloseTo(4.1 * 3.7);
  });
  it("scala calibrazione e snap estremi/ortogonale/segmenti", () => {
    expect(calibratedScale({ x: 0, y: 0 }, { x: 814, y: 0 }, 4.23)).toBeCloseTo(
      4.23 / 814,
    );
    expect(() => calibratedScale({ x: 0, y: 0 }, { x: 0, y: 0 }, 4)).toThrow();
    const p = rectangle(),
      options = {
        enabled: true,
        orthogonal: true,
        angle45: false,
        parallel: false,
        grid: true,
        stepM: 0.1,
        toleranceM: 0.12,
      };
    expect(snapPoint({ x: 0.04, y: 0.02 }, p.walls, null, options).kind).toBe(
      "estremo",
    );
    expect(snapPoint({ x: 2, y: 0.02 }, p.walls, null, options).kind).toBe(
      "segmento",
    );
    expect(
      snapPoint({ x: 3.1, y: 0.02 }, [], { x: 0, y: 0 }, options).point.y,
    ).toBeCloseTo(0);
  });
  it("con Snap disattivato i muri restano connessi e l'ambiente si chiude", () => {
    const options = {
      enabled: false,
      orthogonal: true,
      angle45: false,
      parallel: true,
      grid: true,
      stepM: 0.1,
      toleranceM: 0.12,
    };
    const p = rectangle();
    expect(snapPoint({ x: 0.04, y: 0.02 }, p.walls, null, options)).toEqual({
      point: p.walls[0].start,
      kind: "estremo",
    });
    expect(snapPoint({ x: 2, y: 0.02 }, p.walls, null, options)).toEqual({
      point: { x: 2, y: 0 },
      kind: "segmento",
    });
    let project = createProject();
    const floorId = project.floors[0].id;
    for (const [start, end] of [
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
      [
        { x: 4, y: 0 },
        { x: 4, y: 3 },
      ],
      [
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
    ])
      project = addWall(project, floorId, start, end);
    const click = (point: { x: number; y: number }) =>
      snapPoint(point, project.walls, null, options).point;
    // L'ultimo muro è disegnato a mano vicino, ma non sopra, ai due estremi.
    project = addWall(
      project,
      floorId,
      click({ x: 0.02, y: 0.03 }),
      click({ x: -0.03, y: 2.98 }),
    );
    expect(project.rooms).toHaveLength(1);
    expect(project.rooms[0].geometryStatus).toBe("closed");
  });
  it("auto-intersezioni riconosciute", () => {
    expect(
      selfIntersects([
        { x: 0, y: 0 },
        { x: 3, y: 3 },
        { x: 0, y: 3 },
        { x: 3, y: 0 },
      ]),
    ).toBe(true);
  });
  it("piani indipendenti, sovrapposizione verticale consentita", () => {
    const p = rectangle();
    const f = {
      ...p.floors[0],
      id: crypto.randomUUID(),
      name: "Primo",
      elevationM: 3,
    };
    const next = addRectangle({ ...p, floors: [...p.floors, f] }, f.id, {
      width: 4.2,
      length: 3.8,
      height: 2.7,
      name: "Camera",
    });
    expect(next.rooms).toHaveLength(2);
    expect(
      validateProject(next).find((c) => c.code === "overlap")?.status,
    ).toBe("valid");
  });
  it("muro pendente non distrugge stanza", () => {
    const p = rectangle();
    expect(
      detectRoomFaces([
        ...p.walls,
        {
          ...p.walls[0],
          id: "spur",
          start: { x: 2, y: 0 },
          end: { x: 2, y: 1 },
        },
      ]),
    ).toHaveLength(1);
  });
});
