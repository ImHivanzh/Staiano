import { describe, expect, it } from "vitest";
import type { Project } from "@/schemas/project";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { ecoclimaPriceCatalog } from "@/domain/catalogs/ecoclima-prices";
import { ecoclimaPriceCatalogSchema } from "@/domain/catalogs/ecoclima-price-schema";
import {
  calculateEcoclimaBom,
  commercialChoicesForTerminal,
  resolveTerminalAccessorySpecification,
  terminalSupplyConnections,
  terminalPlenumSpecification,
} from "./commercial-bom";

type Terminal = Project["airTerminals"][number];
it("resolves every standard EDLS module independently in a composed line", () => {
  const family = airTerminalCatalog.families.find(
    (item) => item.familyCode === "EDLS",
  )!;
  for (const variant of family.variants) {
    for (const length of variant.commercialLengthsMm) {
      expect(
        terminalPlenumSpecification("EDLS", variant, length)?.lengthMm,
      ).toBe(length);
    }
    const modules = [2000, 2000].map((length) =>
      terminalPlenumSpecification("EDLS", variant, length)!,
    );
    expect(modules.map((item) => item.lengthMm)).toEqual([2000, 2000]);
    expect(modules.reduce((sum, item) => sum + item.portCount, 0)).toBe(4);
    expect(terminalPlenumSpecification("EDLS", variant, 4000)).toBeNull();
  }
});
function terminal(lengthMm = 1000, slots = 1, width = 20): Terminal {
  const family = airTerminalCatalog.families.find(
    (item) => item.familyCode === "EDLS",
  )!;
  const variant = family.variants.find(
    (item) => item.slotCount === slots && item.slotWidthMm === width,
  )!;
  return {
    id: "edls-a",
    floorId: "floor",
    roomId: "room",
    wallId: null,
    position: { x: 0, y: 0 },
    rotation: 0,
    widthMm: lengthMm,
    heightMm: variant.faceHeightMm!,
    depthMm: variant.bodyDepthMm ?? null,
    productId: variant.id,
    catalogVersion: airTerminalCatalog.version,
    family: "EDLS",
    use: "supply",
    requiredAirflowM3h: 280,
    availableAirflowM3h: 280,
    noiseDbA: 32,
    noiseUpperBoundDbA: 32,
    noiseLabel: "32",
    theoreticalLengthM: 1,
    systemId: "system",
    mounting: "ceiling",
    shape: "rectangle",
    elevationM: 2.7,
    operatingPointIndex: 2,
    pressureDropPa: 26,
    throwM: 3.6,
    openingMm: null,
    pointIndex: 0,
    unitIndex: 0,
    legacyUnverified: false,
    locked: false,
    decisionOrigin: "calculated",
    style: "",
    color: "",
    finish: "",
    productCode: "",
    plenumId: null,
    commercialOptions: {
      profileCode: "EDLS20-FA",
      colorCode: "RAL9005",
      fixingBridges: true,
      continuityKit: true,
    },
  };
}
/** Corpo separato di catalogo: il plenum non è mai implicito nella bocchetta. */
function cataloguePlenumFor(item: Terminal): Project["plenums"][number] | null {
  const spec = resolveTerminalAccessorySpecification(item)?.plenum;
  if (!spec?.lengthMm || !spec.widthMm || !spec.heightMm) return null;
  return {
    id: `pl-${item.id}`,
    systemId: item.systemId,
    attachmentId: item.id,
    floorId: item.floorId,
    roomId: item.roomId,
    use: item.use,
    position: item.position,
    rotation: item.rotation,
    widthMm: spec.lengthMm!,
    heightMm: spec.heightMm!,
    depthMm: spec.widthMm!,
    portCount: spec.portCount,
    portDiameterMm: spec.portDiameterMm,
    model: spec.modelCode,
    material: "insulated",
    connectionPosition: spec.connectionPosition,
    status: "proposed",
    locked: false,
    designSettings: null,
  };
}
const quote = (
  terminals: Terminal[],
  plenums: Project["plenums"] = terminals.flatMap((item) => {
    const plenum = cataloguePlenumFor(item);
    return plenum ? [plenum] : [];
  }),
) =>
  calculateEcoclimaBom({
    airTerminals: terminals,
    hvacSystems: [],
    plenums,
  });
