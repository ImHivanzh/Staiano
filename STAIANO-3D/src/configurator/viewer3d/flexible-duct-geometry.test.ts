import { expect, it } from "vitest";
import * as THREE from "three";
import {
  flexibleDuctGeometry,
  flexibleFoilTexture,
} from "./flexible-duct-geometry";

it.each([0, 13, 25])(
  "keeps an open Ø160 bore and exact mouth circles with %s mm insulation",
  (insulation) => {
    const start = new THREE.Vector3(1, 2, 3),
      end = new THREE.Vector3(2, 4, 6);
    const curve = new THREE.LineCurve3(start, end);
    const shape = flexibleDuctGeometry(curve, 160, insulation);
    const positions = (shape.liner ?? shape.foil).getAttribute("position");
    for (const [point, offset] of [
      [start, 0],
      [end, positions.count - 25],
    ] as const) {
      const centre = new THREE.Vector3();
      for (let i = 0; i < 24; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(
          positions,
          offset + i,
        );
        expect(vertex.distanceTo(point)).toBeCloseTo(0.08, 6);
        expect(
          vertex.clone().sub(point).dot(end.clone().sub(start).normalize()),
        ).toBeCloseTo(0, 6);
        centre.add(vertex);
      }
      expect(centre.divideScalar(24).distanceTo(point)).toBeLessThan(1e-6);
    }
    expect(shape.innerRadius).toBe(0.08);
    expect(shape.ends).toHaveLength(insulation > 0 ? 2 : 0);
    expect(
      (shape.liner ?? shape.foil).groups.some(
        (group) => group.materialIndex === 1,
      ),
    ).toBe(true);
    if (insulation > 0) {
      expect(shape.cutback).toBeCloseTo(0.02);
      const first = new THREE.Vector3().fromBufferAttribute(
        shape.foil.getAttribute("position"),
        0,
      );
      const foilMouth = curve.getPointAt(0.02 / curve.getLength());
      expect(first.distanceTo(foilMouth)).toBeCloseTo(
        0.08 + insulation / 1000,
        6,
      );
    }
    shape.foil.dispose();
    shape.liner?.dispose();
    shape.ends.forEach((end) => end.dispose());
  },
);

it("rejects invalid dimensions and has a non-flat, tileable foil map", () => {
  const curve = new THREE.LineCurve3(
    new THREE.Vector3(),
    new THREE.Vector3(1, 0, 0),
  );
  expect(() => flexibleDuctGeometry(curve, 0, 25)).toThrow();
  expect(() => flexibleDuctGeometry(curve, 160, -1)).toThrow();
  const texture = flexibleFoilTexture();
  expect(new Set(texture.image.data).size).toBeGreaterThan(50);
  expect(texture.wrapS).toBe(THREE.RepeatWrapping);
  texture.dispose();
});
