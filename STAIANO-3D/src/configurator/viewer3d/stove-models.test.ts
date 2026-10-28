import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { Box3, Mesh, Raycaster, Texture, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

it.each([
  "nordica-amika-petra-ad-pietra",
  "nordica-angelica-evo-avorio",
  "nordica-angelica-evo-nero",
  "nordica-angelica-evo-bordeaux",
  "nordica-angelica-junior-nero",
  "nordica-angelica-junior-avorio",
  "nordica-angelica-junior-tortora-matt",
  "nordica-dahiana-ad-avorio",
  "nordica-dahiana-ad-bordeaux",
  "nordica-dahiana-ad-nero",
  "nordica-dahiana-ad-bronzo",
  "nordica-daniela-nero",
  "nordica-daniela-avorio",
  "nordica-daniela-tortora-matt",
  "nordica-daniela-grigio-grafite",
  "nordica-debby-evo-bianco",
  "nordica-debby-evo-nero",
  "nordica-debby-petra-evo-pietra",
  "nordica-katia-11-50-evo-bronzo",
  "nordica-katia-11-50-evo-bianco",
  "nordica-katia-11-50-evo-tortora-matt",
  "nordica-katia-9-50-evo-bronzo",
  "nordica-katia-9-50-evo-bianco",
  "nordica-katia-9-50-evo-tortora-matt",
  "nordica-ketty-50-bianco",
  "nordica-ketty-50-bordeaux",
  "nordica-ketty-50-nero",
  "nordica-ketty-50-avorio",
  "nordica-klaudia-ad-evo-nero",
  "nordica-klaudia-ad-evo-bordeaux",
  "nordica-klaudia-ad-evo-bianco",
  "nordica-lucia16-tortora",
  "nordica-lucia16-bordeaux",
  "nordica-lucia16-bianco",
  "nordica-luisella-50-nero",
  "nordica-luisella-50-grigio-grafite",
  "nordica-luisella-50-bordeaux",
  "nordica-luisella-50-maxi-grigio-grafite",
  "nordica-luisella-50-maxi-nero",
  "nordica-mariella-ad-avorio",
  "nordica-mariella-ad-bordeaux",
  "nordica-mariella-ad-nero",
  "nordica-noris-evo-bronzo",
  "nordica-noris-evo-bianco",
  "nordica-noris-evo-tortora-matt",
  "nordica-noris-lux-evo-tortora",
  "nordica-noris-lux-evo-bianco",
  "nordica-peggy-nero",
  "nordica-sabry-ad-grigio-grafite",
  "nordica-sabry-ad-avorio",
  "nordica-sabry-ad-bronzo",
  "nordica-sabry-ad-nero",
  "nordica-teodora-evo-nero",
  "nordica-teorema-ad-avorio",
  "nordica-teorema-ad-bordeaux",
  "nordica-teorema-ad-nero",
  "nordica-angelica-plus-evo-avorio",
  "nordica-angelica-plus-evo-bordeaux",
  "nordica-angelica-plus-evo-nero",
  "nordica-annabella-plus-50-bianco",
  "nordica-annabella-plus-50-nero",
  "nordica-annabella-plus-50-tortora-matt",
  "nordica-annalisa-plus-crystal-evo-nero",
  "nordica-annalisa-plus-gres-evo-gres-ostuni",
  "nordica-annalisa-plus-gres-evo-gres-corten",
  "nordica-dahiana-plus-ad-bronzo",
  "nordica-dahiana-plus-ad-nero",
  "nordica-dahiana-plus-ad-bordeaux",
  "nordica-dahiana-plus-ad-avorio",
  "nordica-daniela-plus-nero",
  "nordica-daniela-plus-avorio",
  "nordica-daniela-plus-tortora-matt",
  "nordica-daniela-plus-grigio-grafite",
  "nordica-klaudia-plus-ad-evo-nero",
  "nordica-klaudia-plus-ad-evo-bordeaux",
  "nordica-klaudia-plus-ad-evo-bianco",
  "nordica-lucia-plus16-tortora",
  "nordica-lucia-plus16-bordeaux",
  "nordica-lucia-plus16-bianco",
  "nordica-mariella-plus-ad-avorio",
  "nordica-mariella-plus-ad-bordeaux",
  "nordica-mariella-plus-ad-nero",
  "nordica-marilena-plus-50-ad-bianco",
  "nordica-marilena-plus-50-ad-nero",
  "nordica-marilena-plus-crystal-50-ad-fume",
  "nordica-marilena-plus-crystal-50-ad-bianco",
  "nordica-marilena-plus-petra-50-ad-pietra",
  "nordica-noris-plus-evo-bronzo",
  "nordica-noris-plus-evo-bianco",
  "nordica-noris-plus-evo-tortora-matt",
  "nordica-noris-plus-lux-evo-tortora",
  "nordica-noris-plus-lux-evo-bianco",
  "nordica-sharon-plus-crystal-crystal",
  "nordica-sharon-plus-petra-pietra",
  "nordica-sharon-plus-steel-nero",
  "nordica-souvenir-plus-lux-50-bianco",
  "nordica-souvenir-plus-lux-50-tortora",
  "nordica-souvenir-plus-petra-50-pietra",
  "nordica-souvenir-plus-steel-50-bianco",
  "nordica-souvenir-plus-steel-50-bordeaux",
  "nordica-souvenir-plus-steel-50-nero",
  "nordica-teorema-plus-ad-nero",
  "nordica-teorema-plus-ad-avorio",
  "nordica-teorema-plus-ad-bordeaux",
  "nordica-terry-plus-bianco",
  "nordica-terry-plus-bordeaux",
  "nordica-terry-plus-tortora-lucido",
  "nordica-costanza-idro-50-bianco",
  "nordica-costanza-idro-50-bordeaux",
  "nordica-evelyne-idro-evo-grigio",
  "nordica-evelyne-idro-evo-bianco",
  "nordica-evelyne-idro-evo-tortora",
  "nordica-floriana-idro-crystal-crystal",
  "nordica-floriana-idro-gres-gres-corten",
  "nordica-floriana-idro-gres-gres-ostuni",
  "nordica-guenda-idro-evo-avorio",
  "nordica-guenda-idro-evo-bronzo",
  "nordica-guenda-idro-evo-tortora-matt",
  "nordica-iside-idro-5016-bianco",
  "nordica-iside-idro-5016-pergamena",
  "nordica-iside-idro-5016-vogue-ametista",
  "nordica-isidora-idro-h16-50-evo-tortora-lucido",
  "nordica-isidora-idro-h16-50-evo-bianco",
  "nordica-isidora-idro-h16-50-evo-bordeaux",
  "nordica-isidora-idro-h20-50-evo-avorio",
  "nordica-isidora-idro-h20-50-evo-bianco",
  "nordica-isidora-idro-h20-50-evo-bordeaux",
  "nordica-isidora-idro-h23-50-evo-avorio",
  "nordica-isidora-idro-h23-50-evo-bianco",
  "nordica-isidora-idro-h23-50-evo-bordeaux",
  ...["h11", "h13"].flatMap((model) =>
    ["bronzo", "avorio", "bordeaux"].map(
      (color) => `nordica-marina-idro-${model}-${color}`,
    ),
  ),
  ...["h16", "h20", "h23"].flatMap((model) =>
    ["avorio", "nero", "tortora-matt"].map(
      (color) => `nordica-miriana-idro-${model}-${color}`,
    ),
  ),
  ...["bianco", "bordeaux", "grigio-luce"].map(
    (color) => `nordica-raffaella-idro-h15-5016-${color}`,
  ),
  ...["grigio-luce", "avorio"].map(
    (color) => `nordica-raffaella-idro-h18-5016-${color}`,
  ),
  ...["nero", "bordeaux", "avorio", "bronzo"].map(
    (color) => `nordica-rosanna-idro-50-${color}`,
  ),
  ...["bordeaux", "bianco", "tortora-matt"].map(
    (color) => `nordica-virna-idro16-${color}`,
  ),
  ...["bianco", "bordeaux", "nero", "grigio"].map(
    (color) => `ravelli-flexi-9-${color}`,
  ),
  ...["bianco", "nero"].map((color) => `ravelli-aria-${color}`),
  "ravelli-alfa-s-nero",
  ...["bianco", "nero", "bronzo"].map((color) => `ravelli-whisper-7-${color}`),
  ...["bianco", "nero"].map((color) => `ravelli-elettra-${color}`),
  ...["nero", "bronzo"].map((color) => `ravelli-circular-7-${color}`),
  ...["bianco", "nero", "bronzo"].map(
    (color) => `ravelli-circular-9-2-${color}`,
  ),
  ...["bianco", "bronzo"].map((color) => `ravelli-hoop-7-${color}`),
  "ravelli-hoop-9-bronzo",
  "ravelli-mild-nero",
  ...["7", "9"].flatMap((model) =>
    ["bianco", "bordeaux", "nero", "bronzo"].map(
      (color) => `ravelli-easy-${model}-${color}`,
    ),
  ),
  "ravelli-hrv-160-design-nero",
  "ravelli-hrv-100-touch-bianco",
  ...["bianco", "nero", "bordeaux"].map(
    (color) => `ravelli-hrv-140-touch-${color}`,
  ),
  ...["bianco", "bordeaux", "bronzo"].map(
    (color) => `ravelli-hrv-160-touch-steel-${color}`,
  ),
  ...["bianco", "bronzo"].map((color) => `ravelli-hrv-200-${color}`),
  "ravelli-hrv-250-bianco",
  "ravelli-hrv-180-silhouette-nero",
  ...["7", "9"].flatMap((model) =>
    ["bianco", "nero", "bronzo"].map(
      (color) => `ravelli-dual-${model}-${color}`,
    ),
  ),
  ...["s70", "s90"].flatMap((model) =>
    ["bianco", "grigio", "bronzo"].map((color) => `ravelli-${model}-${color}`),
  ),
  ...["bianco", "nero", "bordeaux", "nocciola"].map(
    (color) => `ravelli-r-70-${color}`,
  ),
  ...["rv80", "rv-100"].flatMap((model) =>
    ["bianco", "nero", "bordeaux"].map((color) => `ravelli-${model}-${color}`),
  ),
  ...["bianco", "bordeaux"].map((color) => `ravelli-rv-110-${color}`),
  ...["bianco", "bordeaux", "nero", "bronzo", "grigio"].map(
    (color) => `ravelli-sphere-v-${color}`,
  ),
  ...["bianco", "nero"].map((color) => `ravelli-rv-120-touch-steel-${color}`),
  "ravelli-block-9-grigio",
  "ravelli-block-7-grigio",
  "ravelli-luna-nero",
  ...["bianco", "nero", "bordeaux"].map(
    (color) => `ravelli-vittoria-v-${color}`,
  ),
  ...["bianco", "bordeaux", "bronzo"].map(
    (color) => `ravelli-easy-12-${color}`,
  ),
  "ravelli-easy-12-c-bianco",
  ...["bianco", "bordeaux", "nero", "bronzo", "grigio"].map(
    (color) => `ravelli-sphere-c-${color}`,
  ),
  ...["verde", "bronzo", "nero"].map((color) => `ravelli-line-${color}`),
  ...["grigio", "bianco", "nero"].map((color) => `ravelli-stilo-${color}`),
  ...["bianco", "nero", "bordeaux"].map(
    (color) => `ravelli-olivia-steel-${color}`,
  ),
  ...["bianco", "nero"].map((color) => `ravelli-rc-120-touch-steel-${color}`),
  ...["bianco", "bordeaux", "nero"].map((color) => `ravelli-rc-70-${color}`),
  ...["bianco", "grigio", "bronzo"].map((color) => `ravelli-sc-90-${color}`),
  ...["bianco", "nero", "bordeaux"].map(
    (color) => `ravelli-vittoria-c-${color}`,
  ),
  ...["hrv-120-style", "hrv-100-globe", "hrv-120-plus"].flatMap((model) =>
    ["bianco", "nero", "bordeaux"].map((color) => `ravelli-${model}-${color}`),
  ),
  "ravelli-hrv-140-silhouette-nero",
  ...[
    "hrv-160-touch",
    "hrv-120-country",
    "hrv-180-plus",
    "hrv-140-globe",
  ].flatMap((model) =>
    ["bianco", "bordeaux"].map((color) => `ravelli-${model}-${color}`),
  ),
  ...["dafne-view", "dafne", "minerva", "thor", "efesto"].map(
    (model) => `ravelli-${model}-nero`,
  ),
  ...["minerva-stone", "calliope-stone"].map(
    (model) => `ravelli-${model}-grigio`,
  ),
  "nordica-larissa16-nero-antracite",
  "nordica-asia-50-vulcan",
  ...["panna", "bordeaux"].map(
    (color) => `nordica-aurelia-eos-ceramica-${color}`,
  ),
  "nordica-aurelia-eos-petra-pietra",
  "nordica-aurelia-eos-steel-nero-antracite",
  "nordica-brigitta16-nero",
  "nordica-candy-eos165-nero-antracite",
  ...["concita16-maiolica", "emiliana165-maiolica"].flatMap((model) =>
    ["bordeaux", "bianco-infinity"].map((color) => `nordica-${model}-${color}`),
  ),
  ...["concita16-steel", "emiliana165-steel", "emi-eos"].map(
    (model) => `nordica-${model}-nero-antracite`,
  ),
  ...["dante16", "dante16-con-portalegna"].map(
    (model) => `nordica-${model}-nero-opaco`,
  ),
  "nordica-ester-50-vulcan",
  "nordica-ester-forno-50-vulcan",
  ...["bianco-infinity", "bordeaux"].map(
    (color) => `nordica-fedora16-maiolica-${color}`,
  ),
  "nordica-fedora16-steel-nero-antracite",
  ...["liberty-panna", "elegance-bordeaux", "elegance-bianco-infinity"].map(
    (color) => `nordica-gemma16-ceramica-${color}`,
  ),
  "nordica-gemma16-petra-pietra",
  ...["elegance-bordeaux", "elegance-bianco-infinity"].map(
    (color) => `nordica-gemma-forno165-ceramica-${color}`,
  ),
  "nordica-gemma-forno165-petra-pietra",
  ...[
    "giulietta165",
    "isetta165",
    "isetta-cc165",
    "isetta-forno",
    "isotta-cc-eos165",
    "isotta-eos165",
    "isotta-forno-eos",
  ].map((model) => `nordica-${model}-nero-antracite`),
  ...["jennifer16-eps", "lavinia-eos", "marlena16", "nova-forno16-steel"].map(
    (model) => `nordica-${model}-nero-antracite`,
  ),
  ...["bordeaux", "bianco-infinity"].map(
    (color) => `nordica-liu-16-maiolica-${color}`,
  ),
  "nordica-liu-16-petra-pietra",
  ...["bianco-opaco", "bordeaux"].map(
    (color) => `nordica-nova-forno16-maiolica-${color}`,
  ),
  ...[
    "rossella-plforno165-ceramica",
    "termorossella-plus-dsa16-cera",
    "trossplus-forno-dsa16-ceram",
  ].flatMap((model) =>
    ["liberty-panna", "liberty-bordeaux"].map(
      (color) => `nordica-${model}-${color}`,
    ),
  ),
  ...["liberty-panna", "liberty-bordeaux", "liberty-bianco-infinity"].map(
    (color) => `nordica-rossella-r116-ceramica-${color}`,
  ),
  ...[
    "rossella-plus-forno165-petra",
    "rossella-r116-petra",
    "termorossella-plus-dsa16-petr",
    "trossplus-forno-dsa16-petra",
  ].map((model) => `nordica-${model}-pietra`),
  ...["nero", "verde"].map((color) => `nordica-super-junior-lean-${color}`),
  ...["nero-antracite", "bianco"].map((color) => `nordica-tea16-${color}`),
  "nordica-sierra16-nero-antracite",
  "nordica-termorosa-dsa16-ceramica-bordeaux",
  "nordica-termorosa-dsa16-petra-pietra",
])("exports a stove with a door and glass: %s", (name) => {
  const file = readFileSync(`public/models/stoves/${name}.glb`);
  expect(file.toString("ascii", 0, 4)).toBe("glTF");
  const json = JSON.parse(
    file.toString("utf8", 20, 20 + file.readUInt32LE(12)),
  );
  const names = json.nodes.map((node: { name?: string }) => node.name ?? "");
  expect(names.some((node: string) => /porta|sportello/i.test(node))).toBe(
    true,
  );
  expect(names.some((node: string) => /vetro/i.test(node))).toBe(true);
});

it("exports the rounded body of the RV 100 with its bevel applied", () => {
  const file = readFileSync("public/models/stoves/ravelli-rv-100-bianco.glb");
  const gltf = JSON.parse(
    file.toString("utf8", 20, 20 + file.readUInt32LE(12)),
  );
  const body = gltf.nodes.find((node: { name?: string }) =>
    /^Corpo(\.|$)/.test(node.name ?? ""),
  );
  const position = gltf.meshes[body.mesh].primitives[0].attributes.POSITION;
  expect(gltf.accessors[position].count).toBeGreaterThan(24);
});

const ceramicStoves = [
  {
    id: "nordica-iside-idro-5016",
    size: [0.69, 1.196, 0.628],
    finishes: ["bianco", "pergamena", "vogue-ametista"],
  },
  {
    id: "nordica-isidora-idro-h16-50-evo",
    size: [0.596, 1.165, 0.708],
    finishes: ["tortora-lucido", "bianco", "bordeaux"],
  },
  {
    id: "nordica-isidora-idro-h20-50-evo",
    size: [0.596, 1.243, 0.708],
    finishes: ["avorio", "bianco", "bordeaux"],
  },
  {
    id: "nordica-isidora-idro-h23-50-evo",
    size: [0.596, 1.243, 0.737],
    finishes: ["bianco", "bordeaux", "avorio"],
  },
];

it.each(
  ceramicStoves.flatMap((stove) =>
    stove.finishes.map((finish) => ({ ...stove, finish })),
  ),
)(
  "keeps $id $finish glazing recessed behind open cast frames, with baked shading",
  async ({ id, finish, size }) => {
    const bytes = readFileSync(`public/models/stoves/${id}-${finish}.glb`);
    const json = JSON.parse(
      bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)),
    );
    expect(
      json.materials.some(
        (material: { occlusionTexture?: unknown }) => material.occlusionTexture,
      ),
    ).toBe(true);
    const loader = new GLTFLoader().register(() => ({
      name: "geometry-test",
      loadTexture: async () => new Texture(),
    }));
    const model = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
    model.scene.updateMatrixWorld(true);
    const meshes: Mesh[] = [];
    model.scene.traverse((object) => {
      if (object instanceof Mesh) meshes.push(object);
    });
    const glass = meshes.find((mesh) => /^Vetro_sportello/.test(mesh.name))!;
    expect(glass).toBeDefined();
    const centre = new Box3().setFromObject(glass).getCenter(new Vector3());
    const bounds = new Box3().setFromObject(model.scene);
    const ray = new Raycaster(
      new Vector3(centre.x, centre.y, bounds.max.z + 0.1),
      new Vector3(0, 0, -1),
    );
    const frames = meshes.filter((mesh) =>
      /^(Cornice_sportello|Porta_ghisa)/.test(mesh.name),
    );
    expect(frames).toHaveLength(2);
    expect(ray.intersectObjects(frames)).toHaveLength(0);
    expect(ray.intersectObject(glass).length).toBeGreaterThan(0);
    const measured = bounds.getSize(new Vector3());
    [measured.x, measured.y, measured.z].forEach((dimension, index) =>
      expect(Math.abs(dimension - size[index])).toBeLessThan(0.002),
    );
    expect(glass.geometry.getAttribute("uv")).toBeDefined();
  },
);

