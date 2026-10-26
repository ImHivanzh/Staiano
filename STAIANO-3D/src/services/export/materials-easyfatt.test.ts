import { expect, it } from "vitest";
import { unzipSync, strFromU8 } from "three/addons/libs/fflate.module.js";
import { dossierFixture } from "@/services/pdf/fixture";
import { buildDossier } from "@/services/pdf/dossier";
import { materialsEasyfattXlsx } from "./materials-easyfatt";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { addOperatorTerminal } from "@/domain/air-terminals/operator";
import { calculateEcoclimaBom } from "@/domain/air-terminals/commercial-bom";

it("exports the selected PUSH closure at the standard EGA6 price", () => {
  const project = dossierFixture();
  const family = airTerminalCatalog.families.find(
    (item) => item.familyCode === "EGA6",
  )!;
  const variant = family.variants.find(
    (item) => item.widthMm === 600 && item.heightMm === 600,
  )!;
  const next = addOperatorTerminal(project, {
    roomId: project.rooms[0].id,
    systemId: project.hvacSystems[0].id,
    familyCode: family.familyCode,
    variantId: variant.id,
    operatingPointIndex: 0,
    use: "return",
    mounting: "ceiling",
    lengthMm: 600,
  });
  const terminal = next.airTerminals.at(-1)!;
  expect(terminal.style).toContain("PUSH");
  const price = calculateEcoclimaBom(next).lines.find(
    (line) =>
      line.kind === "terminal" && line.terminalIds.includes(terminal.id),
  )!;
  expect(price.unitPriceCents).toBeGreaterThan(0);
  const files = unzipSync(materialsEasyfattXlsx(next));
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  const row = [...sheet.matchAll(/<row r="(\d+)">([\s\S]*?)<\/row>/g)].find(
    (entry) => entry[2].includes("Chiusura PUSH"),
  )!;
  expect(row).toBeDefined();
  expect(row[2]).toContain(
    `<c r="D${row[1]}" s="1"><v>${price.unitPriceCents! / 100}</v></c>`,
  );
});

it("exports all manufacturers with real quantities and preserves absent prices as empty cells", () => {
  const project = dossierFixture();
  const dossier = buildDossier(project);
  const files = unzipSync(materialsEasyfattXlsx(project));
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  expect(sheet.match(/<row /g)!.length).toBeGreaterThan(
    dossier.materials.length + dossier.accessories.length + 1,
  );
  expect(sheet).toContain("Cordivari");
  expect(sheet).toContain("STANZA: Soggiorno");
  expect(sheet).toContain("STANZA: Camera matrimoniale");
  expect(sheet).toContain('<c r="D2"/>');
  expect(sheet).toMatch(/<c r="C\d+"><v>\d+(?:\.\d+)?<\/v><\/c>/);
  const pending = strFromU8(files["xl/worksheets/sheet2.xml"]);
  expect(pending).toContain("Prezzo da quotare");
  expect(sheet).not.toContain("<f>");
});

it("keeps descriptive room rows empty of quantity/price and includes items without order codes", () => {
  const project = dossierFixture();
  const radiator = project.radiators[0];
  project.radiators.push({ ...radiator, id: "second-radiator-same-room" });
  const dossier = buildDossier(project);
  const row = dossier.materials.find((item) =>
    item.codes.includes(dossier.codes.get(radiator.id)!),
  )!;
  const files = unzipSync(materialsEasyfattXlsx(project));
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  const rows = [...sheet.matchAll(/<row r="(\d+)">([\s\S]*?)<\/row>/g)];
  const description = rows.find((entry) =>
    entry[2].includes("STANZA: Camera matrimoniale"),
  )!;
  expect(description[2]).toContain(`<c r="C${description[1]}"/>`);
  expect(description[2]).toContain(`<c r="D${description[1]}"/>`);
  const material = rows.find(
    (entry) =>
      entry[2].includes("Cordivari") &&
      !entry[2].includes("Staffe") &&
      !entry[2].includes("Valvola") &&
      !entry[2].includes("Detentore") &&
      !entry[2].includes("Kit"),
  )!;
  expect(material[2]).toContain(`<c r="A${material[1]}"/>`);
  expect(material[2]).toContain(
    `<c r="C${material[1]}"><v>${row.quantity}</v></c>`,
  );
});
