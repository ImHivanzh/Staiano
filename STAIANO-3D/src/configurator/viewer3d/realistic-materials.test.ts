import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { Box3, Mesh, MeshPhysicalMaterial, Raycaster, Texture, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

it("ships valid GLBs with dielectric paint and glazing across every product variant", () => {
  const paths = readdirSync("public", { recursive: true })
    .filter((path) => typeof path === "string" && path.endsWith(".glb")) as string[];
  expect(paths.length).toBeGreaterThan(1700);
  for (const path of paths) {
    const data = readFileSync(join("public", path));
    expect(data.toString("ascii", 0, 4), path).toBe("glTF");
    expect(data.readUInt32LE(8), path).toBe(data.length);
    const document = JSON.parse(data.toString("utf8", 20, 20 + data.readUInt32LE(12)));
    for (const node of document.nodes ?? []) {
      if (node.name !== "Cube" || node.mesh === undefined) continue;
      const primitive = document.meshes[node.mesh].primitives[0];
      const position = document.accessors[primitive.attributes.POSITION];
      expect([position.min, position.max], `${path}: leaked Blender startup cube`).not.toEqual([[-1, -1, -1], [1, 1, 1]]);
    }
    for (const material of document.materials ?? []) {
      const name: string = material.name ?? "";
      const pbr = material.pbrMetallicRoughness ?? {};
      if (/vetro/i.test(name) && !/riflettente/i.test(name)) {
        expect(pbr.metallicFactor, `${path}: ${name}`).toBe(0);
        expect(pbr.roughnessFactor, `${path}: ${name}`).toBe(.12);
        expect(material.extensions?.KHR_materials_clearcoat?.clearcoatFactor).toBeGreaterThan(0);
      }
      if (/vernici|maiolica|^ABS|^Profile bianco/i.test(name))
        expect(pbr.metallicFactor, `${path}: ${name}`).toBe(0);
      if (name === "Profile metallo") {
        expect(pbr.metallicFactor, path).toBe(.95);
        expect(pbr.roughnessFactor, path).toBe(.36);
      }
    }
  }
});

async function load(path: string) {
  const data = readFileSync(path);
  const loader = new GLTFLoader().register(() => ({
    name: "geometry-test",
    loadTexture: async () => new Texture(),
  }));
  return loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
}

it("keeps wall split and cassette widths at their catalogue envelopes", async () => {
  const models = [
    ...JSON.parse(readFileSync("public/models/splits/manifest.json", "utf8")),
    ...JSON.parse(readFileSync("public/models/cassettes/manifest.json", "utf8")),
  ];
  for (const entry of models) {
    const model = await load(`public${entry.url}`);
    const size = new Box3().setFromObject(model.scene).getSize(new Vector3());
    expect(size.x, entry.family).toBeCloseTo(entry.dimensionsMm[0] / 1000, 2);
    expect(model.scene.getObjectByName("Cube"), entry.family).toBeUndefined();
  }
});

it("loads the calibrated glass coating through the application's GLTFLoader", async () => {
  const model = await load("public/models/stoves/nordica-amika-ad-bianco.glb");
  const glass: MeshPhysicalMaterial[] = [];
  model.scene.traverse((object) => {
    if (object instanceof Mesh && object.material instanceof MeshPhysicalMaterial && /vetro/i.test(object.material.name))
      glass.push(object.material);
  });
  expect(glass.length).toBeGreaterThan(0);
  expect(glass.every((material) => material.clearcoat === .6 && material.metalness === 0)).toBe(true);
});

it.each(["ega", "ega1-4"])("matches the manufacturer's 45 degree %s blades", async (family) => {
  const filename = readdirSync(`public/models/ecoclima/${family}`).find((name) => name.endsWith(".glb"))!;
  const model = await load(`public/models/ecoclima/${family}/${filename}`);
  model.scene.updateMatrixWorld(true);
  let blades = 0;
  model.scene.traverse((object) => {
    if (!(object instanceof Mesh) || !object.name.startsWith("Profile_lamella")) return;
    blades++;
    const positions = object.geometry.getAttribute("position");
    const points = Array.from({ length: positions.count }, (_, i) => new Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld));
    const chords = points.flatMap((a, i) => points.slice(i + 1).map((b) => b.clone().sub(a)))
      .filter((edge) => Math.abs(edge.x) < 1e-6 && Math.abs(edge.length() - .028) < 1e-6);
    expect(chords.length).toBeGreaterThan(0);
    for (const edge of chords) expect(Math.abs(edge.y)).toBeCloseTo(Math.abs(edge.z), 6);
  });
  expect(blades).toBeGreaterThan(0);
});

it.each([["ede-square", 28], ["ede2-square", 24]] as const)("cuts the reference slot pattern through %s", async (name, count) => {
  const model = await load(`public/models/ecoclima/diffusers/${name}.glb`);
  model.scene.updateMatrixWorld(true);
  const vanes: Mesh[] = [];
  const plates: Mesh[] = [];
  model.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (object.name.startsWith("Barra")) vanes.push(object);
    if (object.name.startsWith("Profile_piastra")) plates.push(object);
  });
  expect(vanes).toHaveLength(count);
  expect(plates.length).toBeGreaterThan(0);
  for (const vane of vanes) {
    const center = new Box3().setFromObject(vane).getCenter(new Vector3());
    const ray = new Raycaster(new Vector3(center.x, center.y, 1), new Vector3(0, 0, -1));
    expect(ray.intersectObjects(plates).length).toBe(0);
    expect(ray.intersectObject(vane).length).toBeGreaterThan(0);
  }
});
