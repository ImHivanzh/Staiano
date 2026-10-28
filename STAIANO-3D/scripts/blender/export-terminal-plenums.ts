/** Export the actual parametric viewer sheets for editable Blender references. Run with tsx. */
import { mkdirSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { attachedPlenumFaces, type PlenumOpening, type PlenumShellPort } from "../../src/configurator/viewer3d/plenum-shell";
import { airTerminalCatalog } from "../../src/domain/catalogs/air-terminals";
import { terminalPlenumSpecification } from "../../src/domain/air-terminals/commercial-bom";

const family = airTerminalCatalog.families.find((f) => f.familyCode === "EDSC-C")!;
const variant = family.variants.find((v) => v.nominalDiameterMm === 125)!;
const spec = terminalPlenumSpecification("EDSC-C", variant)!;
if (!spec?.lengthMm || !spec.widthMm || !spec.heightMm) throw new Error("Missing published EDSC plenum dimensions");
const examples: { name: string; w: number; h: number; d: number; inlet: PlenumOpening; ports: PlenumShellPort[] }[] = [
  ...["rear", "top"].map((side) => ({
    name: `griglia-${side}`, w: .6, h: .4, d: .25,
    inlet: { side: "front" as const, width: .576, height: .376 },
    ports: [{ side: side as "rear" | "top", x: 0, y: side === "rear" ? -.155 : 0, z: side === "top" ? .23 : 0, radius: .08 }],
  })),
  { name: "edsc-c-125", w: spec.lengthMm / 1000, h: spec.heightMm / 1000, d: spec.widthMm / 1000,
    inlet: { side: "bottom", radius: .0625 },
    ports: [{ side: "rear", x: 0, y: -spec.widthMm / 2000 - .03, z: 0, radius: spec.portDiameterMm / 2000 }] },
];
const output = examples.map((example) => {
  const faces = attachedPlenumFaces(example.w, example.h, example.d, example.ports, example.inlet);
  return { ...example, faces: faces.map((face) => {
    const geometry = face.geometry;
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...face.position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...face.rotation)), new THREE.Vector3(1, 1, 1));
    geometry.applyMatrix4(matrix);
    const positions = Array.from(geometry.getAttribute("position").array);
    geometry.dispose();
    return { side: face.side, positions, groups: geometry.groups };
  }) };
});
mkdirSync("output/verifiche-realismo", { recursive: true });
writeFileSync("output/verifiche-realismo/terminal-plenums.json", JSON.stringify(output));
console.log(output.map((e) => ({ name: e.name, dimensions: [e.w, e.h, e.d] })));
