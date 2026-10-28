import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { Box3, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import shells from "../../../public/models/outdoor/manifest.json";
import { splitCatalog } from "./splits";
import { vrvCatalog } from "./vrv";
import { outdoorFanLayout, outdoorFanPlate, outdoorShellClass, outdoorShellUrl } from "./outdoor-shells";

it("assigns every split and VRV outdoor unit to an existing casing model", () => {
  const seen = new Set<string>();
  for (const unit of [...splitCatalog.outdoorUnits, ...vrvCatalog.outdoorUnits]) {
    const shell = outdoorShellClass(unit.widthMm / 1000, unit.heightMm / 1000);
    seen.add(shell);
    expect(existsSync(`public${outdoorShellUrl(shell)}`), unit.model).toBe(true);
  }
  expect([...seen].sort()).toEqual(["alta", "compatta", "larga"]);
});

it.each(shells)("loads the $shell casing with valves, coil guards and its reference envelope", async (shell) => {
  const bytes = readFileSync(`public${shell.url}`);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  const names: string[] = [];
  gltf.scene.traverse((object) => { names.push(object.name); }); // boolean-cut parts export as named groups
  for (const part of ["Carcassa", "Valvola_rame", "Lamella_batteria", "Basamento_longherina", "Pannello_ventola"])
    expect(names.some((name) => name.startsWith(part)), part).toBe(true);
  const size = new Box3().setFromObject(gltf.scene).getSize(new Vector3());
  // The viewer places the fans from outdoorFanPlate: it must match the plate drawn in the model.
  let plateObject: Object3D | undefined;
  gltf.scene.traverse((object) => { if (!plateObject && object.name.startsWith("Pannello_ventola")) plateObject = object; });
  const plateBox = new Box3().setFromObject(plateObject!);
  const plate = outdoorFanPlate(shell.referenceMm[0] / 1000);
  expect(plateBox.min.x - new Box3().setFromObject(gltf.scene).getCenter(new Vector3()).x).toBeCloseTo(plate.left, 2);
  expect(plateBox.max.x - plateBox.min.x).toBeCloseTo(plate.width, 2);
  // Fan plate and rear coil guard stand proud of the casing.
  expect(Math.abs(size.x - shell.referenceMm[0] / 1000)).toBeLessThan(0.004);
  expect(Math.abs(size.y - shell.referenceMm[1] / 1000)).toBeLessThan(0.004);
  expect(Math.abs(size.z - shell.referenceMm[2] / 1000)).toBeLessThan(0.008);
});

it("keeps the fan plate inside the casing width", () => {
  for (const w of [0.7, 0.83, 1.02, 1.345, 1.615]) {
    const plate = outdoorFanPlate(w);
    expect(plate.left).toBeGreaterThan(-w / 2);
    expect(plate.left + plate.width).toBeLessThan(w / 2);
  }
});

it("fits the fans of every catalogue outdoor unit inside the fan plate and the casing, without overlap or the valve notch", () => {
  for (const unit of [...splitCatalog.outdoorUnits, ...vrvCatalog.outdoorUnits]) {
    const w = unit.widthMm / 1000, h = unit.heightMm / 1000;
    const plate = outdoorFanPlate(w), { radius, centres, footHeight } = outdoorFanLayout(w, h);
    expect(radius, unit.model).toBeGreaterThan(0.08);
    centres.forEach(([x, y], index) => {
      expect(x - radius, unit.model).toBeGreaterThanOrEqual(plate.left);
      expect(x + radius, unit.model).toBeLessThanOrEqual(plate.left + plate.width);
      expect(y - radius, unit.model).toBeGreaterThanOrEqual(-h / 2 + footHeight);
      expect(y + radius, unit.model).toBeLessThanOrEqual(h / 2 - 0.016);
      // the service-valve notch occupies the right-hand 12 % of the front
      expect(x + radius, unit.model).toBeLessThan(w / 2 - w * 0.12);
      for (const [x2, y2] of centres.slice(index + 1)) expect(Math.hypot(x - x2, y - y2), unit.model).toBeGreaterThanOrEqual(2 * radius);
    });
  }
});
