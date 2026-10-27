import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { radiatorProducts } from "@/domain/catalogs/radiators";
import type { Project } from "@/schemas/project";
import {
  radiatorConnectionXs,
  radiatorDetail,
  type DetailPart,
} from "./device-detail";

const geometries = {
  tubes: new THREE.CylinderGeometry(1, 1, 1, 12),
  caps: new THREE.SphereGeometry(1, 12, 8),
  headers: new THREE.CylinderGeometry(1, 1, 1, 12),
  sections: new RoundedBoxGeometry(1, 1, 1, 2, 0.12),
  fins: new THREE.BoxGeometry(1, 1, 1),
  plugs: new THREE.CylinderGeometry(1, 1, 1, 12),
  mirrors: new THREE.PlaneGeometry(1, 1),
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

describe("mesh dei radiatori e ingombri di catalogo", () => {
  it("distinguishes Charleston welded heads and Global flat fronts, Oscar Tondo included", () => {
    for (const variant of radiatorProducts.filter(
      (p) =>
        p.manufacturer === "Global" ||
        (p.manufacturer === "Zehnder" && p.columns),
    )) {
      const item = {
        ...variant,
        elements: 10,
        widthMm: variant.pitchMm * 10 + variant.widthAdditionMm,
      };
      const detail = radiatorDetail(item, variant);
      if (variant.manufacturer === "Zehnder") {
        expect(detail.sections, variant.id).toHaveLength(20);
        expect(detail.tubes).toHaveLength(10 * variant.columns!);
      } else {
        expect(detail.fins).toHaveLength(20);
        expect(detail.caps).toHaveLength(0);
        const fronts = detail.sections.filter((p) => p.scale[2] === 0.016);
        expect(fronts).toHaveLength(10);
        expect(
          fronts.every((p) => p.scale[0] >= (variant.pitchMm - 2) / 1000),
        ).toBe(true);
      }
    }
  });
  it("reconstructs every Nova with its documented profile count, double rows and fins", () => {
    const products = radiatorProducts.filter(
      (p) => p.manufacturer === "Zehnder" && p.family.startsWith("Nova Easy"),
    );
    expect(products).toHaveLength(32);
    for (const variant of products) {
      const item = {
        ...variant,
        elements: 1,
        widthMm: variant.pitchMm,
      };
      const detail = radiatorDetail(item, variant);
      const count = Number(variant.widthNote.match(/(\d+) tubi verticali/)![1]);
      const double = /ZNVV|ZNVLV/.test(variant.code!);
      expect(detail.sections, variant.id).toHaveLength(
        count * (double ? 2 : 1),
      );
      expect(new Set(detail.sections.map((p) => p.position[0])).size).toBe(
        count,
      );
      expect(new Set(detail.sections.map((p) => p.position[2])).size).toBe(
        double ? 2 : 1,
      );
      expect(detail.fins.length > 0).toBe(/ZNVL/.test(variant.code!));
      expect(detail.headers).toHaveLength(2);
    }
  });
  it("reconstructs Lazzarini tube counts and the reversible Garda side collector pair", () => {
    const counts: Record<number, number> = {
      700: 17,
      1132: 25,
      1708: 35,
      690: 14,
      803: 17,
      1110: 22,
      1230: 25,
      1420: 28,
      1703: 35,
    };
    const products = radiatorProducts.filter(
      (p) =>
        p.manufacturer === "Lazzarini" && /^(Garda|Sanremo) /.test(p.family),
    );
    expect(products).toHaveLength(57);
    for (const variant of products) {
      const item = {
        ...variant,
        elements: 1,
        widthMm: variant.pitchMm,
      };
      const detail = radiatorDetail(item, variant);
      expect(
        detail.tubes.filter((p) => !!p.rotation),
        variant.id,
      ).toHaveLength(counts[variant.heightMm]);
      expect(detail.tubes).toHaveLength(counts[variant.heightMm] + 2);
      if (variant.family.startsWith("Garda ")) {
        const xs = radiatorConnectionXs(item, variant);
        expect(xs[1] - xs[0]).toBeCloseTo(0.05, 8);
        expect(xs[0]).toBeGreaterThan(0);
        expect(detail.tubes.slice(0, 2).map((p) => p.position[0])).toEqual(xs);
      }
    }
  });
  it.each([2, 3, 4, 5, 6])(
    "Ardesia %i colonne uses the documented 25 mm tubes and 46 mm element pitch",
    (columns) => {
      const variant = radiatorProducts.find(
        (v) =>
          v.manufacturer === "Cordivari" &&
          v.family === `Ardesia ${columns} colonne` &&
          v.heightMm === 600,
      )!;
      const item = {
        manufacturer: variant.manufacturer,
        family: variant.family,
        elements: 10,
        widthMm: 10 * variant.pitchMm + variant.widthAdditionMm,
        heightMm: variant.heightMm,
        depthMm: variant.depthMm,
      } as Project["radiators"][number];
      const detail = radiatorDetail(item, variant);
      expect(
        detail.plugs.every(
          (plug) =>
            Math.abs(plug.position[1] - variant.interaxisMm / 2000) < 1e-8,
        ),
      ).toBe(true);
      expect(
        detail.plugs.every(
          (plug) =>
            Math.abs(
              Math.abs(plug.position[0]) - (10 * variant.pitchMm) / 2000,
            ) < 1e-8,
        ),
      ).toBe(true);
      expect(detail.tubes).toHaveLength(10 * columns);
      expect(
        detail.tubes.every(
          (part) =>
            Math.abs(part.scale[0] * 2000 - 25) < 1e-7 &&
            Math.abs(part.scale[2] * 2000 - 25) < 1e-7,
        ),
      ).toBe(true);
      const x = [...new Set(detail.tubes.map((part) => part.position[0]))].sort(
        (a, b) => a - b,
      );
      const z = [...new Set(detail.tubes.map((part) => part.position[2]))].sort(
        (a, b) => a - b,
      );
      for (let i = 1; i < x.length; i++)
        expect((x[i] - x[i - 1]) * 1000).toBeCloseTo(46, 6);
      for (let i = 1; i < z.length; i++)
        expect((z[i] - z[i - 1]) * 1000).toBeCloseTo(41, 6);
    },
  );

  it("uses the documented 4/6 vertical profiles and central mirror for every Empoli finish", () => {
    for (const variant of radiatorProducts.filter(
      (v) => v.manufacturer === "Lazzarini" && v.family.startsWith("Empoli "),
    )) {
      const item = {
        family: variant.family,
        manufacturer: variant.manufacturer,
        elements: 1,
        widthMm: variant.pitchMm,
        heightMm: variant.heightMm,
        depthMm: variant.depthMm,
      } as Project["radiators"][number];
      const detail = radiatorDetail(item, variant);
      expect(detail.sections).toHaveLength(variant.pitchMm === 600 ? 4 : 6);
      expect(
        detail.sections.every(
          (part) => part.scale[0] === 0.07 && part.scale[2] === 0.011,
        ),
      ).toBe(true);
      expect(detail.tubes).toHaveLength(0);
      expect(detail.mirrors).toHaveLength(1);
      expect(detail.mirrors[0].scale[0]).toBeCloseTo(0.3);
    }
  });
  it("draws Cordivari Tamara as separate oval tubes without round collectors, as in the photo", () => {
    const variants = radiatorProducts.filter((p) =>
      p.family.startsWith("Tamara"),
    );
    expect(variants.length).toBeGreaterThan(0);
    for (const variant of variants) {
      const elements = variant.commercialElementCounts[0];
      const item = {
        manufacturer: variant.manufacturer,
        family: variant.family,
        elements,
        widthMm: variant.pitchMm * elements + variant.widthAdditionMm,
        heightMm: variant.heightMm,
        depthMm: variant.depthMm,
      } as Project["radiators"][number];
      const detail = radiatorDetail(item, variant);
      expect(detail.tubes, variant.id).toHaveLength(elements);
      expect(detail.headers, variant.id).toHaveLength(0);
      expect(detail.tubes[0].scale[0], variant.id).toBeGreaterThan(
        detail.tubes[0].scale[2],
      );
      // The cylinder length is scale[1]: tube plus the two round ends must span the full height.
      expect(
        detail.tubes[0].scale[1] + detail.tubes[0].scale[2] * 2,
        variant.id,
      ).toBeCloseTo(variant.heightMm / 1000, 6);
    }
  });
  it("groups Cordivari Naike/Anna/Lucy bars in bands and draws Samira as flat slats, as in the photos", () => {
    const detailOf = (family: string) => {
      const variant = radiatorProducts.find(
        (p) => p.manufacturer === "Cordivari" && p.family === family,
      )!;
      const item = {
        manufacturer: variant.manufacturer,
        family: variant.family,
        elements: 1,
        widthMm: variant.pitchMm + variant.widthAdditionMm,
        heightMm: variant.heightMm,
        depthMm: variant.depthMm,
      } as Project["radiators"][number];
      return radiatorDetail(item, variant);
    };
    const gaps = (family: string) => {
      const ys = detailOf(family)
        .tubes.filter((t) => t.rotation)
        .map((t) => t.position[1])
        .sort((a, b) => a - b);
      const steps = ys.slice(1).map((y, i) => y - ys[i]);
      return steps.filter((s) => s > Math.min(...steps) * 1.5).length;
    };
    expect(gaps("Naike Square")).toBe(4);
    expect(gaps("Claudia Elite")).toBe(0);
    const samira = detailOf("Samira");
    expect(samira.sections.length).toBeGreaterThan(5);
    expect(samira.tubes.filter((t) => t.rotation)).toHaveLength(0);
  });
  it("keeps all 939 catalogue variants inside their declared enclosure", () => {
    for (const variant of radiatorProducts) {
      const elements = variant.commercialElementCounts[0];
      const item = {
        manufacturer: variant.manufacturer,
        family: variant.family,
        elements,
        widthMm: variant.pitchMm * elements + variant.widthAdditionMm,
        heightMm: variant.heightMm,
        depthMm: variant.depthMm,
      } as Project["radiators"][number];
      const detail = radiatorDetail(item, variant),
        bounds = new THREE.Box3();
      for (const key of Object.keys(geometries) as (keyof typeof geometries)[])
        bounds.union(boundsOf(detail[key], geometries[key]));
      const half = [item.widthMm, item.heightMm, item.depthMm].map(
        (value) => value / 2000,
      );
      expect(bounds.isEmpty(), variant.id).toBe(false);
      for (let axis = 0; axis < 3; axis++) {
        expect(
          bounds.min.getComponent(axis),
          variant.id,
        ).toBeGreaterThanOrEqual(-half[axis] - 1e-7);
        expect(bounds.max.getComponent(axis), variant.id).toBeLessThanOrEqual(
          half[axis] + 1e-7,
        );
      }
    }
  });
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

it("keeps illustrative plugs inside a manually narrowed historic Ardesia footprint", () => {
  const variant = radiatorProducts.find(
    (product) => product.id === "cordivari-ardesia-2-600",
  )!;
  const item = {
    manufacturer: variant.manufacturer,
    family: variant.family,
    elements: 10,
    widthMm: 400,
    heightMm: 600,
    depthMm: 66,
  } as Project["radiators"][number];
  const detail = radiatorDetail(item, variant),
    bounds = boundsOf(detail.plugs, geometries.plugs);
  expect(bounds.min.x).toBeGreaterThanOrEqual(-0.2 - 1e-8);
  expect(bounds.max.x).toBeLessThanOrEqual(0.2 + 1e-8);
  expect(item.widthMm).toBe(400);
});
