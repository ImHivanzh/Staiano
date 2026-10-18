import { expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import { pdfQaFixture } from "../../../scripts/verification/pdf-fixture";
import { ductRoute } from "@/domain/ducted/routes";
import { hydronicPipeRoute } from "@/domain/hydronic/routes";
import {
  floorRoutingPolygons,
  indoorRoute,
  nearestIndoorPoint,
  segmentInsideFloor,
} from "./indoor-route";

function fixture() {
  const empty = createProject();
  const project = addRectangle(empty, empty.floors[0].id, {
    width: 6,
    length: 6,
    height: 2.7,
    name: "Casa",
  });
  project.walls = [];
  project.rooms[0].polygon = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 6 },
    { x: 4, y: 6 },
    { x: 4, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 6 },
    { x: 0, y: 6 },
  ];
  return project;
}

it("routes around a courtyard when both automatic elbows would leave the house", () => {
  const p = fixture(),
    floorId = p.floors[0].id;
  const start = { x: 1, y: 5 },
    end = { x: 5, y: 5 };
  const polygons = floorRoutingPolygons(p, floorId);
  expect(segmentInsideFloor(start, end, polygons)).toBe(false);
  const path = indoorRoute(p, floorId, start, end);
  expect(path[0]).toEqual(start);
  expect(path.at(-1)).toEqual(end);
  expect(path.some((point) => point.y <= 2)).toBe(true);
  expect(
    path
      .slice(1)
      .every((point, i) => segmentInsideFloor(path[i], point, polygons)),
  ).toBe(true);
});

it("refuses disconnected buildings and keeps the exterior connection at the nearest entry", () => {
  const p = fixture(),
    floorId = p.floors[0].id;
  p.rooms.push({
    ...p.rooms[0],
    id: "separate",
    polygon: [
      { x: 10, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 2 },
      { x: 10, y: 2 },
    ],
  });
  expect(indoorRoute(p, floorId, { x: 1, y: 1 }, { x: 11, y: 1 })).toEqual([]);
  expect(nearestIndoorPoint(p, floorId, { x: 1, y: -1 })).toEqual({
    x: 1,
    y: 0,
  });
  // A collinear boundary must not bridge the outdoor gap.
  expect(
    segmentInsideFloor(
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      floorRoutingPolygons(p, floorId),
    ),
  ).toBe(false);
});

it("keeps generated ducts and the interior part of hydronic pipes inside the actual floor", () => {
  const p = pdfQaFixture();
  for (const system of p.hydronicSystems!) {
    system.pipeWaypoints = [];
    // The PDF fixture deliberately saves an exterior manual route across separate buildings.
    const coil = p.fanCoils!.find((unit) => unit.id === system.fanCoilIds[0])!;
    system.outdoorUnit.position = { x: coil.position.x, y: -1 };
  }
  const polygons = floorRoutingPolygons(p, p.floors[0].id);
  const routes = p.ducts!.map((duct) => ductRoute(p, duct));
  for (const system of p.hydronicSystems!)
    for (const id of system.fanCoilIds) {
      const pipe = hydronicPipeRoute(p, system, id);
      expect(pipe[0]).toMatchObject(system.outdoorUnit.position);
      // Only the connection from the outdoor pump to the building is exterior.
      routes.push(pipe.slice(1));
    }
  for (const route of routes) {
    expect(route.length).toBeGreaterThan(1);
    expect(
      route
        .slice(1)
        .every((point, i) => segmentInsideFloor(route[i], point, polygons)),
    ).toBe(true);
  }
});
