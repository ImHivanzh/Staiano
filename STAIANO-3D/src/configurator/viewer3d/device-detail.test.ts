import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { radiatorProducts } from "@/domain/catalogs/radiators";
import type { Project } from "@/schemas/project";
import { radiatorDetail, type DetailPart } from "./device-detail";

const geometries = {
  tubes: new THREE.CylinderGeometry(1, 1, 1, 12),
  caps: new THREE.SphereGeometry(1, 12, 8),
  headers: new THREE.CylinderGeometry(1, 1, 1, 12),
  sections: new RoundedBoxGeometry(1, 1, 1, 2, 0.12),
  fins: new THREE.BoxGeometry(1, 1, 1),
  plugs: new THREE.CylinderGeometry(1, 1, 1, 12),
};

function boundsOf(parts: DetailPart[], geometry: THREE.BufferGeometry) {
  const bounds = new THREE.Box3();
  const transform = new THREE.Object3D();
  for (const part of parts) {
    transform.position.set(...part.position);
    transform.scale.set(...part.scale);
    transform.rotation.set(...(part.rotation ?? [0, 0, 0]));
    transform.updateMatrix();
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++)
      bounds.expandByPoint(
        new THREE.Vector3()
          .fromBufferAttribute(position, i)
          .applyMatrix4(transform.matrix),
      );
  }
  return bounds;
}

describe("mesh realistiche e ingombri certificati dei radiatori", () => {
  for (const family of [
    2,
    3,
    4,
    5,
    6,
    "VIP",
    "Oscar",
    "OSCAR TONDO",
  ] as const) {
    it(`mantiene larghezza, altezza e profondità: ${family}`, () => {
      const variant = radiatorProducts.find((v) =>
        typeof family === "number"
          ? v.columns === family
          : v.family.toLowerCase() === family.toLowerCase(),
      )!;
      expect(variant).toBeDefined();
      const item = {
        manufacturer: variant.manufacturer,
        family: variant.family,
        elements: 10,
        widthMm: variant.pitchMm * 10 + variant.widthAdditionMm,
        heightMm: variant.heightMm,
        depthMm: variant.depthMm,
      } as Project["radiators"][number];
      const detail = radiatorDetail(item, variant);
      if (typeof family === "number")
        expect(detail.tubes).toHaveLength(10 * family);
      const bounds = new THREE.Box3();
      for (const key of Object.keys(geometries) as (keyof typeof geometries)[])
        bounds.union(boundsOf(detail[key], geometries[key]));
      const dimensions = bounds.getSize(new THREE.Vector3());
      expect(dimensions.x).toBeCloseTo(item.widthMm / 1000, 6);
      expect(dimensions.y).toBeCloseTo(item.heightMm / 1000, 6);
      expect(dimensions.z).toBeCloseTo(item.depthMm / 1000, 6);
    });
  }
});
