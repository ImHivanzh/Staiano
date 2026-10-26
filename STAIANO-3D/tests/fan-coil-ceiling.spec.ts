import { execFileSync } from "node:child_process";
import { expect, test } from "./browser-test";
import { openDisclosure } from "./ui-helpers";
import { exportPlenumFixture } from "./plenum-ui-fixture";
import type { Project } from "../src/schemas/project";

test("preserves a historic ceiling pose, aligns only on request and renders its underside", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const project: Project = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
    import {createProject,addRectangle} from './src/domain/project.ts';
    import {applyFanCoil} from './src/domain/fan-coils/apply.ts';
    import {parseProject} from './src/services/project/format.ts';
    let p=createProject();p=addRectangle(p,p.floors[0].id,{width:5,length:4,height:2.7,name:'Sala'});
    p=parseProject(applyFanCoil(p,p.rooms[0].id,'innova-airleaf-sl-200-2t',{mounting:'ceiling'}));
    p.fanCoils[0].catalogVersion='fan-coils-d073b172b15846c0';
    p.fanCoils[0].elevationM=2.7;
    console.log(JSON.stringify(p));
  `,
      ],
      { encoding: "utf8" },
    ),
  );
  const unit = project.fanCoils![0];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "historic-ceiling.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await openDisclosure(page, "Modifica");
  await page
    .getByLabel("Elemento nel progetto", { exact: true })
    .selectOption(unit.id);
  const toggle = page.getByRole("button", {
    name: "Mostra proprietà",
    exact: true,
  });
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  const inspector = page.locator(".proprieta");
  await openDisclosure(inspector, "Posizione · misure interne");
  const elevation = inspector.getByRole("spinbutton", {
    name: "Quota faccia inferiore dal pavimento (m)",
    exact: true,
  });
  await expect(elevation).toHaveValue("2.7");
  const before = await exportPlenumFixture(page);
  expect(before.fanCoils![0]).toEqual(unit);
  await inspector
    .getByRole("button", { name: "Allinea al soffitto", exact: true })
    .click();
  await expect
    .poll(async () => Number(await elevation.inputValue()))
    .toBeCloseTo(2.571, 6);
  const saved = await exportPlenumFixture(page);
  expect(saved.fanCoils![0]).toEqual({
    ...unit,
    elevationM: 2.7 - unit.depthMm / 1000,
  });
  await page.reload();
  await openDisclosure(page, "Modifica");
  await page
    .getByLabel("Elemento nel progetto", { exact: true })
    .selectOption(unit.id);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const viewer = page.getByTestId("viewer-3d"),
    canvas = viewer.locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true");
  await openDisclosure(viewer, "Vista 3D");
  await viewer
    .getByRole("button", { name: "Avvicina selezione", exact: true })
    .click();
  await viewer.locator("summary").filter({ hasText: "Vista 3D" }).click();
  await expect
    .poll(async () =>
      Number(
        (await canvas.getAttribute("data-camera-position"))!.split(",")[1],
      ),
    )
    .toBeLessThan(2.571);
  const move = viewer.getByRole("button", { name: "Sposta 3D", exact: true });
  if ((await move.getAttribute("aria-pressed")) === "true") await move.click();
  await canvas.screenshot({ path: info.outputPath("fan-coil-underside.png") });
});

test("creates the source plenum by clicking the visible ceiling fan-coil", async ({
  page,
}) => {
  const project: Project = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
    import {createProject,addRectangle} from './src/domain/project.ts';
    import {applyFanCoil,updateFanCoil} from './src/domain/fan-coils/apply.ts';
    import {ensureFanCoilAirSystem,setFanCoilAirDischarge} from './src/domain/fan-coils/air.ts';
    import {addOperatorTerminal} from './src/domain/air-terminals/operator.ts';
    import {guidedTerminalPoint} from './tests/guided-fixture.ts';
    import {connectFanCoilAirOnPlan} from './src/domain/fan-coils/connect.ts';
    import {insertPlenum,connectPlenum} from './src/domain/ducted/attached-plenums.ts';
    let p=createProject();p=addRectangle(p,p.floors[0].id,{width:8,length:6,height:2.7,name:'Sala'});
    p.rooms[0].ceilingHeightM=2.2;
    p=applyFanCoil(p,p.rooms[0].id,'aermec-fcz200po',{mounting:'ceiling'});
    const id=p.fanCoils[0].id;p=updateFanCoil(p,id,{elevationM:2.2});
    p=ensureFanCoilAirSystem(p,id).project;
    p=setFanCoilAirDischarge(p,id,{connectionWidthMm:400,connectionHeightMm:150,dimensionBasis:'ductOpening'});
    p=addOperatorTerminal(p,{...guidedTerminalPoint(),roomId:p.rooms[0].id,systemId:null,use:'supply',mounting:'ceiling',lengthMm:1000});
    const terminal=p.airTerminals[0];
    const inserted=insertPlenum(p,terminal.roomId,terminal.position);
    p=connectPlenum(inserted,inserted.plenums.at(-1).id,terminal.id);
    p=connectFanCoilAirOnPlan(p,p.airTerminals[0].id,id);
    console.log(JSON.stringify(p));
  `,
      ],
      { encoding: "utf8" },
    ),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "fan-plenum.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await expect(plan.getByTestId("fan-coil-2d")).toHaveCount(1);
  await plan.getByRole("button", { name: "Plenum", exact: true }).click();
  await plan
    .getByTestId("fan-coil-2d")
    .locator("rect")
    .first()
    .click({ position: { x: 4, y: 4 } });
  await expect(plan.getByTestId("plenum-2d")).toHaveCount(2);
  const saved = await exportPlenumFixture(page);
  expect(saved.fanCoils).toEqual(project.fanCoils);
  const sourcePlenum = saved.plenums.find(
    (plenum) => plenum.attachmentId === undefined,
  )!;
  expect(sourcePlenum).toMatchObject({
    systemId: project.hvacSystems[0].id,
    use: "supply",
  });
  expect(sourcePlenum.elevationM).toBeCloseTo(
    2.2 + project.fanCoils![0].depthMm / 2000,
  );
  expect(saved.hvacSystems[0].indoorUnits[0].heightMm).toBe(
    project.fanCoils![0].depthMm,
  );
  await page.reload();
  await expect(plan.getByTestId("plenum-2d")).toHaveCount(2);
  expect((await exportPlenumFixture(page)).plenums).toEqual(saved.plenums);
  await openDisclosure(page, "Modifica");
  await page
    .getByLabel("Elemento nel progetto", { exact: true })
    .selectOption(project.fanCoils![0].id);
  const properties = page.getByRole("button", {
    name: "Mostra proprietà",
    exact: true,
  });
  if ((await properties.getAttribute("aria-expanded")) !== "true")
    await properties.click();
  const inspector = page.locator(".proprieta");
  await openDisclosure(inspector, "Distribuzione aeraulica · plenum e canali");
  await openDisclosure(inspector, "Schema e dimensionamento plenum");
  const technical = inspector.getByRole("region", {
    name: "Plenum di mandata",
    exact: true,
  });
  await expect(
    technical.getByLabel("Stanza di posa macchina", { exact: true }),
  ).toBeDisabled();
  await expect(
    technical.getByRole("button", {
      name: "Aggiorna posa macchina",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(technical).toContainText("La posa segue il ventilconvettore");
  await inspector.getByLabel("Blocca elemento", { exact: true }).check();
  await expect(
    technical.getByRole("button", {
      name: "Seleziona plenum di mandata nel progetto",
      exact: true,
    }),
  ).toBeDisabled();
  await technical
    .getByRole("button", { name: "Plenum di ripresa", exact: true })
    .click();
  const returnPanel = inspector.getByRole("region", {
    name: "Plenum di ripresa",
    exact: true,
  });
  await expect(
    returnPanel.getByLabel("Larghezza attacco ripresa (mm)", { exact: true }),
  ).toBeDisabled();
  await expect(
    returnPanel.getByRole("button", {
      name: "Salva attacco di ripresa",
      exact: true,
    }),
  ).toBeDisabled();
  const locked = await exportPlenumFixture(page);
  expect(locked.plenums).toEqual(saved.plenums);
  expect(locked.fanCoils![0]).toEqual({ ...saved.fanCoils![0], locked: true });
});
