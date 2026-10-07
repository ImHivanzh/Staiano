import { describe, expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import { projectSchema } from "@/schemas/project";
import {
  fanCoilCatalog,
  fanCoilProductAtVersion,
  compatibleFanCoilControls,
  controllerBoardFor,
  type FanCoilCatalog,
} from "@/domain/catalogs/fan-coils";
import { applyFanCoil, updateFanCoil, removeFanCoil } from "./apply";
import { installedFanCoilCapacity, sizeFanCoils } from "./size";
import { fanCoilEnvelope, fanCoilPlacementValid } from "./placement";
import { deviceEnvelopesOverlap } from "@/domain/geometry/device-envelope";

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
    expect(envelope.minZ).toBe(p.rooms[0].heightM);
    expect(envelope.maxZ).toBeCloseTo(
      p.rooms[0].heightM + first.depthMm / 1000,
    );
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
