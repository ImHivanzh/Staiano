import { execFileSync } from "node:child_process";
import { expect, test } from "./browser-test";
import { openDisclosure, pickPlanPoint } from "./ui-helpers";
import { exportPlenumFixture } from "./plenum-ui-fixture";
import type { Project } from "../src/schemas/project";
function fixture(
  kind: "radiator-invalid" | "fan-void" | "wall-fan" | "gable",
): Project {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
 import {createProject,addRectangle,recomputeProject} from './src/domain/project.ts';
 import {applyFanCoil} from './src/domain/fan-coils/apply.ts';
 import {radiatorProducts} from './src/domain/catalogs/radiators.ts';
 import {sizeRadiators} from './src/domain/radiators/size.ts';
 import {applyRadiatorSolution} from './src/domain/radiators/apply.ts';
 import {roomWallSpan} from './src/domain/geometry/placement.ts';
 import {parseProject} from './src/services/project/format.ts';
 const kind='${kind}';let p=createProject('Quote locali '+kind);p=addRectangle(p,p.floors[0].id,{width:8,length:6,height:kind==='gable'?2.2:kind==='radiator-invalid'?2.7:3.2,name:'Sala'});
 const room=p.rooms[0];
 if(kind==='radiator-invalid'){
  const model=radiatorProducts.find(product=>product.id==='cordivari-ardesia-2-2500');
  const solution=sizeRadiators(room.designLoadW,[model],50,{manufacturer:model.manufacturer,family:model.family,numberOfRadiators:1})[0];p=applyRadiatorSolution(p,room.id,solution,null);p.rooms[0].ceilingHeightM=2.4;
 }else if(kind==='gable'){
  room.roof={ridgeWallId:room.wallIds[0],ridgeHeightM:3.8};p=recomputeProject(p);
 }else{
  room.ceilingHeightM=2.8;
  if(kind==='fan-void'){
   const wall=p.walls.find(w=>w.id===room.wallIds[0]),span=roomWallSpan(room,wall);
   room.ceilingBands=[{id:'side-band',name:'Fascia',wallId:wall.id,offsetM:0,lengthM:span.lengthM,depthM:4,elevationM:2.5}];
  }
  p=applyFanCoil(p,room.id,kind==='wall-fan'?'innova-airleaf-sl-200-2t':'innova-airleaf-sli-200-2t',0,{mounting:kind==='wall-fan'?'wall':'ceiling'});
 }
 if(kind==='wall-fan') p.fanCoils[0].position.x+=0.0012345;
 console.log(JSON.stringify(parseProject(p)));
 `,
      ],
      { encoding: "utf8" },
    ),
  );
}
async function importFixture(
  page: import("@playwright/test").Page,
  project: Project,
) {
  await page.goto("/");
  await page
    .getByTestId("project-file")
    .setInputFiles({
      name: "quote-locali.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(
    page.getByRole("heading", { name: project.name, exact: true }),
  ).toBeVisible();
}
async function fanInspector(page: import("@playwright/test").Page, id: string) {
  await openDisclosure(page, "Modifica");
  await page
    .getByLabel("Elemento nel progetto", { exact: true })
    .selectOption(id);
  const show = page.getByRole("button", {
    name: "Mostra proprietà",
    exact: true,
  });
  if ((await show.getAttribute("aria-expanded")) !== "true") await show.click();
  await openDisclosure(page.locator(".proprieta"), "Posizione");
  return page.locator(".proprieta");
}
test("la quota iniziale a mezzo millimetro del ventilconvettore è già valida nel form", async ({
  page,
}) => {
  const project = fixture("wall-fan"),
    unit = project.fanCoils![0];
  await importFixture(page, project);
  const inspector = await fanInspector(page, unit.id);
  const elevation = inspector.getByRole("spinbutton", { name: /Quota centro/ });
  expect(
    await elevation.evaluate(
      (node) => (node as HTMLInputElement).validity.stepMismatch,
    ),
  ).toBe(false);
  const offset = inspector.getByRole("spinbutton", { name: /Distanza centro/ });
  expect(
    await offset.evaluate(
      (node) => (node as HTMLInputElement).validity.stepMismatch,
    ),
  ).toBe(false);
  await inspector
    .getByRole("button", { name: "Aggiorna posizione", exact: true })
    .click();
  const saved = await exportPlenumFixture(page);
  expect(saved.fanCoils![0].elevationM).toBe(unit.elevationM);
  expect(saved.fanCoils![0].position.x).toBeCloseTo(unit.position.x, 8);
  expect(saved.fanCoils![0].position.y).toBeCloseTo(unit.position.y, 8);
});
test("un radiatore storico sopra il controsoffitto resta salvato e viene segnalato", async ({
  page,
}) => {
  const project = fixture("radiator-invalid");
  await importFixture(page, project);
  await expect(page.getByTestId("radiator-2d")).toHaveCount(1);
  await page
    .getByRole("button", { name: /^Controlli/ })
    .first()
    .click();
  await page.getByLabel("Esito controlli").selectOption("invalid");
  await expect(
    page.locator(".controllo.invalid").filter({ hasText: "deviceEnvelope" }),
  ).toContainText("RAD1");
  expect((await exportPlenumFixture(page)).radiators).toEqual(
    project.radiators,
  );
  await page.reload();
  await expect(page.getByTestId("radiator-2d")).toHaveCount(1);
  expect((await exportPlenumFixture(page)).radiators).toEqual(
    project.radiators,
  );
});
test("le quote di fascia e vuoto superiore sono distinte e non permettono di attraversare il piano centrale", async ({
  page,
}) => {
  const project = fixture("fan-void"),
    unit = project.fanCoils![0];
  await importFixture(page, project);
  const inspector = await fanInspector(page, unit.id);
  const ranges = inspector.getByTestId("fan-coil-elevation-ranges");
  await expect(ranges).toContainText("2,50–2,658 m (vuoto fascia)");
  await expect(ranges).toContainText("2,80–3,058 m (vuoto superiore)");
  const elevation = inspector.getByRole("spinbutton", {
    name: /Quota faccia inferiore/,
  });
  await elevation.fill("2.75");
  await inspector
    .getByRole("button", { name: "Aggiorna posizione", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /Posizione fuori/ })
      .first(),
  ).toBeVisible();
  expect((await exportPlenumFixture(page)).fanCoils).toEqual(project.fanCoils);
  await elevation.fill("2.9");
  await inspector
    .getByRole("button", { name: "Aggiorna posizione", exact: true })
    .click();
  const saved = await exportPlenumFixture(page);
  expect(saved.fanCoils).toEqual([{ ...unit, elevationM: 2.9 }]);
  await page.reload();
  expect((await exportPlenumFixture(page)).fanCoils).toEqual(saved.fanCoils);
});
test("la selezione accetta un radiatore alto sotto il colmo sopra la quota di gronda", async ({
  page,
}) => {
  test.setTimeout(90000);
  const project = fixture("gable");
  await importFixture(page, project);
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan.getByRole("button", { name: "Radiatore", exact: true }).click();
  await pickPlanPoint(plan, 7.8, 3);
  await plan.getByTestId("draft-radiator").click();
  const popup = page.getByRole("dialog", {
    name: "Configura apparecchio",
    exact: true,
  });
  await popup.getByRole("button", { name: "Cordivari", exact: true }).click();
  await popup.getByRole("button", { name: "Ardesia", exact: true }).click();
  await popup.getByRole("button", { name: "2 colonne", exact: true }).click();
  await popup.getByRole("button", { name: /ALTEZZA 2500/ }).click();
  await expect(
    popup.getByRole("button", { name: "Selezionata", exact: true }),
  ).toBeEnabled();
  await popup
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(plan.getByTestId("radiator-2d")).toHaveCount(1);
  const saved = await exportPlenumFixture(page);
  expect(saved.radiators[0].heightMm).toBe(2500);
  expect(saved.rooms[0].heightM).toBe(2.2);
  expect(saved.radiators[0].wallId).toBe(project.rooms[0].wallIds[1]);
});
