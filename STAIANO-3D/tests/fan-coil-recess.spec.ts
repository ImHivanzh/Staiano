import { expect, test } from "./browser-test";
import { addRectangle, createProject } from "../src/domain/project";
import {
  chooseFanCoilModel,
  pickPlanPoint,
} from "./ui-helpers";
import { exportPlenumFixture } from "./plenum-ui-fixture";
import {
  distance,
  projection,
  scale,
  subtract,
} from "../src/domain/geometry/primitives";
import { roomWallSpan } from "../src/domain/geometry/placement";

test("l’Innova SLI ad incasso resta dentro la parete con la faccia a filo", async ({
  page,
}) => {
  const empty = createProject();
  const project = addRectangle(empty, empty.floors[0].id, {
    width: 5,
    length: 4,
    height: 2.7,
    name: "Sala",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "incasso.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan
    .getByRole("button", { name: "Ventilconvettore", exact: true })
    .click();
  await pickPlanPoint(plan, 2, 0.4);
  await plan.getByTestId("draft-fanCoil").click();
  const popup = page.getByRole("dialog", {
    name: "Configura apparecchio",
    exact: true,
  });
  await chooseFanCoilModel(popup, {
    manufacturer: "Innova",
    model: "AirLeaf SLI",
    taglia: "innova-airleaf-sli-200-2t",
  });
  await expect(
    popup.getByTestId("fan-coil-recess-panel-note"),
  ).toContainText("ad incasso");
  await popup
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(popup).toHaveCount(0);

  const saved = await exportPlenumFixture(page);
  const unit = saved.fanCoils![0];
  const room = saved.rooms[0];
  const wall = saved.walls.find((item) => item.id === unit.wallId)!;
  const span = roomWallSpan(room, wall)!;
  const direction = scale(subtract(span.end, span.start), 1 / span.lengthM);
  const normal = { x: -direction.y, y: direction.x };
  const frontCenter = {
    x: unit.position.x + (normal.x * unit.depthMm) / 2000,
    y: unit.position.y + (normal.y * unit.depthMm) / 2000,
  };
  // La faccia anteriore è a filo (2 mm nella stanza), non a 126 mm.
  expect(
    distance(frontCenter, projection(frontCenter, span.start, span.end)),
  ).toBeCloseTo(0.002, 4);
});
