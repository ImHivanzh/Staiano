import { expect, it } from "vitest";
import * as THREE from "three";
import type { Wall } from "@/schemas/project";
import { doorThresholdGeometry } from "./door-threshold-geometry";

const wall: Wall = {
  id: "wall",
  floorId: "floor",
  start: { x: 1, y: 2 },
  end: { x: 1, y: 4 },
  thickness: 0.1,
  type: "INTERNO",
  height: 2.7,
  locked: false,
};

it("covers the entire door opening and wall depth at the finished floor height", () => {
  const geometry = doorThresholdGeometry(wall, { left: 0.5, right: 1.4 }, 1.7);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const size = bounds.getSize(new THREE.Vector3());
  expect(size.x).toBeCloseTo(0.9, 5);
  expect(size.y).toBeCloseTo(0.067, 5);
  expect(size.z).toBeCloseTo(0.112, 5);
  expect(bounds.min.y).toBeCloseTo(-0.0575, 4);
  expect(bounds.max.y).toBeCloseTo(0.0095, 4);
  geometry.dispose();
});

it("aligns the threshold top texture to the floor's world coordinates", () => {
  const period = 1.7,
    geometry = doorThresholdGeometry(wall, { left: 0.5, right: 1.4 }, period),
    positions = geometry.getAttribute("position"),
    normals = geometry.getAttribute("normal"),
    uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++)
    if (normals.getY(i) > 0.5) {
      const worldX = wall.start.x - positions.getZ(i),
        worldZ = wall.start.y + positions.getX(i);
      expect(uv.getX(i)).toBeCloseTo(worldX / period);
      expect(uv.getY(i)).toBeCloseTo(-worldZ / period);
    }
  geometry.dispose();
});
