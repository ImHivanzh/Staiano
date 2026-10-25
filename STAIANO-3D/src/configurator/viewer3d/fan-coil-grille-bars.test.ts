import { expect, it } from "vitest";
import * as THREE from "three";
import { createFanCoilGrilleBars } from "./FanCoilMeshes";

it("reconstructs the six longitudinal discharge slats of the Aermec-style cover", () => {
  const material = new THREE.MeshStandardMaterial();
  const bars = createFanCoilGrilleBars({
    faceW: 0.8,
    faceH: 0.5,
    faceD: 0.22,
    ceiling: false,
    finCount: 4,
    returnHeight: 0.04,
    returnY: -0.21,
    grilleZ: 0.1103,
    material,
    longitudinal: true,
  });
  expect(bars.count).toBe(10);
  const matrix = new THREE.Matrix4();
  bars.getMatrixAt(9, matrix);
  expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBe(0);
  expect(new THREE.Vector3().setFromMatrixScale(matrix).x).toBeCloseTo(
    0.8 * 0.86,
  );
  bars.dispose();
  material.dispose();
});

it("instances wall return and discharge bars in one mesh", () => {
  const material = new THREE.MeshStandardMaterial();
  const bars = createFanCoilGrilleBars({
    faceW: 0.772,
    faceH: 0.754,
    faceD: 0.03,
    ceiling: false,
    finCount: 8,
    returnHeight: 0.14326,
    returnY: -0.23374,
    grilleZ: 0.0633,
    material,
  });
  const first = new THREE.Matrix4(),
    last = new THREE.Matrix4();
  bars.getMatrixAt(0, first);
  bars.getMatrixAt(bars.count - 1, last);
  expect(bars.count).toBe(26);
  expect(new THREE.Vector3().setFromMatrixPosition(first).z).toBeCloseTo(
    0.0633,
  );
  expect(new THREE.Vector3().setFromMatrixPosition(last).x).toBeCloseTo(
    0.772 * 0.41,
  );
  bars.dispose();
  material.dispose();
});

it("uses three supply bars for a ceiling-mounted panel", () => {
  const material = new THREE.MeshStandardMaterial();
  const bars = createFanCoilGrilleBars({
    faceW: 0.707,
    faceH: 0.723,
    faceD: 0.03,
    ceiling: true,
    finCount: 4,
    returnHeight: 0.17352,
    returnY: -0.20967,
    grilleZ: 0.0633,
    material,
  });
  const last = new THREE.Matrix4();
  bars.getMatrixAt(6, last);
  expect(bars.count).toBe(7);
  expect(new THREE.Vector3().setFromMatrixPosition(last).y).toBeCloseTo(
    0.723 * (0.292 + 2 * 0.034),
  );
  bars.dispose();
  material.dispose();
});
