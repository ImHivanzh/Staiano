import { describe, expect, it } from "vitest";
import type { PlenumBranch } from "@/domain/ducted/plenum";
import { hvacCatalog } from "@/domain/catalogs/hvac";
import { plenumLayout } from "./plenum-layout";
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
    terminalModels: [],
    airflowM3h: 100,
    minimumDiameterMm: diameterMm,
    diameterMm,
    velocityMs: 2,
    verified,
  };
}
const machine = hvacCatalog.products.find(
  (p) => p.indoorModel === "PEAD-M35JA2",
)!;
describe("schema metrico del plenum specifico macchina", () => {
  it("conserva diametri proporzionati e dimensioni documentate dell'adattatore", () => {
    const l = plenumLayout(
      [branch("a", 145), branch("b", 250), branch("c", 198)],
      machine,
    );
    expect(l.ports.map((p) => p.diameterM)).toEqual([0.145, 0.25, 0.198]);
    expect(l.inlet).toEqual([0.86, 0.178]);
    expect(l.body[0]).toBe(0.86);
    expect(l.body[1]).toBe(0.3);
    expect(l.geometry.status).toBe("proposed");
  });
  it("quotatura metrica coincide con coordinate e profondita del progetto", () => {
    const l = plenumLayout(
      Array.from({ length: 9 }, (_, i) => branch(String(i), i % 2 ? 198 : 145)),
      machine,
    );
    expect(l.rows).toBeGreaterThan(1);
    for (const p of l.ports) {
      expect(p.position[2]).toBeCloseTo(l.body[2]);
      expect(Math.abs(p.position[0]) + p.diameterM / 2).toBeLessThanOrEqual(
        l.body[0] / 2 - 0.025 + 1e-9,
      );
      expect(Math.abs(p.position[1]) + p.diameterM / 2).toBeLessThanOrEqual(
        l.body[1] / 2 - 0.025 + 1e-9,
      );
    }
    expect(l.body[2]).toBeCloseTo(l.transitionDepthM + l.boxDepthM);
    expect(l.geometry.totalDepthMm).toBeCloseTo((l.body[2] + 0.06) * 1000);
  });
  it("nessuna macchina o stacco verificato non crea corpo arbitrario", () => {
    expect(plenumLayout([branch("a", 145)], null).body).toEqual([0, 0, 0]);
    const l = plenumLayout(
      [
        branch("a", 145),
        branch("b", null, false),
        branch("c", 198, false),
        branch("d", 198),
      ],
      machine,
    );
    expect(l.ports.map((p) => p.number)).toEqual([1, 4]);
    expect(l.geometry.status).toBe("pending");
  });
});
