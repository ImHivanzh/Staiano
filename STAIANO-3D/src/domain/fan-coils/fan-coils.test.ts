import { describe, expect, it } from "vitest";
import { addRectangle, createProject, recomputeProject } from "@/domain/project";
import { projectSchema } from "@/schemas/project";
import {
  fanCoilCatalog,
  fanCoilMaximumPoint,
  fanCoilProductAtVersion,
  fanCoilCatalogAtVersion,
  compatibleFanCoilControls,
  controllerBoardFor,
  fanCoilPanelDimensions,
  airLeafRecessedAccessories,
  fanCoilDefaultPanelType,
  fanCoilPanelOptions,
  fanCoilPanelTypeLabel,
  fanCoilInstallationAccessories,
  fanCoilCoverAccessory,
  fanCoilRecessDepthMm,
  isDuctedFanCoil,
  isConcealedFanCoil,
  isRecessedFanCoil,
  fanCoilCategory,
  fanCoilCategories,
  fanCoilCategoryLabels,
  type FanCoilCatalog,
} from "@/domain/catalogs/fan-coils";
import { applyFanCoil, updateFanCoil, removeFanCoil } from "./apply";
import { installedFanCoilCapacity, sizeFanCoils } from "./size";
import { fanCoilEnvelope, fanCoilPlacementValid } from "./placement";
import { deviceEnvelopesOverlap } from "@/domain/geometry/device-envelope";
import { createInstallation } from "@/domain/installations";

function fixture() {
  const p = createProject("Nuovo progetto", 35);
  p.projectSettings.externalWallThicknessM = 0.3;
  return addRectangle(p, p.floors[0].id, {
    width: 8,
    length: 6,
    height: 2.7,
    name: "Salone",
  });
}

