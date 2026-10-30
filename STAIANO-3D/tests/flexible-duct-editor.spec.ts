import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import * as THREE from "three";
import { expect, test } from "./browser-test";
import { projectSchema } from "../src/schemas/project";
import { openDisclosure } from "./ui-helpers";

function flexibleProject(
  withClearance = false,
  withCollision: false | "pillar" | "band" = false,
) {
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
    import { addTerminalPlenum } from './src/domain/ducted/attached-plenums.ts';
    import { placeSupplyPlenum } from './src/domain/ducted/placement.ts';
    import { generateDuctRoutes, setDuctKind, ductRoute } from './src/domain/ducted/routes.ts';
    import { flexibleDuctCurve } from './src/domain/ducted/flexible-curve.ts';
    import {roomWallSpan} from './src/domain/geometry/placement.ts';
    let p = guidedProjectFixture();
    p.floors[0].configurationWizard = undefined;
    if (${withClearance}) { p.rooms[0].heightM = 4; p.rooms[0].ceilingHeightM = 2.4; }
    p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
    p = addGuidedTerminal(p, 1000);
    p = addTerminalPlenum(p, p.airTerminals[0].id);
    p = placeSupplyPlenum(p, p.hvacSystems[0].id);
    p = generateDuctRoutes(p, p.hvacSystems[0].id);
    const duct = p.ducts.find((d) => d.terminalId);
    p = setDuctKind(p, duct.id, 'flexible');
    if (${withCollision !== false}) {
      const route = ductRoute(p, duct);
      // Freeze the manual hose before adding the obstacle: automatic routing can avoid it.
      const saved = p.ducts.find((item) => item.id === duct.id);
      saved.routing = 'manual'; saved.waypoints = route.slice(1, -1);
      const hit = flexibleDuctCurve(route, duct.diameterMm).curve.getPointAt(0.5);
      if('${withCollision}'==='band') {
        const room=p.rooms[0],wall=p.walls.find(w=>w.id===room.wallIds[0]),span=roomWallSpan(room,wall);
        const dx=(span.end.x-span.start.x)/span.lengthM,dy=(span.end.y-span.start.y)/span.lengthM;
        const along=(hit.x-span.start.x)*dx+(hit.z-span.start.y)*dy;
        const depth=-(hit.x-span.start.x)*dy+(hit.z-span.start.y)*dx-0.05;
        room.ceilingBands=[{id:'collision-band',name:'Fascia di prova',wallId:wall.id,offsetM:along-0.5,lengthM:1,depthM:depth,elevationM:hit.y-0.4}];
      } else {
      p.pillars = [{ id: 'collision-pillar', floorId: p.floors[0].id, position: { x: hit.x, y: hit.z }, widthMm: 500, depthMm: 500, heightMm: 4000, rotation: 0, locked: false }];
      }
    }
    console.log(JSON.stringify(p));
  `,
        ],
        { encoding: "utf8" },
      ),
    ),
  );
}

async function importProject(page: Page, project = flexibleProject()) {
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
  // Plenum della bocchetta e plenum macchina restano due corpi separati.
  await expect(page.getByTestId("plenum-2d")).toHaveCount(2);
  return project;
}

test("ETF10 applica dati OEM solo allo SKU e non interpola portate assenti", async ({
  page,
}) => {
  test.setTimeout(120000);
  const project = flexibleProject();
  project.plenums = project.plenums.map((plenum) => ({
    ...plenum,
    portDiameterMm: 160,
  }));
  project.ducts = project.ducts?.map((duct) => ({ ...duct, diameterMm: 160 }));
  await importProject(page, project);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.getByRole("button", { name: "Configura percorsi" }).click();
  const channels = page.getByRole("dialog", {
    name: "Canalizzazione collegata",
  });
  await channels.locator("details > summary").first().click();
  await channels.locator("details details > summary").first().click();
  await channels
    .getByLabel(/SKU del flessibile/)
    .selectOption("ecoclima-etf10");
  await expect(channels.getByLabel(/Diametro OEM del flessibile/)).toHaveValue(
    "160",
  );
  await expect(channels.getByText(/Raggio minimo 0,60 × Ø/)).toBeVisible();
  await expect(
    channels.getByText(/Interasse dei sostegni non pubblicato/),
  ).toBeVisible();
  await expect(
    channels.getByText(/Perdita di carico non calcolata/),
  ).toContainText("nessuna interpolazione");
});

async function exported(page: Page) {
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const download = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  return projectSchema.parse(
    JSON.parse(readFileSync((await (await download).path())!, "utf8")),
  );
}

for (const width of [1920, 1024])
  test.describe(`modifica 2D a ${width}`, () => {
    test.use({ hasTouch: width === 1024 });
    test(`Flessibili 2D: trascina, aggiunge e rimuove curve conservando quote e 3D a ${width}`, async ({
      page,
    }) => {
      test.setTimeout(120000);
      await page.setViewportSize({ width, height: 900 });
      await importProject(page);
      await page
        .getByRole("button", { name: "Flessibili", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "2D", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      const controls = page.getByRole("region", {
        name: "Modifica grafica flessibili 2D",
      });
      await expect(controls).toBeVisible();
      await page.getByTestId("editor-2d").press("Escape");
      await expect(
        page.getByRole("button", { name: "Flessibili", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await page
        .getByRole("button", { name: "Flessibili", exact: true })
        .click();
      if (width === 1024)
        expect(
          (await controls
            .getByRole("button", { name: "Aggiungi curva", exact: true })
            .boundingBox())!.height,
        ).toBeGreaterThanOrEqual(44);
      await controls
        .getByRole("button", { name: "Aggiungi curva", exact: true })
        .click();
      // Il focus sul tratto SVG non deve disegnare il contorno del browser,
      // che in unità del disegno diventa una macchia nera enorme.
      const outline = await page
        .locator('[data-testid="editable-duct-2d"]')
        .first()
        .evaluate((node) => {
          (node as SVGElement & { focus: () => void }).focus();
          return getComputedStyle(node).outlineStyle;
        });
      expect(outline).toBe("none");
      const before = await exported(page);
      const duct = before.ducts!.find(
        (item) => item.kind === "flexible" && item.terminalId,
      )!;
      const editor = page.getByTestId("editor-2d");
      const view = await editor.getAttribute("viewBox");
      const handle = editor.locator(
        '[data-testid="duct-waypoint-2d"][aria-pressed="true"]',
      );
      const index =
        Number((await handle.getAttribute("aria-label"))!.split(" ")[1]) - 1;
      const point = duct.waypoints[index];
      if (width === 1024)
        expect((await handle.boundingBox())!.width).toBeGreaterThanOrEqual(
          43.9,
        );
      const screen = await editor.evaluate(
        (node, point) =>
          [point, { x: point.x + 0.6, y: point.y + 0.4 }].map((p) => {
            const at = new DOMPoint(p.x, p.y).matrixTransform(
              (node as SVGSVGElement).getScreenCTM()!,
            );
            return { x: at.x, y: at.y };
          }),
        point,
      );
      if (width === 1024) {
        const touch = await page.context().newCDPSession(page);
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: screen[0].x + 12, y: screen[0].y, id: 1 }],
        });
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: screen[1].x + 12, y: screen[1].y, id: 1 }],
        });
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await touch.detach();
      } else {
        await page.mouse.move(screen[0].x, screen[0].y);
        await page.mouse.down();
        await page.mouse.move(screen[1].x, screen[1].y, { steps: 8 });
        await page.mouse.up();
      }
      const after = await exported(page);
      const moved = after.ducts!.find((item) => item.id === duct.id)!;
      expect(moved.waypoints[index].x).toBeCloseTo(point.x + 0.6, 5);
      expect(moved.waypoints[index].y).toBeCloseTo(point.y + 0.4, 5);
      expect(moved.waypoints[index].elevationM).toBe(point.elevationM);
      expect(moved.waypoints.filter((_, i) => i !== index)).toEqual(
        duct.waypoints.filter((_, i) => i !== index),
      );
      await expect(editor).toHaveAttribute("viewBox", view!);
      await page.screenshot({ path: `.cache/flessibili-2d-${width}.png` });
      await page.keyboard.press("Delete");
      const removed = await exported(page);
      expect(
        removed.ducts!.find((item) => item.id === duct.id)!.waypoints,
      ).toEqual(moved.waypoints.filter((_, i) => i !== index));
      expect(removed.ducts).toHaveLength(after.ducts!.length);
      await page.keyboard.press("Control+z");
      await page
        .getByRole("button", { name: "Flessibili", exact: true })
        .click();
      const restored = await exported(page);
      expect(
        restored.ducts!.find((item) => item.id === duct.id)!.waypoints,
      ).toEqual(moved.waypoints);
      await page.getByRole("button", { name: "3D", exact: true }).click();
      await expect(
        page.getByTestId("viewer-3d").locator("canvas"),
      ).toHaveAttribute("data-rendered", "true", { timeout: 30000 });
      await expect(
        page.getByRole("region", {
          name: "Modifica grafica flessibili",
          exact: true,
        }),
      ).toContainText(`${moved.waypoints.length} curve`);
      await page.getByRole("button", { name: "2D", exact: true }).click();
      await expect(controls).toBeVisible();
      await controls
        .getByRole("button", { name: "Termina modifica", exact: true })
        .click();
      await expect(controls).toHaveCount(0);
    });
  });

test("Flessibili nella vista 3D salva le curve", async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await importProject(page);
  await page.getByRole("button", { name: "3D", exact: true }).click();
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
  await page.keyboard.press("Delete");
  const afterRemove = await exported(page);
  expect(
    afterRemove.ducts!.find((duct) => duct.terminalId)!.waypoints.length,
  ).toBe(beforeCount);
  expect(afterRemove.ducts).toHaveLength(afterDrag.ducts!.length);
  expect(afterRemove.ducts!.find((duct) => duct.terminalId)!.waypoints).toEqual(
    afterDrag
      .ducts!.find((duct) => duct.terminalId)!
      .waypoints.filter((_, i) => i !== selectedIndex),
  );
  await controls
    .getByRole("button", { name: "Termina modifica", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Flessibili", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("l’avviso di collisione del flessibile si smonta senza errori React", async ({
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
        .locator('[role="alert"]')
        .filter({ hasText: /Collisione con .*plenum/ }),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "2D", exact: true }).click();
  }
});

test("il canale tratteggiato si seleziona anche vicino alla linea e fra i trattini", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1600, height: 900 });
  const project = flexibleProject();
  const duct = project.ducts!.find((item) => item.terminalId)!;
  duct.routing = "manual";
  duct.waypoints = [
    { x: 3, y: 4, elevationM: 2 },
    { x: 6, y: 4, elevationM: 2 },
    { x: 3, y: 4, elevationM: 2 },
  ];
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "tratteggio-selezionabile.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.getByRole("button", { name: "Flessibili", exact: true }).click();
  const canvas = page.getByTestId("viewer-3d").locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true", {
    timeout: 30000,
  });
  await page.keyboard.press("Escape");
  await expect(canvas).not.toHaveAttribute("data-selection", duct.id);
  await expect(
    page.getByRole("button", { name: "Flessibili", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
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
  const at = new THREE.Vector3(4.5, 2, 4).project(camera);
  const end = new THREE.Vector3(6, 2, 4).project(camera);
  const dx = (end.x - at.x) * box.width;
  const dy = -(end.y - at.y) * box.height;
  const length = Math.hypot(dx, dy);
  await page.mouse.click(
    box.x + ((at.x + 1) * box.width) / 2 - (dy / length) * 6,
    box.y + ((1 - at.y) * box.height) / 2 + (dx / length) * 6,
  );
  await expect(canvas).toHaveAttribute("data-selection", duct.id);
  await page.screenshot({
    path: ".cache/flessibile-tratteggiato-selezione.png",
  });
});

test("la modifica flessibili conserva zoom e orientamento tra selezioni e aggiunta di curve", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1600, height: 900 });
  const project = await importProject(page);
  const duct = project.ducts!.find((duct) => duct.terminalId)!;
  await page.getByRole("button", { name: "3D", exact: true }).click();
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
  await expect(canvas).toHaveAttribute("data-selection", duct.id);
  await expect(
    page.getByRole("button", { name: "Flessibili", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
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

test("il 3D esclude i tubi salvati se la bocchetta perde il suo plenum", async ({
  page,
}) => {
  test.setTimeout(120000);
  const project = flexibleProject();
  const terminalId = project.airTerminals[0].id;
  // Corpo separato eliminato: il tubo non ha più un'estremità reale.
  const removed = new Set(
    project.plenums
      .filter((pl) => pl.attachmentId === terminalId)
      .map((pl) => pl.id),
  );
  project.plenums = project.plenums.filter((pl) => !removed.has(pl.id));
  project.ducts = project.ducts?.filter((d) => !removed.has(d.plenumId));
  project.airTerminals[0].plenumId = null;
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
  // Nessun tubo superstite: senza il corpo del plenum l'estremità non esiste.
  await expect(canvas).toHaveAttribute("data-duct-count", "0");
});

test("un flessibile che attraversa un pilastro è rosso e segnalato in 2D e 3D", async ({
  page,
}) => {
  test.setTimeout(120000);
  const project = flexibleProject(true, "pillar");
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
  await page.getByRole("button", { name: "3D", exact: true }).click();
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

test("un flessibile vicino al fronte della fascia usa il raggio reale nei controlli 2D e 3D", async ({
  page,
}) => {
  test.setTimeout(120000);
  const project = flexibleProject(false, "band");
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "fascia-flessibile.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(
    page.locator('[data-testid="duct-2d"][data-collision="true"]').first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.getByRole("button", { name: "Flessibili", exact: true }).click();
  const viewer = page.getByTestId("viewer-3d");
  await expect(viewer.locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await expect(viewer.locator("canvas")).toHaveAttribute(
    "data-duct-collision-count",
    /^[1-9]/,
  );
  await expect(
    viewer
      .getByRole("alert")
      .filter({ hasText: /Collisione con.*fascia Fascia di prova/ })
      .first(),
  ).toBeVisible();
  const saved = await exported(page);
  expect(saved.rooms[0].ceilingBands).toEqual(project.rooms[0].ceilingBands);
  expect(saved.ducts?.find((d) => d.routing === "manual")?.waypoints).toEqual(
    project.ducts?.find((d) => d.routing === "manual")?.waypoints,
  );
  await page.screenshot({
    path: ".cache/audit-ceiling-band-flex-collision.png",
  });
});
