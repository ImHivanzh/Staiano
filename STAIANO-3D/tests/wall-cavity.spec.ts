import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";
import { openDisclosure, pickPlanPoint } from "./ui-helpers";

function fixture() {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
 import {guidedProjectFixture,addGuidedTerminal} from './tests/guided-fixture.ts';
 import {placeMachineOnPlan} from './src/domain/ducted/graphic-installation.ts';
 import {movePlacedDevice} from './src/domain/geometry/move-device.ts';
 import {addTerminalPlenum} from './src/domain/ducted/attached-plenums.ts';
 let p=guidedProjectFixture();p.floors[0].configurationWizard=undefined;
 p=placeMachineOnPlan(p,p.hvacSystems[0].id,p.rooms[0].id,{x:3,y:3});p=addGuidedTerminal(p,2000,'EDLH','wall');
 p=movePlacedDevice(p,p.airTerminals[0].id,{x:.2,y:3},{enabled:true,grid:false,stepM:.1,toleranceM:.12,orthogonal:false,angle45:false,parallel:false});
 p=addTerminalPlenum(p,p.airTerminals[0].id);
 // Corpo separato posizionato dietro la controparete, non solidale alla faccia.
 p={...p,plenums:p.plenums.map(pl=>({...pl,position:{x:1,y:1},status:'manual',connectionPosition:'upper'}))};
 console.log(JSON.stringify(p));
 `,
      ],
      { encoding: "utf8" },
    ),
  );
}

function sharedWallFixture() {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
 import {guidedProjectFixture} from './tests/guided-fixture.ts';
 import {addAdjacentRoom} from './src/domain/project.ts';
 let p=guidedProjectFixture();p.floors[0].configurationWizard=undefined;
 p=addAdjacentRoom(p,p.rooms[0].wallIds[0],3,'Stanza adiacente',2.7);
 console.log(JSON.stringify(p));
 `,
      ],
      { encoding: "utf8" },
    ),
  );
}

for (const offset of [30, -30])
  test(`Cartongesso: ${offset} cm, vuoto laterale e due tubi`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({
      width: offset > 0 ? 1600 : 1024,
      height: offset > 0 ? 900 : 768,
    });
    const project = fixture();
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "controparete.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    const free = page.getByRole("button", {
      name: "Continua liberamente nell’editor",
    });
    if (await free.count()) await free.click();
    const original = project.walls.findIndex(
      (w: { id: string }) => w.id === project.airTerminals[0].wallId,
    );
    const side =
      project.rooms[0].wallIds[
        (project.rooms[0].wallIds.indexOf(project.airTerminals[0].wallId) + 1) %
          project.rooms[0].wallIds.length
      ];
    for (const index of [
      original,
      project.walls.findIndex((w: { id: string }) => w.id === side),
    ]) {
      const wall = project.walls[index];
      await pickPlanPoint(
        page.getByRole("region", {
          name: "Configurazione grafica canalizzato",
        }),
        wall.start.x + (wall.end.x - wall.start.x) * 0.25,
        wall.start.y + (wall.end.y - wall.start.y) * 0.25,
      );
      const show = page.getByRole("button", {
        name: "Mostra proprietà",
        exact: true,
      });
      if (
        (await show.count()) &&
        (await show.getAttribute("aria-expanded")) === "false"
      )
        await show.click();
      const properties = page.locator(
        '#proprieta-progetto [data-testid="drywall-properties"]',
      );
      if ((await properties.getAttribute("open")) === null)
        await properties.locator("summary").click();
      await properties
        .getByLabel("Tipo di controparete")
        .selectOption(offset < 0 ? "existing" : "new");
      await properties
        .getByRole("spinbutton", { name: "Profondità del vuoto (cm)" })
        .fill(String(Math.abs(offset)));
      await properties
        .getByRole("button", { name: "Applica lato stanza", exact: true })
        .click();
    }
    await expect(page.getByTestId("drywall-2d")).toHaveCount(2);
    await page.screenshot({ path: `.cache/drywall-${offset}-2d.png` });
    await expect(page.getByTestId("save-status")).toHaveText("Salvato");
    await page.getByRole("button", { name: "3D", exact: true }).click();
    const canvas = page.getByTestId("viewer-3d").locator("canvas");
    await expect(canvas).toHaveAttribute("data-rendered", "true", {
      timeout: 30000,
    });
    await expect(canvas).toHaveAttribute("data-drywall-count", "2");
    await expect(canvas).toHaveAttribute("data-duct-count", "2");
    await expect(
      page.getByText("Percorso non realizzabile: sposta curve o plenum"),
    ).toHaveCount(0);
    await page.screenshot({ path: `.cache/drywall-${offset}-3d.png` });
    const download = page.waitForEvent("download");
    await openDisclosure(page, "File");
    await page.getByRole("button", { name: "Esporta", exact: true }).click();
    const saved = JSON.parse(
      readFileSync((await (await download).path())!, "utf8"),
    );
    expect(
      saved.walls.filter(
        (w: { drywall?: { offsetM: number } }) =>
          w.drywall?.offsetM === offset / 100,
      ),
    ).toHaveLength(2);
  });

test("salva contropareti indipendenti sui due lati del muro condiviso", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const project = sharedWallFixture(),
    rooms = project.rooms,
    shared = project.walls.find(
      (wall: { id: string }) =>
        rooms.filter((room: { wallIds: string[] }) =>
          room.wallIds.includes(wall.id),
        ).length === 2,
    )!;
  expect(rooms).toHaveLength(2);
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "cartongesso-bifacciale.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await pickPlanPoint(
    page.getByRole("region", {
      name: "Configurazione grafica canalizzato",
    }),
    (shared.start.x + shared.end.x) / 2,
    (shared.start.y + shared.end.y) / 2,
  );
  const properties = page.locator(
    '#proprieta-progetto [data-testid="drywall-properties"]',
  );
  if ((await properties.getAttribute("open")) === null)
    await properties.locator("summary").click();
  const room = properties.locator('select[name="room"]'),
    offset = properties.getByRole("spinbutton", {
      name: "Profondità del vuoto (cm)",
    }),
    apply = properties.getByRole("button", {
      name: "Applica lato stanza",
      exact: true,
    });
  await room.selectOption(rooms[0].id);
  await offset.fill("30");
  await apply.click();
  await expect(page.getByTestId("drywall-2d")).toHaveCount(1);
  await room.selectOption(rooms[1].id);
  await offset.fill("45");
  await apply.click();
  await expect(page.getByTestId("drywall-2d")).toHaveCount(2);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const canvas = page.getByTestId("viewer-3d").locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true", {
    timeout: 30000,
  });
  await expect(canvas).toHaveAttribute("data-drywall-count", "2");
  const download = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  const saved = JSON.parse(
    readFileSync((await (await download).path())!, "utf8"),
  );
  expect(
    saved.walls.find((wall: { id: string }) => wall.id === shared.id).drywall,
  ).toMatchObject({
    roomId: rooms[0].id,
    offsetM: 0.3,
    otherSide: { roomId: rooms[1].id, offsetM: 0.45 },
  });
});
