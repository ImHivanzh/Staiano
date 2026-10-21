import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import * as THREE from "three";
import { expect, test } from "./browser-test";
import { projectSchema } from "../src/schemas/project";
import { openDisclosure } from "./ui-helpers";

function flexibleProject(withClearance = false, withCollision = false) {
  return projectSchema.parse(
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `
    import { guidedProjectFixture, addGuidedTerminal } from './tests/guided-fixture.ts';
    import { placeMachineOnPlan } from './src/domain/ducted/graphic-installation.ts';
    import { placeSupplyPlenum } from './src/domain/ducted/placement.ts';
    import { generateDuctRoutes, setDuctKind, ductRoute } from './src/domain/ducted/routes.ts';
    import { flexibleDuctCurve } from './src/domain/ducted/flexible-curve.ts';
    let p = guidedProjectFixture();
    p.floors[0].configurationWizard = undefined;
    if (${withClearance}) { p.rooms[0].heightM = 4; p.rooms[0].ceilingHeightM = 2.4; }
    p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
    p = addGuidedTerminal(p, 1000);
    p = placeSupplyPlenum(p, p.hvacSystems[0].id);
    p = generateDuctRoutes(p, p.hvacSystems[0].id);
    const duct = p.ducts.find((d) => d.terminalId);
    p = setDuctKind(p, duct.id, 'flexible');
    if (${withCollision}) {
      const hit = flexibleDuctCurve(ductRoute(p, duct), duct.diameterMm).curve.getPointAt(0.5);
      p.pillars = [{ id: 'collision-pillar', floorId: p.floors[0].id, position: { x: hit.x, y: hit.z }, widthMm: 500, depthMm: 500, heightMm: 4000, rotation: 0, locked: false }];
    }
    console.log(JSON.stringify(p));
  `,
        ],
        { encoding: "utf8" },
      ),
    ),
  );
}

async function importProject(page: Page) {
  const project = flexibleProject();
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "flessibili.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const free = page.getByRole("button", {
    name: "Continua liberamente nell’editor",
  });
  if (await free.count()) await free.click();
  await expect(page.getByTestId("plenum-2d")).toHaveCount(1);
  return project;
}

async function exported(page: Page) {
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const download = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  return projectSchema.parse(
    JSON.parse(readFileSync((await (await download).path())!, "utf8")),
  );
}

test("Flessibili apre solo l’editor grafico 3D e salva le curve", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await importProject(page);
  await page.getByRole("button", { name: "Flessibili", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Configura flessibili" }),
  ).toHaveCount(0);
  const canvas = page.getByTestId("viewer-3d").locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true", {
    timeout: 30000,
  });
  const controls = page.getByRole("region", {
    name: "Modifica grafica flessibili",
  });
  await expect(controls).toBeVisible();
  await expect(controls.locator("input, select, table")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Configura percorsi", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(
    controls.getByRole("button", { name: "Aggiungi curva", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1600, height: 900 });
  await controls
    .getByRole("button", { name: "Aggiungi curva", exact: true })
    .click();
  const afterFirst = await exported(page);
  const flexible = afterFirst.ducts!.find((duct) => duct.terminalId)!;
  expect(flexible.kind).toBe("flexible");
  expect(flexible.routing).toBe("manual");
  expect(flexible.waypoints.length).toBeGreaterThan(0);

  const add = page.getByRole("button", {
    name: "Aggiungi curva",
    exact: true,
  });
  await expect(add).toBeVisible();
  const beforeCount = flexible.waypoints.length;
  await add.click();
  const afterHud = await exported(page);
  expect(
    afterHud.ducts!.find((duct) => duct.terminalId)!.waypoints.length,
  ).toBe(beforeCount + 1);
  await page.screenshot({ path: ".cache/flessibili-3d.png" });
  const pointsAfterAdd = afterHud.ducts!.find(
    (duct) => duct.terminalId,
  )!.waypoints;
  const selectedIndex = pointsAfterAdd.findIndex(
    (point) =>
      !flexible.waypoints.some(
        (old) =>
          old.x === point.x &&
          old.y === point.y &&
          old.elevationM === point.elevationM,
      ),
  );
  const selectedPoint = pointsAfterAdd[selectedIndex];
  const box = (await canvas.boundingBox())!;
  const camera = new THREE.PerspectiveCamera(
    Number(await canvas.getAttribute("data-camera-fov")),
    box.width / box.height,
    0.02,
    2000,
  );
  camera.position.fromArray(
    (await canvas.getAttribute("data-camera-position"))!.split(",").map(Number),
  );
  camera.quaternion.fromArray(
    (await canvas.getAttribute("data-camera-quaternion"))!
      .split(",")
      .map(Number),
  );
  camera.updateMatrixWorld();
  const handle = new THREE.Vector3(
    selectedPoint.x + 0.25,
    selectedPoint.elevationM,
    selectedPoint.y,
  ).project(camera);
  const handleX = box.x + ((handle.x + 1) * box.width) / 2;
  const handleY = box.y + ((1 - handle.y) * box.height) / 2;
  await page.mouse.move(handleX, handleY);
  await page.mouse.down();
  await page.mouse.move(handleX + 70, handleY, { steps: 8 });
  await page.mouse.up();
  const afterDrag = await exported(page);
  expect(
    Math.abs(
      afterDrag.ducts!.find((duct) => duct.terminalId)!.waypoints[selectedIndex]
        .x - selectedPoint.x,
    ),
  ).toBeGreaterThan(0.01);
  await expect(canvas).toHaveAttribute(
    "data-camera-position",
    camera.position
      .toArray()
      .map((n) => n.toFixed(3))
      .join(","),
  );
  await expect(canvas).toHaveAttribute(
    "data-camera-quaternion",
    camera.quaternion.toArray().join(","),
  );
  await expect(
    controls.getByRole("button", { name: "Rimuovi curva", exact: true }),
  ).toBeVisible({ timeout: 5000 });
  await controls
    .getByRole("button", { name: "Rimuovi curva", exact: true })
    .click();
  const afterRemove = await exported(page);
  expect(
    afterRemove.ducts!.find((duct) => duct.terminalId)!.waypoints.length,
  ).toBe(beforeCount);
  await controls
    .getByRole("button", { name: "Termina modifica", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Flessibili", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("l’avviso di un flessibile irrealizzabile si smonta senza errori React", async ({
  page,
}) => {
  test.setTimeout(120000);
  const project = flexibleProject();
  const duct = project.ducts!.find((d) => d.terminalId)!;
  duct.routing = "manual";
  duct.waypoints = [];
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "flessibile-non-realizzabile.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "3D", exact: true }).click();
    const viewer = page.getByTestId("viewer-3d");
    await expect(viewer.locator("canvas")).toHaveAttribute(
      "data-rendered",
      "true",
      { timeout: 30000 },
    );
    await expect(
      viewer
        .locator("[role=status]")
        .filter({ hasText: "Percorso non realizzabile" }),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "2D", exact: true }).click();
  }
});

