import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { Box3, Mesh, Raycaster, Texture, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { grilleHinge } from "./EcoclimaGrille";

it.each([
  "ega6",
  "ebl",
  "egf",
  "egf-push",
  "innova-sli-core",
  "innova-sli-panel",
  "aermec-fcz-p-po",
  "innova-osmo-sl",
  "olimpia-bi2-air",
  "olimpia-bi2-smart",
  "plenum-3-stacchi",
])(
  "loads the editable Blender export %s without unrelated scene objects",
  async (name) => {
    const data = readFileSync(`public/models/hvac/${name}-realistic.glb`);
    // Geometry tests run in Node; validate embedded filter images separately below.
    const loader = new GLTFLoader().register(() => ({
      name: "geometry-test",
      loadTexture: async () => new Texture(),
    }));
    const model = await loader.parseAsync(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      "",
    );
    const meshes: Mesh[] = [];
    model.scene.traverse((object) => {
      if (object instanceof Mesh) meshes.push(object);
    });
    expect(meshes.length).toBeGreaterThan(1);
    expect(meshes.some((object) => object.name.startsWith("Preview"))).toBe(
      false,
    );
    const size = new Box3().setFromObject(model.scene).getSize(new Vector3());
    expect(
      [size.x, size.y, size.z].every(
        (dimension) => dimension > 0 && Number.isFinite(dimension),
      ),
    ).toBe(true);
    if (name === "egf-push") {
      expect(
        model.scene.children.filter((object) =>
          /^Cornice_mobile/.test(object.name),
        ),
      ).toHaveLength(4);
      expect(
        model.scene.children.filter((object) =>
          /^Cornice_fissa/.test(object.name),
        ),
      ).toHaveLength(4);
      expect(
        model.scene.children.some((object) =>
          /^Pannello_forato/.test(object.name),
        ),
      ).toBe(true);
      expect(
        model.scene.children.some((object) => /^Filtro/.test(object.name)),
      ).toBe(true);
      const panel = model.scene.children.find((object) =>
        /^Pannello_forato/.test(object.name),
      )!;
      const before = panel.getWorldPosition(new Vector3());
      const hinge = grilleHinge(model.scene);
      expect(hinge.position.y).toBeCloseTo(0.174);
      expect(hinge.position.z).toBeCloseTo(0.023);
      expect(
        panel.getWorldPosition(new Vector3()).distanceTo(before),
      ).toBeLessThan(1e-6);
      const fixed = model.scene.children.filter((object) =>
        /^Cornice_fissa/.test(object.name),
      );
      const moving = hinge.children.filter((object) =>
        /^Cornice_mobile/.test(object.name),
      );
      for (let step = 0; step <= 66; step++) {
        hinge.rotation.x = (-step * 1.15) / 66;
        model.scene.updateMatrixWorld(true);
        for (const frame of moving)
          for (const surround of fixed) {
            expect(
              new Box3()
                .setFromObject(frame)
                .intersectsBox(new Box3().setFromObject(surround)),
              `Frame contact at opening step ${step}`,
            ).toBe(false);
          }
      }
      hinge.rotation.x = -1;
      const after = panel.getWorldPosition(new Vector3());
      expect(after.distanceTo(before)).toBeGreaterThan(0.1);
      expect(after.z).toBeGreaterThan(before.z);
      expect(
        model.scene.children.some((object) => /^Filtro/.test(object.name)),
      ).toBe(true);
    }
    if (name === "plenum-3-stacchi") {
      const collars = meshes.filter((object) =>
        object.name.startsWith("Stacco_aperto"),
      );
      const face = meshes.find((object) =>
        object.name.startsWith("Pannello_forato"),
      )!;
      expect(collars).toHaveLength(3);
      model.scene.updateMatrixWorld(true);
      for (const x of [-0.24, 0, 0.24]) {
        const ray = new Raycaster(
          new Vector3(x, 0, 0.5),
          new Vector3(0, 0, -1),
        );
        expect(ray.intersectObject(face)).toHaveLength(0);
        for (const collar of collars)
          expect(ray.intersectObject(collar)).toHaveLength(0);
      }
    }
  },
);

it.each(["ega6", "egf-push"])(
  "exports a framed, textured filter cartridge in %s",
  (name) => {
    const data = readFileSync(`public/models/hvac/${name}-realistic.glb`);
    const gltf = JSON.parse(
      data.toString("utf8", 20, 20 + data.readUInt32LE(12)),
    );
    expect(
      gltf.nodes.filter((node: { name: string }) =>
        /^Filtro_telaio/.test(node.name),
      ),
    ).toHaveLength(4);
    expect(
      gltf.nodes.filter((node: { name: string }) =>
        /^Filtro_rete/.test(node.name),
      ),
    ).toHaveLength(40);
    const media = gltf.nodes.find((node: { name: string }) =>
      /^Filtro(\.|$)/.test(node.name),
    );
    const primitive = gltf.meshes[media.mesh].primitives[0];
    expect(primitive.attributes.TEXCOORD_0).toBeDefined();
    const texture =
      gltf.materials[primitive.material].pbrMetallicRoughness.baseColorTexture;
    const image = gltf.images[gltf.textures[texture.index].source];
    expect(gltf.bufferViews[image.bufferView].byteLength).toBeGreaterThan(1000);
  },
);
