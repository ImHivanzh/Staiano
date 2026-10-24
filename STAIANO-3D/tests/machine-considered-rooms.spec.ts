import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test, expect } from "./browser-test";
import { assignInstallationRooms } from "../src/domain/installations";
import { addRectangle } from "../src/domain/project";
import { projectSchema } from "../src/schemas/project";
import { decodeProject } from "../src/services/project/format";
import { formatNumber } from "../src/utils/format";

for (const width of [1920, 1366, 1024, 768, 390])
  test(`machine lists only connected rooms once at ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({
      width,
      height: width === 1366 || width === 1024 ? 768 : 900,
    });
    let project = decodeProject(
      readFileSync("tests/fixtures/unconfigured-connections.json", "utf8"),
    );
    for (const name of ["Camera", "Studio"])
      project = addRectangle(project, project.floors[0].id, {
        width: 4,
        length: 4,
        height: 2.7,
        name,
      });
    const camera = project.rooms.find((room) => room.name === "Camera")!;
    const machine = project.ductedDrafts!.find(
      (draft) => draft.kind === "machine",
    )!;
    const terminal = project.ductedDrafts!.find(
      (draft) => draft.kind === "terminal",
    )!;
    const point = camera.polygon[0];
    project.ductedDrafts = [
      machine,
      ...[0, 1].map((offset) => ({
        ...terminal,
        id: randomUUID(),
        roomId: camera.id,
        machineId: machine.id,
        position: { x: point.x + 1 + offset, y: point.y + 1 },
      })),
    ];
    project = assignInstallationRooms(
      project,
      machine.installationId,
      "ducted",
      [camera.id],
    );
    projectSchema.parse(project);
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "rooms.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await page.getByTestId("draft-machine").click();
    const dialog = page.getByRole("dialog", {
      name: "Scegli macchina canalizzata",
      exact: true,
    });
    const considered = dialog.getByRole("region", {
      name: "Ambienti considerati",
    });
    await expect(
      considered.getByText(
        "Collega prima tutte le bocchette per dimensionare correttamente la macchina. Il fabbisogno somma il carico degli ambienti elencati.",
      ),
    ).toBeVisible();
    await expect(considered.getByRole("listitem")).toHaveCount(1);
    await expect(considered).toContainText("Camera");
    await expect(considered).toContainText(
      `${formatNumber(camera.designLoadW / 1000)} kW`,
    );
    await expect(considered).not.toContainText("Soggiorno");
    await expect(considered).not.toContainText("Studio");
    await expect(
      dialog.getByRole("button", { name: "Annulla", exact: true }).first(),
    ).toHaveAttribute("title", "Annulla (Esc)");
    await dialog.screenshot({ path: info.outputPath("machine-rooms.png") });
    expect(
      await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    if (width >= 768) {
      const content = dialog.locator("> div");
      const fits = () =>
        content.evaluate((node) => ({
          vertical: node.scrollHeight <= node.clientHeight + 1,
          horizontal: node.scrollWidth <= node.clientWidth + 1,
        }));
      expect(await fits()).toEqual({ vertical: true, horizontal: true });
      const models = dialog.getByRole("region", {
        name: "Modelli macchina compatibili",
      });
      await models.getByRole("button").last().click();
      await expect(models.getByRole("button").last()).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await dialog
        .getByRole("button", { name: "Dati manuali", exact: true })
        .click();
      expect(await fits()).toEqual({ vertical: true, horizontal: true });
      await expect(dialog.getByLabel("Marca macchina manuale")).toBeVisible();
      await dialog.screenshot({ path: info.outputPath("machine-manual.png") });
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
