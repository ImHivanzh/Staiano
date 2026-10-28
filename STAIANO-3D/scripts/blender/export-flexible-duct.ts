/** Export the actual viewer hose meshes to an editable Blender design. Run with tsx. */
import { mkdirSync, writeFileSync } from "node:fs";
import { flexibleDuctCurve } from "../../src/domain/ducted/flexible-curve";
import { flexibleDuctGeometry, flexibleFoilTexture } from "../../src/configurator/viewer3d/flexible-duct-geometry";

const texture = flexibleFoilTexture();
const examples = [
  { name: "diritto", points: [{ x: 0, y: 0, elevationM: 0 }, { x: 0, y: 1, elevationM: 0 }] },
  { name: "curva", points: [{ x: 0, y: 0, elevationM: 0 }, { x: 0, y: 1, elevationM: 0 }, { x: 1, y: 1, elevationM: 0 }] },
].map((example) => {
  const path = flexibleDuctCurve(example.points, 160);
  if (!path) throw new Error("Invalid reference hose route");
  const shape = flexibleDuctGeometry(path.curve, 160, 25);
  const meshes = [{ name: "Guaina", geometry: shape.foil }, { name: "Tubo_interno", geometry: shape.liner! },
    ...shape.ends.map((geometry, i) => ({ name: `Isolante_${i}`, geometry }))].map(({ name, geometry }) => ({
      name, positions: Array.from(geometry.getAttribute("position").array),
      uv: Array.from(geometry.getAttribute("uv").array), indices: Array.from(geometry.index!.array), groups: geometry.groups,
    }));
  return { name: example.name, diameterMm: 160, insulationMm: 25, length: shape.length,
    repeat: [shape.length / .2, Math.PI * 2 * shape.outerRadius / .2], meshes,
    mouths: [0, 1].map((t) => ({ point: path.curve.getPointAt(t).toArray(),
      normal: path.curve.getTangentAt(t).multiplyScalar(t === 0 ? -1 : 1).toArray() })) };
});
mkdirSync("output/verifiche-realismo", { recursive: true });
writeFileSync("output/verifiche-realismo/flexible-duct-design.json", JSON.stringify({
  texture: { width: 128, height: 128, pixels: Array.from(texture.image.data!) }, examples,
}));
console.log(examples.map(({ name, diameterMm, insulationMm, length }) => ({ name, diameterMm, insulationMm, length })));
texture.dispose();