const woodStoves = [
  {
    id: "ravelli-dafne-view",
    finish: "nero",
    size: [0.45, 0.95, 0.37],
    curved: true,
    openStore: true,
  },
  {
    id: "ravelli-dafne",
    finish: "nero",
    size: [0.45, 0.95, 0.37],
    curved: true,
  },
  {
    id: "ravelli-minerva",
    finish: "nero",
    size: [0.75, 0.97, 0.47],
    curved: true,
  },
  {
    id: "ravelli-minerva-stone",
    finish: "grigio",
    size: [0.76, 1.01, 0.47],
    curved: true,
    openStore: true,
  },
  {
    id: "ravelli-calliope-stone",
    finish: "grigio",
    size: [0.54, 1.0, 0.39],
    curved: true,
  },
  {
    id: "ravelli-thor",
    finish: "nero",
    size: [0.52, 0.77, 0.37],
    curved: false,
  },
  {
    id: "ravelli-efesto",
    finish: "nero",
    size: [0.6, 0.73, 0.48],
    curved: false,
  },
];

it.each(woodStoves)(
  "preserves $id glazing, open stores and catalogue envelope",
  async ({ id, finish, size, curved, openStore }) => {
    const bytes = readFileSync(`public/models/stoves/${id}-${finish}.glb`);
    const json = JSON.parse(
      bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)),
    );
    expect(
      json.materials.some(
        (material: { occlusionTexture?: unknown }) => material.occlusionTexture,
      ),
    ).toBe(true);
    const loader = new GLTFLoader().register(() => ({
      name: "geometry-test",
      loadTexture: async () => new Texture(),
    }));
    const model = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
    model.scene.updateMatrixWorld(true);
    const meshes: Mesh[] = [];
    model.scene.traverse((object) => {
      if (object instanceof Mesh) meshes.push(object);
    });
    const bounds = new Box3().setFromObject(model.scene);
    const measured = bounds.getSize(new Vector3());
    [measured.x, measured.y, measured.z].forEach((dimension, index) =>
      expect(Math.abs(dimension - size[index])).toBeLessThan(0.0021),
    );
    const glass = meshes.find((mesh) => /^Vetro_sportello/.test(mesh.name))!;
    const glassBounds = new Box3().setFromObject(glass);
    const centre = glassBounds.getCenter(new Vector3());
    expect(glassBounds.getSize(new Vector3()).x).toBeGreaterThan(size[0] * 0.5);
    if (curved)
      expect(glassBounds.getSize(new Vector3()).z).toBeGreaterThan(0.01);
    const ray = new Raycaster(
      new Vector3(centre.x, centre.y, bounds.max.z + 0.1),
      new Vector3(0, 0, -1),
    );
    expect(ray.intersectObjects(meshes)[0]?.object).toBe(glass);
    if (openStore) {
      ray.set(
        new Vector3(0, size[1] * 0.18, bounds.max.z + 0.1),
        new Vector3(0, 0, -1),
      );
      expect(ray.intersectObjects(meshes)[0]?.distance).toBeGreaterThan(
        0.1 + size[2] * 0.6,
      );
    }
    if (id === "ravelli-dafne-view") {
      const sideGlass = meshes.filter((mesh) =>
        /^Vetro_laterale/.test(mesh.name),
      );
      expect(sideGlass).toHaveLength(2);
      for (const side of sideGlass) {
        const position = side.geometry.getAttribute("position");
        const uv = side.geometry.getAttribute("uv");
        side.geometry.computeBoundingBox();
        const box = side.geometry.boundingBox!;
        for (let i = 0; i < position.count; i++) {
          expect(uv.getX(i)).toBeCloseTo(
            (box.max.z - position.getZ(i)) / (box.max.z - box.min.z),
            4,
          );
        }
      }
    }
  },
);