describe("ventilconvettori originali", () => {
  it("usa le prestazioni e i kit ufficiali del Bi2 Naked per taglia e posa", () => {
    const product = fanCoilCatalog.products.find(
      (item) => item.id === "olimpia-01514",
    )!;
    expect(product).toMatchObject({
      family: "Bi2 Naked SLI",
      model: "SLI 400",
      widthMm: 725,
      heightMm: 576,
      depthMm: 126,
      recessDepthMm: 142,
      mountings: ["wall", "ceiling"],
    });
    expect(product.operatingPoints[0]).toMatchObject({
      coolingW: 910,
      heatingW: 1060,
      airflowM3h: 190,
      noiseDbA: 30,
    });
    expect(isRecessedFanCoil(product)).toBe(true);
    expect(fanCoilDefaultPanelType(product, "wall")).toBe("traditional");
    expect(fanCoilDefaultPanelType(product, "ceiling")).toBe("grilles-top");
    expect(fanCoilRecessDepthMm(product, "traditional")).toBe(142);
    expect(fanCoilRecessDepthMm(product, "grilles-90")).toBe(126);
    expect(
      fanCoilInstallationAccessories(product, "wall", "traditional").map(
        (item) => item.code,
      ),
    ).toEqual(["B0569", "B0956"]);
    expect(
      fanCoilInstallationAccessories(product, "ceiling", "grilles-top").map(
        (item) => item.code,
      ),
    ).toEqual(["B0195", "B0161", "B0551", "B0560", ""]);
    const slir = fanCoilCatalog.products.find(
      (item) => item.id === "olimpia-01640",
    )!;
    expect(slir.mountings).toEqual(["wall"]);
    expect(
      fanCoilInstallationAccessories(slir, "wall", "traditional").map(
        (item) => item.code,
      ),
    ).toEqual(["B0569", "B0951"]);
    const slim = fanCoilCatalog.products.find(
      (item) => item.id === "olimpia-02056",
    )!;
    expect(slim).toMatchObject({
      family: "Bi2 Naked SLI",
      model: "SLI 1400",
      widthMm: 1110,
      heightMm: 599,
      depthMm: 198,
      mountings: ["wall", "ceiling"],
    });
    expect(slim.operatingPoints[0]).toMatchObject({
      coolingW: 3050,
      heatingW: 3070,
      airflowM3h: 460,
      noiseDbA: 30,
    });
    expect(
      fanCoilInstallationAccessories(slim, "ceiling", "grilles-top").map(
        (item) => item.code,
      ),
    ).toEqual(["B0888", "B0890", "B0880", "B0882", ""]);
  });

  it("richiede tutta la cassaforma BI2 Naked ma non aggiunge profondità ai kit a griglie", () => {
    let thinWalls = createProject("Parete sottile", 35);
    thinWalls.projectSettings.externalWallThicknessM = 0.13;
    thinWalls = addRectangle(thinWalls, thinWalls.floors[0].id, {
      width: 8,
      length: 6,
      height: 2.7,
      name: "Room",
    });
    const room = thinWalls.rooms[0];
    const product = fanCoilCatalog.products.find(
      (item) => item.id === "olimpia-01513",
    )!;
    expect(() => applyFanCoil(thinWalls, room.id, product.id)).toThrow(
      /Nessuna posizione libera/,
    );
    expect(
      applyFanCoil(thinWalls, room.id, product.id, {
        mounting: "wall",
        panelType: "grilles-90",
      }).fanCoils,
    ).toHaveLength(1);
  });

  it("controlla la profondità della cassaforma RASOMURO sulla parete", () => {
    let project = createProject("Parete sottile", 35);
    project.projectSettings.externalWallThicknessM = 0.15;
    project = addRectangle(project, project.floors[0].id, {
      width: 8,
      length: 6,
      height: 2.7,
      name: "Room",
    });
    const product = fanCoilCatalog.products.find(
      (item) => item.id === "innova-airleaf-sli-200-2t",
    )!;
    expect(() =>
      applyFanCoil(project, project.rooms[0].id, product.id, {
        mounting: "wall",
        panelType: "rasomuro",
      }),
    ).toThrow(/Nessuna posizione libera/);
    expect(
      applyFanCoil(project, project.rooms[0].id, product.id, {
        mounting: "wall",
        panelType: "traditional",
      }).fanCoils,
    ).toHaveLength(1);
  });

  it("tratta le Aermec FCZ P/PO come canalizzabili, non come incassi a filo muro", () => {
    const product = fanCoilCatalog.products.find(
      (item) => item.id === "aermec-fcz200po",
    )!;
    expect(isConcealedFanCoil(product)).toBe(true);
    expect(isDuctedFanCoil(product)).toBe(true);
    expect(isRecessedFanCoil(product)).toBe(false);
    expect(fanCoilCategory(product)).toBe("ducted");
    expect(fanCoilPanelOptions(product, "wall")).toEqual([]);
    expect(fanCoilPanelOptions(product, "ceiling")).toEqual([]);
    let project = createProject("Parete sottile", 35);
    project.projectSettings.externalWallThicknessM = 0.13;
    project = addRectangle(project, project.floors[0].id, {
      width: 8,
      length: 6,
      height: 2.7,
      name: "Room",
    });
    // Nessuna nicchia a filo muro: la parete sottile non impedisce la posa.
    const placed = applyFanCoil(project, project.rooms[0].id, product.id, {
      mounting: "wall",
    });
    expect(placed.fanCoils).toHaveLength(1);
    expect(fanCoilPlacementValid(placed, placed.fanCoils![0])).toBe(true);
  });

  it("seleziona accessori SLI distinti per finitura, taglia, tubi e posa", () => {
    expect(fanCoilPanelTypeLabel("traditional")).toContain(
      "Incasso tradizionale",
    );
    expect(fanCoilPanelTypeLabel("rasomuro")).toContain("filomuro");
    const sli2 = fanCoilCatalog.products.find(
      (p) => p.family === "AirLeaf SLI" && p.model === "SLI 400",
    )!;
    const sli4 = fanCoilCatalog.products.find(
      (p) =>
        p.family === "AirLeaf SLI" &&
        p.model.includes("400") &&
        p.pipes === "4",
    )!;
    expect(
      airLeafRecessedAccessories(sli2, "wall", "traditional").map(
        (a) => a.code,
      ),
    ).toEqual(["L00569II", "LC0579II"]);
    expect(
      airLeafRecessedAccessories(sli2, "ceiling", "rasomuro").map(
        (a) => a.code,
      ),
    ).toEqual(["L01041II", "LC1087II"]);
    expect(airLeafRecessedAccessories(sli4, "wall", "rasomuro")).toEqual([]);
    expect(
      airLeafRecessedAccessories(sli4, "ceiling", "traditional").map(
        (a) => a.code,
      ),
    ).toEqual(["L01065II", "LC0765II"]);
    const rsi = fanCoilCatalog.products.find(
      (p) => p.family === "AirLeaf RSI",
    )!;
    expect(fanCoilRecessDepthMm(rsi, "traditional")).toBe(142);
    expect(fanCoilRecessDepthMm(rsi, "rasomuro")).toBe(162);
    expect(
      airLeafRecessedAccessories(rsi, "wall", "rasomuro").map((a) => a.code),
    ).toEqual(["L01040II", "LC1081II"]);
    const slsi = fanCoilCatalog.products.find(
      (p) => p.family === "AirLeaf SLSI",
    )!;
    expect(fanCoilPanelOptions(slsi, "ceiling")).toEqual([]);
    expect(fanCoilRecessDepthMm(slsi, "rasomuro")).toBe(142);
    expect(
      airLeafRecessedAccessories(slsi, "wall", "rasomuro").map((a) => a.code),
    ).toEqual(["L01049II", "LC1095II"]);
    expect(
      airLeafRecessedAccessories(slsi, "wall", "traditional").map(
        (a) => a.code,
      ),
    ).toEqual(["L00700II", "LC0692II"]);
  });
  it("usa l'ingombro OEM del pannello per anteprima e collisioni", () => {
    const sli = fanCoilCatalog.products.find(
      (p) => p.id === "innova-airleaf-sli-200-2t",
    )!;
    const slsi = fanCoilCatalog.products.find(
      (p) => p.id === "innova-airleaf-slsi-200-2t",
    )!;
    expect(fanCoilPanelDimensions(sli, "traditional")).toEqual({
      widthMm: 772,
      heightMm: 754,
      depthMm: 30,
    });
    expect(fanCoilPanelDimensions(sli, "rasomuro")).toEqual({
      widthMm: 707,
      heightMm: 723,
      depthMm: 30,
    });
    expect(fanCoilPanelDimensions(slsi, "rasomuro")).toEqual({
      widthMm: 707,
      heightMm: 523,
      depthMm: 30,
    });
    const base = fixture();
    const project = applyFanCoil(base, base.rooms[0].id, sli.id, {
      mounting: "wall",
      panelType: "traditional",
    });
    const envelope = fanCoilEnvelope(project.fanCoils![0]);
    const [a, b, c, d] = envelope.cornersXY;
    expect(
      Math.max(
        Math.hypot(a.x - b.x, a.y - b.y),
        Math.hypot(b.x - c.x, b.y - c.y),
        Math.hypot(c.x - d.x, c.y - d.y),
        Math.hypot(d.x - a.x, d.y - a.y),
      ),
    ).toBeCloseTo(0.772);
    expect(envelope.maxZ - envelope.minZ).toBeCloseTo(0.754);
  });
  it("tiene i canalizzabili in una categoria a parte, dentro i ventilconvettori", () => {
    const ducted = fanCoilCatalog.products.filter(
      (p) => fanCoilCategory(p) === "ducted",
    );
    expect(new Set(ducted.map((p) => `${p.manufacturer} ${p.family}`))).toEqual(
      new Set(["Aermec FCZ", "Aermec FCZ P", "Aermec FCZ PO"]),
    );
    expect(ducted).toHaveLength(66);
    for (const product of fanCoilCatalog.products.filter(
      (p) => p.manufacturer !== "Aermec",
    ))
      expect(fanCoilCategory(product)).toBe("ambient");
    expect(fanCoilCategories).toEqual(["ducted", "ambient"]);
    expect(fanCoilCategoryLabels.ducted).toBe("Ventilconvettori canalizzabili");
  });

  it("importa solo taglie P/PO documentate con ingombro senza mobile e condizioni distinte", () => {
    const concealed = fanCoilCatalog.products.filter((p) =>
      ["FCZ P", "FCZ PO"].includes(p.family),
    );
    expect(concealed.filter((p) => p.family === "FCZ P")).toHaveLength(26);
    expect(concealed.filter((p) => p.family === "FCZ PO")).toHaveLength(21);
    expect(
      concealed.some((p) =>
        ["FCZ100PO", "FCZ800PO", "FCZ1000PO"].includes(p.model),
      ),
    ).toBe(false);
    for (const product of concealed) {
      expect(product.depthMm).toBe(216);
      expect(product.operatingPoints).toHaveLength(3);
      expect(product.mountings).toEqual(["wall", "ceiling"]);
      expect(product.sourceMetadata.sourceUrl).toBe(
        "https://www.aermec.com/download?id=22888",
      );
      expect(product.operatingPoints[0].heatingConditions).toContain(
        product.pipes === "4" ? "65/55" : "45/40",
      );
      if (product.family === "FCZ PO") {
        expect(product.operatingPoints[1].label).toBe("Media · 50 Pa");
        expect(
          product.operatingPoints.every((point) => point.noiseDbA === null),
        ).toBe(true);
      }
    }
    const p = concealed.find((p) => p.model === "FCZ200P")!;
    const po = concealed.find((p) => p.model === "FCZ200PO")!;
    expect([p.widthMm, p.heightMm, p.depthMm]).toEqual([562, 453, 216]);
    expect(p.operatingPoints[2].coolingW).toBe(1600);
    expect(po.operatingPoints[2].coolingW).toBe(1440);
    expect(
      concealed.find((p) => p.model === "FCZ201P")!.operatingPoints[2]
        .airflowM3h,
    ).toBeNull();
  });

  it("posa P/PO a soffitto e conserva i prodotti delle versioni precedenti", () => {
    const previous = fanCoilCatalogAtVersion("fan-coils-211ce7f343b9c3dd")!;
    expect(previous).not.toBeNull();
    for (const product of previous.products) {
      expect(fanCoilProductAtVersion(product.id, previous.version)).toEqual(
        product,
      );
      if (product.manufacturer !== "Innova")
        expect(
          fanCoilCatalog.products.find((p) => p.id === product.id),
        ).toEqual(product);
    }
    expect(fanCoilCatalog.controls).toEqual(previous.controls);
    for (const id of ["aermec-fcz200p", "aermec-fcz201po"]) {
      // I canalizzabili sono ad incasso: a soffitto serve un vuoto tecnico.
      const p = fixture();
      p.rooms[0].ceilingHeightM = 2.4;
      const placed = applyFanCoil(p, p.rooms[0].id, id, {
        mounting: "ceiling",
      });
      const loaded = projectSchema.parse(JSON.parse(JSON.stringify(placed)));
      expect(loaded.fanCoils![0].productId).toBe(id);
      expect(loaded.fanCoils![0].depthMm).toBe(216);
      expect(
        installedFanCoilCapacity(loaded, p.rooms[0].id).coolingW,
      ).toBeGreaterThan(0);
    }
  });

  it("persiste più modelli nello stesso ambiente senza sovrascrivere la posa", () => {
    let p = fixture();
    const roomId = p.rooms[0].id;
    p = applyFanCoil(p, roomId, "aermec-fcz100");
    const first = structuredClone(p.fanCoils![0]);
    p = applyFanCoil(p, roomId, "innova-airleaf-sli-400-2t", {
      controllerId: "innova-efb749ii",
    });
    expect(p.fanCoils).toHaveLength(2);
    expect(p.fanCoils![0]).toEqual(first);
    expect(
      deviceEnvelopesOverlap(
        fanCoilEnvelope(first),
        fanCoilEnvelope(p.fanCoils![1]),
      ),
    ).toBe(false);
    const loaded = projectSchema.parse(JSON.parse(JSON.stringify(p)));
    expect(loaded.fanCoils).toEqual(p.fanCoils);
    expect(loaded.fanCoils![1].controllerBoard).toBe("ESE745II");
    expect(loaded.rooms[0].systemType).toBe("fanCoil");
    const original = fanCoilProductAtVersion(
      first.productId,
      first.catalogVersion,
    )!;
    expect(installedFanCoilCapacity(loaded, roomId).coolingW).toBe(
      fanCoilMaximumPoint(original).point.coolingW + 2120,
    );
  });

  it("dimensiona sul residuo considerando tutti i ventilconvettori dell'ambiente", () => {
    let p = fixture();
    const roomId = p.rooms[0].id;
    p = applyFanCoil(p, roomId, "aermec-fcz200");
    p = createInstallation(p, "fanCoil", roomId);
    p = applyFanCoil(p, roomId, "aermec-fcz100", {
      installationId: p.installations.at(-1)!.id,
    });
    expect(installedFanCoilCapacity(p, roomId)).toEqual({
      coolingW: 2600,
      heatingW: 3030,
      unknownCount: 0,
    });
    const suggestion = sizeFanCoils(p, p.rooms[0], {
      manufacturer: "Aermec",
      mounting: "wall",
    })[0];
    expect(suggestion.point.coolingW).toBeGreaterThanOrEqual(
      p.rooms[0].designLoadW - 2600,
    );
    expect(suggestion.point.coolingW).toBeLessThan(p.rooms[0].designLoadW);
  });

  it("non consiglia altri apparecchi quando il fabbisogno è già coperto", () => {
    let p = fixture();
    p = applyFanCoil(p, p.rooms[0].id, "aermec-fcz600");
    expect(
      sizeFanCoils(p, p.rooms[0], { manufacturer: "Aermec", mounting: "wall" }),
    ).toEqual([]);
  });

  it("usa sempre il punto di massima anche nei progetti salvati con una velocità inferiore", () => {
    let p = fixture();
    p = applyFanCoil(p, p.rooms[0].id, "aermec-fcz100");
    const unit = p.fanCoils![0];
    expect(unit.operatingPointIndex).toBe(2);
    expect(installedFanCoilCapacity(p, p.rooms[0].id).coolingW).toBe(1000);
    const legacy = {
      ...p,
      fanCoils: p.fanCoils!.map((u) => ({ ...u, operatingPointIndex: 0 })),
    };
    expect(installedFanCoilCapacity(legacy, p.rooms[0].id).coolingW).toBe(
      1000,
    );
    expect(recomputeProject(legacy).fanCoils![0].operatingPointIndex).toBe(2);
    expect(() =>
      updateFanCoil(p, unit.id, { controllerId: "innova-eeb749ii" }),
    ).toThrow("non documentato");
  });

  it("suggerisce solo punti che soddisfano sia freddo sia caldo con rumore della stessa velocità", () => {
    const p = fixture(),
      room = p.rooms[0];
    const product = structuredClone(
      fanCoilCatalog.products.find((u) => u.id === "aermec-fcz100")!,
    );
    product.operatingPoints = [
      {
        ...product.operatingPoints[0],
        label: "Bassa",
        coolingW: 1800,
        heatingW: 900,
        noiseDbA: 23,
      },
      {
        ...product.operatingPoints[1],
        label: "Media",
        coolingW: 1900,
        heatingW: 1900,
        noiseDbA: 48,
      },
      {
        ...product.operatingPoints[2],
        label: "Alta",
        coolingW: 2000,
        heatingW: 2000,
        noiseDbA: 35,
      },
    ];
    const catalog: FanCoilCatalog = {
      version: "test",
      products: [product],
      controls: [],
    };
    const suggestions = sizeFanCoils(
      p,
      room,
      { requiredCoolingW: 1500, requiredHeatingW: 1500 },
      catalog,
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].point.label).toBe("Alta");
    expect(suggestions[0].point.noiseDbA).toBe(35);
    product.operatingPoints[2].noiseDbA = null;
    expect(
      sizeFanCoils(
        p,
        room,
        { requiredCoolingW: 1500, requiredHeatingW: 1500 },
        catalog,
      )[0].noiseUnverified,
    ).toBe(true);
  });

  it("associa M7 solo alle famiglie documentate e alla scheda corretta per tubi e collegamento", () => {
    const wired = fanCoilCatalog.controls.find(
      (c) => c.id === "innova-eeb749ii",
    )!;
    const bluetooth = fanCoilCatalog.controls.find(
      (c) => c.id === "innova-egb749ii",
    )!;
    const sli = fanCoilCatalog.products.find(
      (p) => p.family === "AirLeaf SLI",
    )!;
    expect(controllerBoardFor(sli, wired)).toBe("ESE745II");
    expect(controllerBoardFor({ ...sli, pipes: "4" }, wired)).toBe("ESE748II");
    expect(controllerBoardFor(sli, bluetooth)).toBe("ESE746II");
    expect(controllerBoardFor({ ...sli, pipes: "4" }, bluetooth)).toBe(
      "ESE741II",
    );
    for (const family of ["AirLeaf SL", "AirLeaf SLS", "FCZ", "Bi2 Air"])
      expect(
        compatibleFanCoilControls(
          fanCoilCatalog.products.find((p) => p.family === family)!,
        ),
      ).toEqual([]);
  });

  it("quota soffitto indica faccia inferiore e blocca collisioni senza spostare apparecchi esistenti", () => {
    let p = fixture();
    p = applyFanCoil(p, p.rooms[0].id, "aermec-fcz100", {
      mounting: "ceiling",
    });
    const first = p.fanCoils![0];
    const envelope = fanCoilEnvelope(first);
    expect(envelope.minZ).toBeCloseTo(
      p.rooms[0].heightM - first.depthMm / 1000,
    );
    expect(envelope.maxZ).toBeCloseTo(p.rooms[0].heightM);
    p = applyFanCoil(p, p.rooms[0].id, "aermec-fcz100", {
      mounting: "ceiling",
    });
    const second = p.fanCoils![1];
    expect(fanCoilPlacementValid(p, second)).toBe(true);
    expect(() =>
      updateFanCoil(p, second.id, { position: first.position }),
    ).toThrow("sovrapposta");
    expect(() =>
      updateFanCoil(p, second.id, { position: { x: 100, y: 100 } }),
    ).toThrow("fuori");
    expect(p.fanCoils![0]).toEqual(first);
  });

  it("mappa i mobili Aermec MZA/MZU solo sulle taglie FCZ P compatibili", () => {
    const concealed = fanCoilCatalog.products.filter(
      (item) => item.family === "FCZ P",
    );
    expect(concealed.length).toBeGreaterThan(0);
    expect(
      new Set(
        concealed.map((item) => fanCoilCoverAccessory(item, "fixed")?.code),
      ),
    ).toEqual(
      new Set(["MZA100", "MZA200", "MZA300", "MZA500", "MZA800", "MZA900"]),
    );
    const product = fanCoilCatalog.products.find(
      (item) => item.id === "aermec-fcz400p",
    )!;
    expect(fanCoilCoverAccessory(product, "fixed")).toMatchObject({
      code: "MZA500",
    });
    expect(fanCoilCoverAccessory(product, "adjustable")).toMatchObject({
      code: "MZU500",
    });
    expect(
      fanCoilInstallationAccessories(product, "wall", null, "fixed"),
    ).toContainEqual(expect.objectContaining({ code: "MZA500" }));
    expect(
      fanCoilCoverAccessory(
        fanCoilCatalog.products.find((item) => item.id === "aermec-fcz200po")!,
        "fixed",
      ),
    ).toBeNull();
  });

  it("preserva blocchi operatore e ripristina tipo stanza rimuovendo l’ultimo apparecchio", () => {
    let p = fixture();
    p = applyFanCoil(p, p.rooms[0].id, "aermec-fcz100");
    const id = p.fanCoils![0].id;
    p = updateFanCoil(p, id, { locked: true });
    expect(() => removeFanCoil(p, id)).toThrow("Sbloccare");
    p = updateFanCoil(p, id, { locked: false });
    p = removeFanCoil(p, id);
    expect(p.fanCoils).toEqual([]);
    expect(p.rooms[0].systemType).toBe("none");
  });
});