function installedFamily(
  familyCode: string,
  predicate: (
    variant: (typeof airTerminalCatalog.families)[number]["variants"][number],
  ) => boolean,
): Terminal {
  const family = airTerminalCatalog.families.find(
    (item) => item.familyCode === familyCode,
  )!;
  const variant = family.variants.find(predicate)!;
  const base = terminal();
  return {
    ...base,
    family: familyCode,
    productId: variant.id,
    widthMm:
      variant.faceWidthMm ?? variant.widthMm ?? variant.nominalDiameterMm!,
    heightMm:
      variant.faceHeightMm ?? variant.heightMm ?? variant.nominalDiameterMm!,
    depthMm: variant.bodyDepthMm ?? variant.depthMm ?? null,
    commercialOptions: {
      fixingBridges: true,
      continuityKit: true,
    },
  };
}

describe("official Ecoclima list-price BOM", () => {
  it("never prices a relocated collar as the OEM plenum, including per-port side overrides", () => {
    const item = terminal();
    for (const change of [
      { connectionPosition: "left" as const },
      { connectionPositions: ["lower" as const] },
    ]) {
      const custom = { ...cataloguePlenumFor(item)!, ...change };
      expect(
        quote([item], [custom]).lines.find(
          (line) => line.kind === "insulated-plenum",
        )?.status,
      ).toBe("unknown");
    }
  });
  it("quotes the separate plenum only when its body is connected and catalogue-sized", () => {
    const item = terminal();
    const withoutBody = calculateEcoclimaBom({
      airTerminals: [item],
      hvacSystems: [],
    });
    expect(withoutBody.lines.map((line) => line.kind)).toEqual([
      "terminal",
      "fixing-bridge",
    ]);
    expect(
      withoutBody.lines.some((line) => line.kind === "insulated-plenum"),
    ).toBe(false);

    const catalogue = quote([item]);
    expect(
      catalogue.lines.map((line) => [line.kind, line.unitPriceCents]),
    ).toEqual([
      ["terminal", 6365],
      ["insulated-plenum", 8687],
      ["fixing-bridge", 1272],
    ]);

    const custom = cataloguePlenumFor(item)!;
    Object.assign(custom, {
      material: "galvanized",
      connectionPosition: "lower",
      model: "Plenum su misura",
    });
    const plenumLine = quote([item], [custom]).lines.find(
      (line) => line.kind === "insulated-plenum",
    )!;
    expect(plenumLine).toMatchObject({
      status: "unknown",
      unitPriceCents: null,
    });
    expect(plenumLine.reason).toContain("configurato separatamente");
    // Gli stacchi di progetto restano quelli di catalogo del terminale.
    const connections = terminalSupplyConnections(
      { airTerminals: [item] },
      "system",
    );
    expect(connections.issues).toEqual([]);
    expect(connections.connections.length).toBeGreaterThan(0);
  });
  it("includes the white paint supplement and does not quote other RAL colours at the anodized price", () => {
    const base = installedFamily("EGA6", () => true);
    const line = (color: string) =>
      quote([{ ...base, color }]).lines.find(
        (item) => item.kind === "terminal",
      )!;
    const anodized = line("Alluminio anodizzato naturale");
    expect(anodized.unitPriceCents).not.toBeNull();
    expect(line("RAL9016").unitPriceCents).toBe(
      Math.round(anodized.unitPriceCents! * 1.2),
    );
    expect(line("RAL7035").unitPriceCents).toBeNull();
    expect(line("RAL7035").reason).toContain("quotare");
  });
  it("calculates exact published diffuser, isolated plenum and required bridges in integer cents", () => {
    const result = quote([terminal()]);
    expect(result.complete).toBe(true);
    expect(
      result.lines.map((line) => [
        line.kind,
        line.quantity,
        line.unitPriceCents,
        line.extendedPriceCents,
      ]),
    ).toEqual([
      ["terminal", 1, 6365, 6365],
      ["insulated-plenum", 1, 8687, 8687],
      ["fixing-bridge", 2, 1272, 2544],
    ]);
    expect(result.totalCents).toBe(17596);
    expect(result.taxTreatment).toBe("not-specified-by-source");
    // La riga di listino porta le misure di catalogo, non solo il prezzo.
    expect(result.lines[0].dimensions).toBe("L 1000 mm; 1 feritoia da 20 mm");
    expect(
      result.lines.every((line) => line.sourceMetadata?.sha256.length === 64),
    ).toBe(true);
  });
  it("uses three bridges for a 2000 mm three-slot module from the montage table", () => {
    const item = terminal(2000, 3),
      specification = resolveTerminalAccessorySpecification(item)!;
    expect(specification.fixingBridgeQuantity).toBe(3);
    expect(specification.fixingBridgeSourceMetadata?.page).toBe(4);
    expect(specification.plenum).toMatchObject({
      lengthMm: 2000,
      widthMm: 145,
      heightMm: 300,
      portCount: 2,
      portDiameterMm: 198,
      material: "Acciaio zincato",
      insulation: "Isolamento esterno in polietilene espanso",
    });
    expect(quote([item]).totalCents).toBe(50107);
  });
  it("counts n-1 official continuity kits only for recorded, physically adjacent modules", () => {
    const a = terminal(),
      b = { ...terminal(), id: "edls-b", position: { x: 1, y: 0 } };
    a.commercialOptions = {
      ...a.commercialOptions!,
      linearRunId: "run",
      linearRunOrder: 0,
    };
    b.commercialOptions = {
      ...b.commercialOptions!,
      linearRunId: "run",
      linearRunOrder: 1,
    };
    const result = quote([a, b]);
    expect(
      result.lines.find((line) => line.kind === "continuity-kit"),
    ).toMatchObject({
      quantity: 1,
      unitPriceCents: 239,
      extendedPriceCents: 239,
    });
    expect(result.totalCents).toBe(35431);
    b.position.x = 1.1;
    expect(
      quote([a, b]).lines.find((line) => line.kind === "continuity-kit"),
    ).toMatchObject({ quantity: null, status: "unknown" });
    expect(quote([a, b]).totalCents).toBeNull();
  });
  it("leaves unrecorded old order choices unknown while resolving shared original plenum ports", () => {
    const item = terminal(1200);
    delete item.commercialOptions;
    const result = quote([item]);
    expect(result.complete).toBe(false);
    expect(result.totalCents).toBeNull();
    expect(result.lines[0]).toMatchObject({
      unitPriceCents: null,
      status: "unknown",
    });
    const ports = terminalSupplyConnections({ airTerminals: [item] }, "system");
    expect(ports.issues).toEqual([]);
    expect(
      ports.connections.map((port) => [
        port.terminalPortIndex,
        port.portDiameterMm,
        port.airflowM3h,
      ]),
    ).toEqual([
      [0, 145, 140],
      [1, 145, 140],
    ]);
    expect(ports.connections[0].sourceMetadata.page).toBe(5);
  });
  it("never interpolates lengths or repairs malformed manufacturer price cells", () => {
    const custom = terminal(1100);
    expect(commercialChoicesForTerminal(custom)).toEqual([]);
    expect(quote([custom], []).totalCents).toBeNull();
    const malformed = terminal(1200, 2);
    malformed.use = "return";
    malformed.commercialOptions!.profileCode = "EDLS30-FA";
    expect(quote([malformed]).lines[0].unitPriceCents).toBeNull();
    expect(
      ecoclimaPriceCatalog.prices.some(
        (price) => price.originalPrice === "150,00 0",
      ),
    ).toBe(false);
  });
  it("rejects retailer provenance and duplicate normalized SKU ids", () => {
    const bad = structuredClone(ecoclimaPriceCatalog);
    bad.prices[0].sourceMetadata.sourceUrl =
      "https://retailer.example/discounted-price";
    expect(ecoclimaPriceCatalogSchema.safeParse(bad).success).toBe(false);
    const duplicate = structuredClone(ecoclimaPriceCatalog);
    duplicate.prices.push(duplicate.prices[0]);
    expect(ecoclimaPriceCatalogSchema.safeParse(duplicate).success).toBe(false);
  });
  it("keeps mandatory bridges visible when a saved exclusion would make the BOM incomplete", () => {
    const item = terminal();
    item.commercialOptions!.fixingBridges = false;
    const result = quote([item]);
    expect(result.totalCents).toBeNull();
    expect(
      result.lines.find((line) => line.kind === "fixing-bridge"),
    ).toMatchObject({
      quantity: 2,
      unitPriceCents: 1272,
      status: "unknown",
      extendedPriceCents: null,
    });
  });
  it("distinguishes machine plenum fabrication from the Ecoclima terminal plenum list price", () => {
    const item = terminal();
    const result = calculateEcoclimaBom({
      airTerminals: [item],
      plenums: [cataloguePlenumFor(item)!],
      hvacSystems: [
        {
          id: "system",
          type: "ducted",
          manufacturer: "Mitsubishi Electric",
          productId: "machine",
          roomIds: ["room"],
          capacityW: 3500,
          airflowM3h: 840,
          catalogVersion: "machine-version",
          indoorUnits: [],
          outdoorUnit: null,
          compatibilityStatus: "verified",
          linearPlan: null,
        },
      ],
    });
    expect(result.knownSubtotalCents).toBe(17596);
    expect(
      result.lines.find((line) => line.kind === "machine-plenum"),
    ).toMatchObject({
      quantity: 1,
      unitPriceCents: null,
      sourceMetadata: null,
      status: "unknown",
    });
    expect(result.complete).toBe(false);
    expect(result.totalCents).toBeNull();
  });
  it("maps the EDSC circular model and its exact 125 mm original plenum connection", () => {
    const item = installedFamily(
      "EDSC-C",
      (variant) => variant.nominalDiameterMm === 125,
    );
    item.commercialOptions!.profileCode = "EDSC-C";
    const result = quote([item]);
    expect(result.totalCents).toBe(22138);
    expect(result.lines.map((line) => [line.sku, line.unitPriceCents])).toEqual(
      [
        ["DDS0006010", 13409],
        ["DD88001250", 8729],
      ],
    );
    expect(result.lines[0].label).toBe(
      "EDSC-C D.125 DIFFUSORE CIRCOLARE A SCOMPARSA PER CARTONGESSO",
    );
    expect(
      terminalSupplyConnections({ airTerminals: [item] }, "system").connections,
    ).toMatchObject([{ portDiameterMm: 125, portCount: 1 }]);
  });
  it("includes the required EBLF fixing kit of four brackets as one manufacturer kit", () => {
    const item = installedFamily(
      "EBLF",
      (variant) => variant.widthMm === 400 && variant.heightMm === 75,
    );
    item.commercialOptions!.profileCode = "EBLF-20/0°";
    const result = quote([item], []);
    expect(
      result.lines.find((line) => line.kind === "fixing-kit"),
    ).toMatchObject({
      quantity: 1,
      unitPriceCents: 3090,
      extendedPriceCents: 3090,
      quantitySourceMetadata: { page: 2, sourceType: "pdf" },
    });
    expect(result.totalCents).toBe(6455);
  });
  it("maps the PUSH grille outer face 595 mm to its official 560 mm insulated plenum", () => {
    const item = installedFamily(
      "EGQ-PUSH",
      (variant) => variant.widthMm === 595,
    );
    item.use = "return";
    item.commercialOptions!.profileCode = "EGQ-PUSH";
    const specification = resolveTerminalAccessorySpecification(item)!;
    expect(specification.plenum).toMatchObject({
      lengthMm: 560,
      widthMm: 560,
      portCount: 1,
      portDiameterMm: 250,
      connectionPosition: "lateral",
    });
    expect(quote([item]).lines.map((line) => line.unitPriceCents)).toEqual([
      17165, 12801,
    ]);
    expect(quote([item]).totalCents).toBe(29966);
  });
  it("offers published EBCV mounting diameters and stores the selected duct size rather than guessing it", () => {
    const family = airTerminalCatalog.families.find(
      (item) => item.familyCode === "EBCV",
    )!;
    const variant = family.variants[0];
    const item: Terminal = {
      ...terminal(),
      family: "EBCV",
      productId: variant.id,
      widthMm: variant.faceWidthMm!,
      heightMm: variant.faceHeightMm!,
      commercialOptions: {
        fixingBridges: false,
        continuityKit: false,
      },
    };
    const choices = commercialChoicesForTerminal(item);
    expect(choices.length).toBeGreaterThan(1);
    expect(
      new Set(
        choices.map((choice) => choice.dimensions.diameterMm).filter(Boolean),
      ).size,
    ).toBeGreaterThan(1);
    item.commercialOptions!.mountingDuctDiameterMm =
      choices[0].dimensions.diameterMm!;
    expect(
      commercialChoicesForTerminal(item).map((choice) => choice.modelCode),
    ).toContain(choices[0].modelCode);
  });
  it("keeps original terminal-plenum connections independent of every price amount", () => {
    const item = terminal(1200),
      changed = structuredClone(ecoclimaPriceCatalog);
    changed.prices = changed.prices.map((price) => ({
      ...price,
      unitPriceCents: 999999,
    }));
    expect(
      terminalSupplyConnections({ airTerminals: [item] }, "system", changed),
    ).toEqual(
      terminalSupplyConnections(
        { airTerminals: [item] },
        "system",
        ecoclimaPriceCatalog,
      ),
    );
  });
});