const revisedPelletStoves = [
  { id: "ravelli-hoop-7", size: [.520, 1.110, .550], finishes: ["bianco", "bronzo"] },
  { id: "ravelli-hoop-9", size: [.520, 1.110, .550], finishes: ["bronzo"] },
  { id: "ravelli-mild", size: [.690, .800, .610], finishes: ["nero"] },
  { id: "ravelli-easy-7", size: [.525, 1.030, .480], finishes: ["bianco", "bordeaux", "nero", "bronzo"] },
  { id: "ravelli-easy-9", size: [.525, 1.030, .480], finishes: ["bianco", "bordeaux", "nero", "bronzo"] },
];

it.each(revisedPelletStoves.flatMap((stove) => stove.finishes.map((finish) => ({ ...stove, finish }))))(
  "preserves $id $finish glazing, silhouettes and rendering budget", async ({ id, finish, size }) => {
    const bytes = readFileSync(`public/models/stoves/${id}-${finish}.glb`);
    const json = JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)));
    expect(json.materials.length).toBeLessThanOrEqual(4);
    expect(json.materials.some((material: { occlusionTexture?: unknown }) => material.occlusionTexture)).toBe(true);
    let triangles = 0;
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
      triangles += json.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3;
    }
    expect(triangles).toBeLessThanOrEqual(15000);
    const loader = new GLTFLoader().register(() => ({ name: "geometry-test", loadTexture: async () => new Texture() }));
    const model = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
    model.scene.updateMatrixWorld(true);
    const meshes: Mesh[] = [];
    model.scene.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
    const bounds = new Box3().setFromObject(model.scene);
    const measured = bounds.getSize(new Vector3());
    [measured.x, measured.y, measured.z].forEach((dimension, index) => expect(Math.abs(dimension-size[index])).toBeLessThan(.0021));
    const glazing = meshes.find((mesh) => /^Vetro_sportello/.test(mesh.name))!;
    const centre = new Box3().setFromObject(glazing).getCenter(new Vector3());
    const ray = new Raycaster(new Vector3(centre.x, centre.y, bounds.max.z+.1), new Vector3(0, 0, -1));
    expect(ray.intersectObjects(meshes)[0]?.object).toBe(glazing);
    expect(glazing.geometry.getAttribute("uv")).toBeDefined();
    if (id.startsWith("ravelli-hoop")) {
      const capsule = meshes.find((mesh) => /^Cornice_capsula/.test(mesh.name))!;
      const capBounds = new Box3().setFromObject(capsule);
      const capSize = capBounds.getSize(new Vector3());
      ray.set(new Vector3(capBounds.max.x-capSize.x*.05, capBounds.max.y-capSize.y*.02, bounds.max.z+.1), new Vector3(0, 0, -1));
      expect(ray.intersectObject(capsule)).toHaveLength(0);
      ray.set(new Vector3(0, size[1]+.01, size[2]*2.5*.062), new Vector3(0, -1, 0));
      expect(ray.intersectObjects(meshes)[0]?.distance).toBeGreaterThan(.035);
      const upper = meshes.find((mesh) => /^Rivestimento_superiore/.test(mesh.name))!;
      ray.set(new Vector3(bounds.max.x+.1, size[1]*.72, 0), new Vector3(-1, 0, 0));
      expect(ray.intersectObjects(meshes)[0]?.object).toBe(upper);
    }
    if (id === "ravelli-mild") expect(meshes.filter((mesh) => /^Piede_rastremato/.test(mesh.name))).toHaveLength(4);
  },
);
