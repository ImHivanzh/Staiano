import { readFileSync } from "node:fs";
import { PerspectiveCamera, Vector3 } from "three";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./browser-test";
import { openDisclosure } from "./ui-helpers";
import { execFileSync } from "node:child_process";
import { projectSchema, type Project } from "../src/schemas/project";

function fixture(): Project {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
    import { guidedProjectFixture, guidedTerminalPoint } from './tests/guided-fixture.ts';
    import { addWall } from './src/domain/project.ts';
    import { assignInstallationRooms, ensureInstallations } from './src/domain/installations.ts';
    import { placeMachineOnPlan, saveTerminalOnPlan, placeDuctedDraft } from './src/domain/ducted/graphic-installation.ts';
    let project = ensureInstallations(guidedProjectFixture());
    project.floors[0].configurationWizard = undefined;
    project = placeMachineOnPlan(project, project.hvacSystems[0].id, project.rooms[0].id, { x: 2, y: 4 });
    const minY = Math.min(...project.walls.flatMap(wall => [wall.start.y, wall.end.y]));
    const maxY = Math.max(...project.walls.flatMap(wall => [wall.start.y, wall.end.y]));
    project = addWall(project, project.floors[0].id, { x: 4, y: minY }, { x: 4, y: maxY });
    const targetRoom = project.rooms.find((room) => room.centroid.x > 4);
    const installationId = project.installations.find(item => item.type === 'ducted').id;
    project = assignInstallationRooms(project, installationId, 'ducted', project.rooms.map(room => room.id));
    project = saveTerminalOnPlan(project, { ...guidedTerminalPoint(), roomId: targetRoom.id, systemId: null, use: 'supply', mounting: 'ceiling', lengthMm: 1000, color: 'RAL9016' }, { x: 6, y: 2 });
    project = placeDuctedDraft(project, installationId, targetRoom.id, { x: 6, y: 5 }, 'machine');
    console.log(JSON.stringify(project));
  `,
      ],
      { encoding: "utf8" },
    ),
  );
}

async function load3D(page: Page, project: Project) {
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "3d-configuration.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    project.name,
  );
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const canvas = page.getByTestId("viewer-3d").locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true", {
    timeout: 30000,
  });
  await openDisclosure(page.getByTestId("viewer-3d"), "Vista 3D");
  await page
    .getByRole("button", { name: "Vista dall'alto", exact: true })
    .click();
  await expect
    .poll(async () =>
      Number(
        (await canvas.getAttribute("data-camera-position"))!.split(",")[1],
      ),
    )
    .toBeGreaterThan(8);
  return canvas;
}

async function pick3D(
  page: Page,
  canvas: Locator,
  x: number,
  elevation: number,
  y: number,
) {
  const box = (await canvas.boundingBox())!;
  const camera = new PerspectiveCamera(
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
  const point = new Vector3(x, elevation, y).project(camera);
  await page.mouse.click(
    box.x + ((point.x + 1) * box.width) / 2,
    box.y + ((1 - point.y) * box.height) / 2,
  );
}

async function exported(page: Page) {
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const waiting = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  return projectSchema.parse(
    JSON.parse(readFileSync((await (await waiting).path())!, "utf8")),
  );
}

test("3D click opens configured and draft machine dialogs without a second inspector", async ({
  page,
}) => {
  const project = fixture();
  const canvas = await load3D(page, project);
  await pick3D(page, canvas, 2, 2.525, 4);
  const dialog = page.getByRole("dialog", {
    name: "Scegli macchina canalizzata",
  });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#proprieta-progetto")).not.toBeVisible();
  await dialog
    .getByRole("button", { name: /Annulla|Chiudi/ })
    .first()
    .click();
  await expect(dialog).not.toBeVisible();
  await pick3D(page, canvas, 6, 2.5, 5);
  await expect(dialog).toBeVisible();
  await expect(canvas).toHaveAttribute(
    "data-selection",
    project.ductedDrafts![0].id,
  );
});

test("3D Collega serves the terminal room automatically and keeps its route visible", async ({
  page,
}) => {
  const project = fixture();
  const canvas = await load3D(page, project);
  await page
    .getByTestId("viewer-3d")
    .getByRole("button", { name: "Collega", exact: true })
    .click();
  await pick3D(page, canvas, 2, 2.525, 4);
  const terminal = project.airTerminals[0];
  await pick3D(
    page,
    canvas,
    terminal.position.x,
    terminal.elevationM! + (terminal.depthMm ?? 0) / 2000,
    terminal.position.y,
  );
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(canvas).toHaveAttribute("data-air-connections", "1");
  const saved = await exported(page);
  expect(saved.hvacSystems[0].roomIds).toEqual([terminal.roomId]);
  expect(saved.airTerminals[0].systemId).toBe(saved.hvacSystems[0].id);
  expect(saved.hvacSystems[0].indoorUnits[0].roomId).not.toBe(terminal.roomId);
});

test("3D selected wall creates a visible measured door and saves it", async ({
  page,
}, testInfo) => {
  const project = fixture();
  const canvas = await load3D(page, project);
  const maxY = Math.max(
    ...project.walls.flatMap((wall) => [wall.start.y, wall.end.y]),
  );
  const wall = project.walls.find(
    (wall) => wall.start.y === maxY && wall.end.y === maxY,
  )!;
  const x = (wall.start.x + wall.end.x) / 2;
  const y = (wall.start.y + wall.end.y) / 2;
  await pick3D(page, canvas, x, 0.5, y);
  await expect(canvas).toHaveAttribute("data-selection", wall.id);
  await page
    .getByRole("button", { name: "Porte e finestre", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Porte e finestre nella parete",
  });
  await dialog
    .getByRole("button", { name: "Aggiungi porta centrata", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-door-count", "1");
  await dialog
    .getByRole("button", { name: "Chiudi configurazione", exact: true })
    .click();
  await canvas.screenshot({
    path: testInfo.outputPath("door-added-from-3d.png"),
  });
  const saved = await exported(page);
  const door = saved.openings[0];
  expect(door).toMatchObject({
    wallId: wall.id,
    type: "door",
    widthM: 0.9,
    heightM: 2.1,
  });
  expect(door.offsetM).toBeCloseTo(
    (Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) - 0.9) /
      2,
  );
});
