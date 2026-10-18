import { describe, expect, it } from "vitest";
import {
  hvacCatalog,
  hvacCatalogAtVersion,
  hvacDischargeConnection,
} from "@/domain/catalogs/hvac";
import { machinePlenumGeometry } from "./machine-plenum";
import type { PlenumBranch } from "./plenum";
function branch(
  id: string,
  diameterMm: number | null,
  verified = true,
): PlenumBranch {
  return {
    id,
    roomId: id,
    roomName: id,
    pointIndex: 0,
    terminalIds: [id],
    terminalModels: [id],
    airflowM3h: 100,
    minimumDiameterMm: diameterMm,
    diameterMm,
    velocityMs: 2,
    verified,
  };
}
describe("raccordi macchina e plenum su misura", () => {
  it("documenta tutti21 raccordi senza usare larghezza carter", () => {
    expect(hvacCatalog.products).toHaveLength(21);
    for (const machine of hvacCatalog.products) {
      const c = hvacDischargeConnection(machine)!;
      expect(c.connectionWidthMm).toBeLessThan(machine.widthMm!);
      expect(c.connectionHeightMm).toBeLessThan(machine.heightMm!);
      expect(c.sourceMetadata.sha256).toHaveLength(64);
      expect(c.sourceMetadata.page).toBeGreaterThan(0);
    }
    const gree = hvacCatalog.products.find(
      (p) => p.indoorModel === "GUD35PS1/A-S",
    )!;
    expect(hvacDischargeConnection(gree)).toMatchObject({
      connectionWidthMm: 585,
      connectionHeightMm: 122,
    });
    const mitsu = hvacCatalog.products.find(
      (p) => p.indoorModel === "PEAD-M100JA2",
    )!;
    expect(hvacDischargeConnection(mitsu)).toMatchObject({
      connectionWidthMm: 1360,
      connectionHeightMm: 178,
      collarDepthMm: 15,
    });
  });
  it("preserva prestazioni del catalogo storico aggiungendo soltanto disegno identico modello", () => {
    const old = hvacCatalogAtVersion("2026-10-03-hvac-9505613a27bb")!;
    expect(old).not.toBeNull();
    expect(old.products[0].dischargeConnection).toBeUndefined();
    expect(hvacDischargeConnection(old.products[0])?.connectionWidthMm).toBe(
      860,
    );
    expect(old.products[0].airflowOptions[1].airflowM3h).toBe(720);
    expect(
      hvacDischargeConnection({
        ...old.products[0],
        indoorModel: "UNPUBLISHED",
      }),
    ).toBeNull();
  });
  it("non inventa altezza libera Daikin o foratura non quotata", () => {
    for (const machine of hvacCatalog.products.filter(
      (p) => p.manufacturer === "Daikin",
    )) {
      const c = hvacDischargeConnection(machine)!;
      expect(c.dimensionBasis).toBe("flangeMountingSpan");
      expect(c.clearOpeningHeightMm).toBeNull();
      expect(c.holePattern).toBeNull();
      const g = machinePlenumGeometry([branch("a", 145)], machine);
      expect(g.issues.join(" ")).toContain("altezza netta");
    }
  });
  it("dispone tutti gli stacchi reali mantenendo margini, distanza e raccordo15°", () => {
    for (const machine of hvacCatalog.products) {
      const branches = Array.from({ length: 17 }, (_, i) =>
        branch(String(i), [145, 198, 250][i % 3]),
      );
      const g = machinePlenumGeometry(branches, machine);
      expect(g.status).toBe("proposed");
      expect(g.ports).toHaveLength(17);
      for (const p of g.ports) {
        expect(Math.abs(p.centerMm[0]) + p.diameterMm / 2).toBeLessThanOrEqual(
          g.bodyWidthMm! / 2 - g.settings.edgeClearanceMm + 1e-7,
        );
        expect(Math.abs(p.centerMm[1]) + p.diameterMm / 2).toBeLessThanOrEqual(
          g.bodyHeightMm! / 2 - g.settings.edgeClearanceMm + 1e-7,
        );
      }
      for (let i = 0; i < g.ports.length; i++)
        for (let j = i + 1; j < g.ports.length; j++) {
          const a = g.ports[i],
            b = g.ports[j];
          expect(
            Math.hypot(
              a.centerMm[0] - b.centerMm[0],
              a.centerMm[1] - b.centerMm[1],
            ),
          ).toBeGreaterThanOrEqual(
            (a.diameterMm + b.diameterMm) / 2 +
              g.settings.portClearanceMm -
              1e-7,
          );
        }
      const delta =
        Math.max(
          g.bodyWidthMm! - g.inlet!.connectionWidthMm,
          g.bodyHeightMm! - g.inlet!.connectionHeightMm,
        ) / 2;
      expect(
        (Math.atan(delta / g.transitionDepthMm!) * 180) / Math.PI,
      ).toBeLessThanOrEqual(7.5 + 1e-7);
    }
  });
  it("cambia larghezza e numero file mantenendo diametri dei terminali", () => {
    const m = hvacCatalog.products[0],
      branches = Array.from({ length: 8 }, (_, i) => branch(String(i), 145));
    const narrow = machinePlenumGeometry(branches, m),
      wide = machinePlenumGeometry(branches, m, { faceWidthMm: 1500 });
    expect(narrow.rows).toBeGreaterThan(wide.rows);
    expect(narrow.ports.map((p) => p.diameterMm)).toEqual(
      wide.ports.map((p) => p.diameterMm),
    );
    expect(
      machinePlenumGeometry(branches, m, { faceWidthMm: 300 }).status,
    ).toBe("unavailable");
    expect(
      machinePlenumGeometry(branches, m, { portClearanceMm: NaN }).status,
    ).toBe("unavailable");
  });
  it("non produce corpo verificato per macchina sconosciuta o stacchi incompleti", () => {
    expect(machinePlenumGeometry([branch("a", 145)], null).ports).toEqual([]);
    const partial = machinePlenumGeometry(
      [branch("a", 145), branch("b", null, false)],
      hvacCatalog.products[0],
    );
    expect(partial.status).toBe("pending");
    expect(partial.ports).toHaveLength(1);
    expect(
      machinePlenumGeometry([], hvacCatalog.products[0]).bodyWidthMm,
    ).toBeNull();
  });
});
