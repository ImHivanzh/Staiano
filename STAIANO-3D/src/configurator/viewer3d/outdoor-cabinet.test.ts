import { Children, isValidElement } from "react";
import { Box3, BufferGeometry, Group, Mesh } from "three";
import { expect, it } from "vitest";
import { splitCatalog } from "@/domain/catalogs/splits";
import { vrvCatalog } from "@/domain/catalogs/vrv";
import { heatPumpCatalog } from "@/domain/catalogs/heat-pumps";
import { OutdoorCabinet } from "./OutdoorCabinet";
import { OutdoorFan } from "./OutdoorFan";

it("reconstructs screened Altherma fronts and single/double fan Versati casings", () => {
  const countFans = (element: unknown): number => {
    if (!isValidElement<{ children?: unknown }>(element)) return 0;
    if (element.type === OutdoorFan) return 1;
    return Children.toArray(
      element.props.children as import("react").ReactNode,
    ).reduce<number>((sum, child) => sum + countFans(child), 0);
  };
  expect(
    countFans(
      OutdoorCabinet({
        widthM: 1.003,
        heightM: 1.27,
        depthM: 0.533,
        family: "Altherma 3 H HT",
      }),
    ),
  ).toBe(0);
  expect(
    countFans(
      OutdoorCabinet({
        widthM: 1.206,
        heightM: 0.88,
        depthM: 0.445,
        family: "VERSATI V",
      }),
    ),
  ).toBe(1);
  expect(
    countFans(
      OutdoorCabinet({
        widthM: 0.943,
        heightM: 1.615,
        depthM: 0.445,
        family: "VERSATI V",
      }),
    ),
  ).toBe(2);
});

it("keeps the physical casing and feet inside the complete published enclosure for all 162 outdoor units", () => {
  const products = [
    ...splitCatalog.outdoorUnits,
    ...vrvCatalog.outdoorUnits,
    ...heatPumpCatalog.products,
  ];
  expect(products).toHaveLength(170);
  for (const product of products) {
    const w = product.widthMm / 1000,
      h = product.heightMm / 1000,
      d = product.depthMm / 1000;
    const rendered = OutdoorCabinet({ widthM: w, heightM: h, depthM: d });
    const physical = new Group();
    Children.forEach(rendered.props.children, (child) => {
      if (
        !isValidElement<{
          geometry: BufferGeometry;
          position: [number, number, number];
          scale: [number, number, number];
        }>(child) ||
        child.type !== "mesh"
      )
        return;
      const mesh = new Mesh(child.props.geometry);
      mesh.position.fromArray(child.props.position);
      mesh.scale.fromArray(child.props.scale);
      physical.add(mesh);
    });
    expect(physical.children).toHaveLength(3);
    const enclosure = new Box3().setFromObject(physical);
    for (const [min, max, nominal] of [
      [enclosure.min.x, enclosure.max.x, w],
      [enclosure.min.y, enclosure.max.y, h],
      [enclosure.min.z, enclosure.max.z, d],
    ]) {
      expect(min, product.model).toBeCloseTo(-nominal / 2, 6);
      expect(max, product.model).toBeCloseTo(nominal / 2, 6);
    }
    const body = new Box3().setFromObject(physical.children[0]);
    for (const foot of physical.children.slice(1))
      expect(new Box3().setFromObject(foot).max.y).toBeCloseTo(body.min.y, 6);
    expect(
      new Set(physical.children.map((child) => (child as Mesh).geometry)).size,
    ).toBe(1);
  }
});
