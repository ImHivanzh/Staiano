import { existsSync } from "node:fs";
import { expect, test } from "vitest";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { ecoclimaDiffuserModel, ecoclimaGrilleUrl } from "./ecoclima-diffuser-models";

const publicFile = (url: string) => existsSync(`public${url}`);
const hvacGrille = (code: string) =>
  code === "EGA6" ? "ega6" : code === "EBL" ? "ebl" : code === "EGF" ? "egf" : ["EGF-PUSH", "EGFR-PUSH"].includes(code) ? "egf-push" : null;

/** Famiglie senza modello 3D: il viewer usa il corpo generico con i dettagli frontali. */
const withoutModel = /^(EDFLB-FL|EGE|EAMV-V|EVREA|EVVAIR-[CQ]|EVVBOR|EVALI|EMV-.+)$/;

test("ogni variante del catalogo Ecoclima ha il GLB che il viewer carica", () => {
  const missing: string[] = [];
  for (const family of airTerminalCatalog.families) {
    const code = family.familyCode;
    for (const variant of family.variants) {
      const hvac = hvacGrille(code), diffuser = ecoclimaDiffuserModel(code), grille = ecoclimaGrilleUrl(code, variant.id);
      const urls = hvac ? [`/models/hvac/${hvac}-realistic.glb`]
        : diffuser ? [`/models/ecoclima/diffusers/${diffuser}.glb`]
        : grille ? [grille]
        : code === "EDLS" ? [`/models/ecoclima/edls-${variant.slotWidthMm === 30 ? 30 : 20}-${variant.slotCount}.glb`]
        : /^EDFLB?(NA)?-\d+$/.test(code) ?[`/models/ecoclima/edfl-realistic-${variant.slotCount}.glb`]
        : [];
      if (!urls.length && !withoutModel.test(code)) missing.push(`${code}: nessun percorso 3D`);
      missing.push(...urls.filter((url) => !publicFile(url)).map((url) => `${variant.id}: ${url}`));
    }
  }
  expect(missing).toEqual([]);
});
