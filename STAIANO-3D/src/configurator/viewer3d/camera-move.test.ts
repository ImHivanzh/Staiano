import { expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { cameraMoveVector, type CameraMoveKeys } from "./camera-move";

const none: CameraMoveKeys = {
  forward: false,
  back: false,
  left: false,
  right: false,
  up: false,
  down: false,
};

function move(keys: Partial<CameraMoveKeys>, top = false) {
  const camera = new PerspectiveCamera();
  camera.position.set(0, top ? 10 : 0, top ? 0.0001 : 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return cameraMoveVector(camera, new Vector3(0, 0, 0), { ...none, ...keys }, 2);
}

it("moves horizontally relative to the view and vertically with Q/E", () => {
  expect(move({ forward: true }).toArray()).toEqual([0, 0, -2]);
  expect(move({ back: true }).toArray()).toEqual([0, 0, 2]);
  expect(move({ left: true }).toArray()).toEqual([-2, 0, 0]);
  expect(move({ right: true }).toArray()).toEqual([2, 0, 0]);
  expect(move({ up: true }).toArray()).toEqual([0, 2, 0]);
  expect(move({ down: true }).toArray()).toEqual([0, -2, 0]);
  expect(move({}).toArray()).toEqual([0, 0, 0]);
});

it("keeps diagonal speed constant and maps W to screen-up in top view", () => {
  const diagonal = move({ forward: true, right: true });
  expect(diagonal.length()).toBeCloseTo(2);
  expect(diagonal.x).toBeCloseTo(Math.SQRT2);
  expect(diagonal.z).toBeCloseTo(-Math.SQRT2);
  const top = move({ forward: true }, true);
  expect(top.x).toBeCloseTo(0);
  expect(top.z).toBeCloseTo(-2);
  expect(move({ right: true }, true).x).toBeCloseTo(2);
});
