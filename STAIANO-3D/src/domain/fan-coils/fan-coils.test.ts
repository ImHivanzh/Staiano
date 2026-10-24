import { describe, expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import { projectSchema } from "@/schemas/project";
import {
  fanCoilCatalog,
  fanCoilProductAtVersion,
  fanCoilCatalogAtVersion,
  compatibleFanCoilControls,
  controllerBoardFor,
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
  const p = createProject();
  return addRectangle(p, p.floors[0].id, {
    width: 8,
    length: 6,
    height: 2.7,
    name: "Salone",
  });
}

describe("ventilconvettori originali", () => {
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
      const placed = applyFanCoil(p, p.rooms[0].id, id, 1, {
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

  it("persiste più modelli e velocità nello stesso ambiente senza sovrascrivere la posa", () => {
    let p = fixture();
    const roomId = p.rooms[0].id;
    p = applyFanCoil(p, roomId, "aermec-fcz100", 1);
    const first = structuredClone(p.fanCoils![0]);
    p = applyFanCoil(p, roomId, "innova-airleaf-sli-400-2t", 0, {
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
      original.operatingPoints[1].coolingW + 2120,
    );
  });

  it("dimensiona sul residuo considerando tutti i ventilconvettori dell'ambiente", () => {
    let p = fixture();
    const roomId = p.rooms[0].id;
    p = applyFanCoil(p, roomId, "aermec-fcz200", 2);
    p = createInstallation(p, "fanCoil", roomId);
    p = applyFanCoil(p, roomId, "aermec-fcz100", 0, {
      installationId: p.installations.at(-1)!.id,
    });
    expect(installedFanCoilCapacity(p, roomId)).toEqual({
      coolingW: 2250,
      heatingW: 2560,
      unknownCount: 0,
    });
    const suggestion = sizeFanCoils(p, p.rooms[0], {
      manufacturer: "Aermec",
      mounting: "wall",
    })[0];
    expect(suggestion.point.coolingW).toBeGreaterThanOrEqual(
      p.rooms[0].designLoadW - 2250,
    );
    expect(suggestion.point.coolingW).toBeLessThan(p.rooms[0].designLoadW);
  });

  it("non consiglia altri apparecchi quando il fabbisogno è già coperto", () => {
    let p = fixture();
    p = applyFanCoil(p, p.rooms[0].id, "aermec-fcz600", 2);
    expect(
      sizeFanCoils(p, p.rooms[0], { manufacturer: "Aermec", mounting: "wall" }),
    ).toEqual([]);
  });

  it("modifica velocità e comando conservando posizione manuale e versione catalogo", () => {
    let p = fixture();
    p = applyFanCoil(p, p.rooms[0].id, "aermec-fcz100", 0);
    const before = structuredClone(p.fanCoils![0]);
    p = updateFanCoil(p, before.id, { operatingPointIndex: 2 });
    expect(p.fanCoils![0].position).toEqual(before.position);
    expect(p.fanCoils![0].rotation).toBe(before.rotation);
    expect(p.fanCoils![0].catalogVersion).toBe(before.catalogVersion);
    expect(installedFanCoilCapacity(p, p.rooms[0].id).coolingW).toBe(1000);
    expect(() =>
      updateFanCoil(p, before.id, { operatingPointIndex: 9 }),
    ).toThrow("Velocità");
    expect(() =>
      updateFanCoil(p, before.id, { controllerId: "innova-eeb749ii" }),
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
    expect(suggestions[0].operatingPointIndex).toBe(2);
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
    p = applyFanCoil(p, p.rooms[0].id, "aermec-fcz100", 1, {
      mounting: "ceiling",
    });
    const first = p.fanCoils![0];
    const envelope = fanCoilEnvelope(first);
    expect(envelope.minZ).toBeCloseTo(
      p.rooms[0].heightM - first.depthMm / 1000,
    );
    expect(envelope.maxZ).toBeCloseTo(p.rooms[0].heightM);
    p = applyFanCoil(p, p.rooms[0].id, "aermec-fcz100", 0, {
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

  it("preserva blocchi operatore e ripristina tipo stanza rimuovendo l’ultimo apparecchio", () => {
    let p = fixture();
    p = applyFanCoil(p, p.rooms[0].id, "aermec-fcz100", 0);
    const id = p.fanCoils![0].id;
    p = updateFanCoil(p, id, { locked: true });
    expect(() => removeFanCoil(p, id)).toThrow("Sbloccare");
    p = updateFanCoil(p, id, { locked: false });
    p = removeFanCoil(p, id);
    expect(p.fanCoils).toEqual([]);
    expect(p.rooms[0].systemType).toBe("none");
  });
});
