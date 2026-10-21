import { readFileSync } from "node:fs";
import { test, expect } from "./browser-test";
import { dragPlanDevice, openDisclosure, pickPlanPoint } from "./ui-helpers";

for (const width of [1920, 1024])
  test(`Muovi drags connected drafts and ignores destination clicks at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const project = JSON.parse(
      readFileSync("tests/fixtures/unconfigured-connections.json", "utf8"),
    );
    const machine = project.ductedDrafts.find(
      (draft: { kind: string }) => draft.kind === "machine",
    );
    const terminal = project.ductedDrafts.find(
      (draft: { kind: string }) => draft.kind === "terminal",
    );
    terminal.machineId = machine.id;
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "drag.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    const plan = page.getByRole("region", {
      name: "Configurazione grafica canalizzato",
    });
    await plan.getByRole("button", { name: "Muovi (M)", exact: true }).click();
    await plan.getByTestId("draft-machine").click();
    await pickPlanPoint(plan, 3, 4);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const screen = await plan.getByTestId("editor-2d").evaluate((node) =>
      [new DOMPoint(2, 4), new DOMPoint(3, 4)].map((point) => {
        const at = point.matrixTransform(
          (node as SVGSVGElement).getScreenCTM()!,
        );
        return { x: at.x, y: at.y };
      }),
    );
    if (width === 1024) {
      const touch = await page.context().newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ ...screen[0], id: 1 }],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ ...screen[1], id: 1 }],
      });
      await expect(plan.getByTestId("draft-machine")).toHaveAttribute(
        "transform",
        /translate/,
      );
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await touch.detach();
    } else {
      await page.mouse.move(screen[0].x, screen[0].y);
      await page.mouse.down();
      await page.mouse.move(screen[1].x, screen[1].y, { steps: 10 });
      await expect(plan.getByTestId("draft-machine")).toHaveAttribute(
        "transform",
        /translate/,
      );
      await page.mouse.up();
    }
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      plan.getByRole("button", { name: "Muovi (M)", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await dragPlanDevice(page, plan, plan.getByTestId("draft-terminal"), 5, 2);
    await expect(
      plan.getByRole("button", { name: "Muovi (M)", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await plan.getByRole("button", { name: "Seleziona", exact: true }).click();
    await expect(
      plan.getByRole("button", { name: "Muovi (M)", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("save-status")).toHaveText("Salvato");
    const download = page.waitForEvent("download");
    await openDisclosure(page, "File");
    await page.getByRole("button", { name: "Esporta", exact: true }).click();
    const result = JSON.parse(
      readFileSync((await (await download).path())!, "utf8"),
    );
    expect(
      result.ductedDrafts.find((item: { id: string }) => item.id === machine.id)
        .position,
    ).toEqual({ x: 3, y: 4 });
    const movedTerminal = result.ductedDrafts.find(
      (item: { id: string }) => item.id === terminal.id,
    );
    expect(movedTerminal.position).toEqual({ x: 5, y: 2 });
    expect(movedTerminal.machineId).toBe(machine.id);
    expect(result.ductedDrafts).toHaveLength(2);
    await page.reload();
    await expect(plan.getByTestId("pending-connection")).toHaveCount(1);
    const insert = plan.getByRole("button", { name: "Macchina", exact: true });
    await insert.click();
    await pickPlanPoint(plan, 4, 3);
    await expect(insert).toHaveAttribute("aria-pressed", "true");
    await pickPlanPoint(plan, 5, 3);
    await expect(plan.getByTestId("draft-machine")).toHaveCount(3);
    await expect(insert).toHaveAttribute("aria-pressed", "true");
  });
