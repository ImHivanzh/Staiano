import { expect, it } from "vitest";
import { foundationGeometry, groundTexture } from "./site-geometry";

it("grounds the measured footprint without filling the courtyard", () => {
  const polygon = [
    { x: 2, y: 3 },
    { x: 8, y: 3 },
    { x: 8, y: 5 },
    { x: 4, y: 5 },
    { x: 4, y: 9 },
    { x: 2, y: 9 },
  ];
  const geometry = foundationGeometry(polygon);
  geometry.computeBoundingBox();
  expect(geometry.boundingBox!.min.toArray()).toEqual(
    expect.arrayContaining([2, 3]),
  );
  expect(geometry.boundingBox!.min.y).toBeCloseTo(-0.337);
  expect(geometry.boundingBox!.max.y).toBeCloseTo(-0.057);
  expect(geometry.boundingBox!.max.x).toBe(8);
  expect(geometry.boundingBox!.max.z).toBe(9);
  geometry.dispose();
  const texture = groundTexture();
  expect(texture.image.data!.length).toBe(256 * 256 * 4);
  expect([...texture.image.data!].every(Number.isFinite)).toBe(true);
  texture.dispose();
});
