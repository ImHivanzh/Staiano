import { execFileSync } from "node:child_process";
import { test, expect } from "./browser-test";
import { openDisclosure } from "./ui-helpers";

const project = JSON.parse(
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
  import { guidedProjectFixture, guidedTerminalPoint } from './tests/guided-fixture.ts';
  import { ensureInstallations } from './src/domain/installations.ts';
  import { placeMachineOnPlan, saveTerminalOnPlan, connectTerminalOnPlan } from './src/domain/ducted/graphic-installation.ts';
  let p = ensureInstallations(guidedProjectFixture(10));
  p.floors[0].configurationWizard = undefined;
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, {x:2,y:4});
  p = saveTerminalOnPlan(p, {...guidedTerminalPoint(), roomId:p.rooms[0].id, systemId:p.hvacSystems[0].id, use:'supply', mounting:'ceiling', lengthMm:6000, moduleLengthsMm:[2000,2000,2000], color:'RAL9016', plenumOptions:{insulatedPlenum:true}}, {x:4,y:2});
  p = connectTerminalOnPlan(p, p.airTerminals[0].id, p.hvacSystems[0].id);
  console.log(JSON.stringify(p));
`,
    ],
    { encoding: "utf8" },
  ),
);

for (const width of [1920, 1024]) {
  test(`large terminal plenum and 3D menus remain readable at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "large-plenum.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await page.getByRole("button", { name: /^Soggiorno / }).click();
    await page.getByTestId("terminal-supply").first().focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", {
      name: "Configura bocchetta",
      exact: true,
    });
    await dialog.getByRole("tab", { name: "Plenum", exact: true }).click();
    const preview = dialog.getByTestId("terminal-plenum-preview");
    await expect(preview.locator("canvas")).toHaveAttribute(
      "data-rendered",
      "true",
      { timeout: 30000 },
    );
    await expect(dialog).toContainText(
      "3 plenum · 2000 + 2000 + 2000 mm · 6 stacchi totali",
    );
    expect((await preview.boundingBox())!.height).toBeGreaterThanOrEqual(280);
    const inlineWidth = (await preview.boundingBox())!.width;
    await dialog
      .getByRole("button", { name: "Ingrandisci plenum", exact: true })
      .click();
    const expanded = page.getByRole("dialog", {
      name: "Plenum della bocchetta · vista ingrandita",
      exact: true,
    });
    const canvas = expanded.locator("canvas");
    await expect(canvas).toHaveAttribute("data-rendered", "true", {
      timeout: 30000,
    });
    expect((await canvas.boundingBox())!.width).toBeGreaterThan(inlineWidth);
    for (const name of ["Frontale", "Dall’alto", "Isometrica"]) {
      const button = expanded.getByRole("button", { name, exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
    }
    const fittedZoom = Number(await canvas.getAttribute("data-zoom"));
    await canvas.hover();
    await page.mouse.wheel(0, -300);
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-zoom")))
      .toBeGreaterThan(fittedZoom);
    await expanded
      .getByRole("button", { name: "Reimposta vista", exact: true })
      .click();
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-zoom")))
      .toBeCloseTo(fittedZoom, 1);
    await expanded.screenshot({
      path: testInfo.outputPath(`large-plenum-${width}.png`),
    });
    await page.keyboard.press("Escape");
    await expect(expanded).not.toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Ingrandisci plenum", exact: true }),
    ).toBeFocused();
    await dialog
      .getByRole("button", { name: "Annulla", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "3D", exact: true }).click();
    const viewer = page.getByTestId("viewer-3d");
    await expect(viewer.locator("canvas")).toHaveAttribute(
      "data-rendered",
      "true",
      { timeout: 30000 },
    );
    for (const menu of ["Aspetto", "Vista 3D", "Impianti"]) {
      await openDisclosure(viewer, menu);
      const panel = viewer
        .locator("details[open]")
        .filter({ has: page.locator("summary", { hasText: menu }) })
        .first();
      const layout = await panel.evaluate((el) => {
        const body = el.querySelector("summary + div")!;
        const bounds = body.getBoundingClientRect();
        const labels = [...body.querySelectorAll("label")].map((label) =>
          label.getBoundingClientRect(),
        );
        return {
          fits: body.scrollWidth <= body.clientWidth,
          left: bounds.left,
          right: bounds.right,
          nonOverlapping: labels.every(
            (rect, index) =>
              index === 0 || rect.top >= labels[index - 1].bottom,
          ),
        };
      });
      expect(layout.fits).toBe(true);
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.right).toBeLessThanOrEqual(width);
      expect(layout.nonOverlapping).toBe(true);
      await viewer.screenshot({
        path: testInfo.outputPath(`${menu}-${width}.png`),
      });
    }
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await page.getByTestId("split-2d").first().focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Scegli macchina canalizzata" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await viewer
      .getByRole("button", { name: "Vista plenum", exact: true })
      .click();
    const machinePlenum = page.getByRole("dialog", {
      name: "Plenum degli impianti autonomi",
    });
    const groupedButton = machinePlenum.getByRole("button", {
      name: "Vista raggruppata",
      exact: true,
    });
    await expect(groupedButton).toHaveAttribute("aria-pressed", "true");
    await machinePlenum
      .getByText("Stacchi e diametri", { exact: false })
      .click();
    await expect(machinePlenum.locator("table tbody tr")).toHaveCount(1);
    await expect(machinePlenum.locator("table tbody tr")).toContainText(
      "6 × Ø 145 mm",
    );
    await machinePlenum
      .getByRole("button", { name: "Vista 3D plenum", exact: true })
      .click();
    const summary = machinePlenum.getByTestId("plenum-summary");
    await expect(summary.getByRole("img")).toBeVisible();
    await expect(summary).toContainText("Portata dichiarata 4,2 metri");
    const diagram3D = machinePlenum.getByTestId("plenum-preview-3d");
    expect((await summary.boundingBox())!.y).toBeGreaterThanOrEqual(
      (await diagram3D.boundingBox())!.y +
        (await diagram3D.boundingBox())!.height,
    );
    const svg = decodeURIComponent(
      (await summary.getByRole("img").getAttribute("src"))!
        .split(",")
        .slice(1)
        .join(","),
    );
    expect(svg).toContain("Macchina");
    expect(svg.match(/data-port-id=/g)!.length).toBe(1);
    expect(svg).toContain("6 × Ø 145 mm");
    await summary.screenshot({
      path: testInfo.outputPath(`machine-summary-${width}.png`),
    });
    await machinePlenum
      .getByRole("button", { name: "Dettaglio singoli stacchi", exact: true })
      .click();
    await expect(machinePlenum.locator("table tbody tr")).toHaveCount(6);
    await expect(summary.getByRole("img")).toHaveAttribute(
      "alt",
      /stacchi numerati/,
    );
    await groupedButton.click();
    await expect(machinePlenum.locator("table tbody tr")).toHaveCount(1);
  });
}
