import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { Box3, Material, Mesh, Texture, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { terminalFaceDimensions } from "@/domain/air-terminals/geometry";
import {
  ecoclimaDiffuserFamilies,
  ecoclimaDiffuserModel,
  ecoclimaDiffuserModels,
  ecoclimaGrilleFamilies,
  ecoclimaGrilleUrl,
} from "./ecoclima-diffuser-models";

async function load(path: string) {
  const data = readFileSync(path);
  const loader = new GLTFLoader();
  // perforation textures cannot be decoded without a browser; geometry is what these tests check
  loader.register(() => ({
    name: "NoTextures",
    loadTexture: () => Promise.resolve(new Texture()),
  }));
  const model = await loader.parseAsync(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    "",
  );
  const meshes: Mesh[] = [];
  model.scene.traverse((object) => {
    if (object instanceof Mesh) meshes.push(object);
  });
  const named = (prefix: string) =>
    meshes.filter((mesh) =>
      (mesh.material as Material).name.startsWith(prefix),
    );
  return {
    meshes,
    named,
    size: new Box3().setFromObject(model.scene).getSize(new Vector3()),
    box: new Box3().setFromObject(model.scene),
  };
}

it("maps only families that exist in the catalog, each to one model", () => {
  const codes = new Set(
    airTerminalCatalog.families.map((family) => family.familyCode),
  );
  for (const code of ecoclimaDiffuserFamilies) {
    expect(codes.has(code), code).toBe(true);
    expect(ecoclimaDiffuserModel(code), code).not.toBeNull();
  }
  expect(new Set(ecoclimaDiffuserFamilies).size).toBe(
    ecoclimaDiffuserFamilies.length,
  );
  expect(ecoclimaDiffuserModel("EDLS")).toBeNull();
});

it.each(ecoclimaDiffuserModels)(
  "loads the %s Blender model: square or round face, collar behind it",
  async (name) => {
    const { named, size } = await load(
      `public/models/ecoclima/diffusers/${name}.glb`,
    );
    expect(named("Profile").length).toBeGreaterThan(0);
    expect(size.x / size.y).toBeCloseTo(1, 1);
    // the app puts the face on +Z: the body (zinc collar, or the inner dark part of the ball nozzle) must sit behind the frame
    const body = named("Collare")[0] ?? named("Interno")[0];
    const collar = new Box3().setFromObject(body).getCenter(new Vector3());
    const face = new Box3()
      .setFromObject(named("Profile")[0])
      .getCenter(new Vector3());
    expect(collar.z).toBeLessThan(face.z);
  },
);

it("keeps the EDRC quotas of the catalog sheet: face 393 mm, depth 205 mm", async () => {
  const { size } = await load(
    "public/models/ecoclima/diffusers/edrc-round.glb",
  );
  expect(size.x * 1000).toBeCloseTo(393, 0);
  expect(size.z * 1000).toBeCloseTo(205, 0);
});

// element count along the opening: [mesh name prefix, axis, flange width, pitch] as built by scripts/blender/ecoclima-grilles.py
const pitched: Record<string, [string, "w" | "h", number, number]> = {
  EBA: ["Profile_aletta_verticale", "w", 14, 20],
  EBV: ["Profile_aletta_verticale", "w", 18, 20],
  EBIA: ["Profile_aletta_verticale", "w", 20, 40],
  EGA: ["Profile_lamella", "h", 18, 25],
  EGA50: ["Profile_lamella", "h", 20, 50],
  EGZ100: ["Profile_lamella", "h", 20, 100],
  EGQ: ["Profile_maglia_verticale", "w", 20, 13],
  EBLR: ["Profile_barra", "h", 10, 12],
};

it("only lists grille families that exist in the catalog", () => {
  const codes = new Set(
    airTerminalCatalog.families.map((family) => family.familyCode),
  );
  for (const code of ecoclimaGrilleFamilies)
    expect(codes.has(code), code).toBe(true);
});

it.each(ecoclimaGrilleFamilies)(
  "has one %s model per catalog variant, at the face the app draws, with real-pitch elements",
  async (code) => {
    const grille = airTerminalCatalog.families.find(
      (family) => family.familyCode === code,
    )!;
    for (const variant of grille.variants) {
      const face = terminalFaceDimensions(grille, variant);
      const { named, size } = await load(
        `public${ecoclimaGrilleUrl(code, variant.id)}`,
      );
      // linear diffusers are built 1000 mm long and scaled to the commercial length by the app
      if (!grille.familyCode.startsWith("EDL"))
        expect(size.x * 1000, variant.id).toBeCloseTo(face.widthMm!, 0);
      expect(size.y * 1000, variant.id).toBeCloseTo(face.heightMm!, 0);
      expect(named("Profile").length, variant.id).toBeGreaterThan(0);
      const rule = pitched[code];
      if (rule) {
        const [prefix, axis, flange, pitch] = rule;
        const span = axis === "w" ? face.widthMm! : face.heightMm!;
        expect(
          named("Profile").filter((mesh) => mesh.name.startsWith(prefix)),
          variant.id,
        ).toHaveLength(Math.max(1, Math.floor((span - 2 * flange) / pitch)));
      }
    }
  },
);