test("la modifica flessibili conserva zoom e orientamento tra selezioni e aggiunta di curve", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1600, height: 900 });
  const project = await importProject(page);
  const duct = project.ducts!.find((duct) => duct.terminalId)!;
  await page.getByRole("button", { name: "Flessibili", exact: true }).click();
  const canvas = page.getByTestId("viewer-3d").locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true", {
    timeout: 30000,
  });
  const initial = await canvas.getAttribute("data-camera-position");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 15, box.y + 15);
  await page.mouse.wheel(0, -250);
  await expect(canvas).not.toHaveAttribute("data-camera-position", initial!);
  let previous = "";
  await expect
    .poll(
      async () => {
        const pose = `${await canvas.getAttribute("data-camera-position")}|${await canvas.getAttribute("data-camera-quaternion")}`;
        const settled = previous === pose;
        previous = pose;
        return settled;
      },
      { intervals: [100], timeout: 5000 },
    )
    .toBe(true);
  const position = await canvas.getAttribute("data-camera-position");
  const rotation = await canvas.getAttribute("data-camera-quaternion");
  await canvas.click({ position: { x: 8, y: 8 } });
  await expect(canvas).not.toHaveAttribute("data-selection", duct.id);
  await expect(canvas).toHaveAttribute("data-camera-position", position!);
  await expect(canvas).toHaveAttribute("data-camera-quaternion", rotation!);
  await page.getByRole("button", { name: "Flessibili", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-selection", duct.id);
  await page
    .getByRole("button", { name: "Aggiungi curva", exact: true })
    .click();
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await expect(canvas).toHaveAttribute("data-camera-position", position!);
  await expect(canvas).toHaveAttribute("data-camera-quaternion", rotation!);
  await openDisclosure(page, "Vista 3D");
  await page
    .getByRole("button", { name: "Avvicina selezione", exact: true })
    .click();
  await expect(canvas).not.toHaveAttribute("data-camera-position", position!);
});

test("il 3D esclude i tubi salvati se la bocchetta è senza plenum", async ({
  page,
}) => {
  test.setTimeout(120000);
  const project = flexibleProject();
  project.airTerminals[0].commercialOptions = {
    ...project.airTerminals[0].commercialOptions!,
    insulatedPlenum: false,
    plenumMaterial: undefined,
  };
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "bocchetta-senza-plenum.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const canvas = page.getByTestId("viewer-3d").locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true", {
    timeout: 30000,
  });
  await expect(canvas).toHaveAttribute("data-air-connections", "0");
  // Resta solo l’eventuale raccordo rigido macchina-plenum.
  await expect(canvas).toHaveAttribute("data-duct-count", "1");
});

test("un flessibile che attraversa un pilastro è rosso e segnalato in 2D e 3D", async ({
  page,
}) => {
  test.setTimeout(120000);
  const project = flexibleProject(true, true);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "collisione-flessibile.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(
    page.locator('[data-testid="duct-2d"][data-collision="true"]').first(),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="duct-2d"] polyline[stroke="#dc2626"]').first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Flessibili", exact: true }).click();
  const viewer = page.getByTestId("viewer-3d");
  await expect(viewer.locator("canvas")).toHaveAttribute(
    "data-duct-collision-count",
    /^[1-9]/,
    { timeout: 30000 },
  );
  await expect(
    viewer
      .getByRole("alert")
      .filter({ hasText: /Collisione con.*pilastro/ })
      .first(),
  ).toBeVisible();
  await page.screenshot({ path: ".cache/flessibile-collisione-rosso.png" });
});
