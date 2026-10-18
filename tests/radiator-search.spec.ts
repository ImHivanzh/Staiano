import { expect, test } from "./browser-test";
import { pickPlanPoint } from "./ui-helpers";

test("radiator worker restarts after termination and the current plan picker preserves drafts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const restarted = await page.evaluate(async () => {
    const input = {
      requiredW: 1000,
      catalog: [],
      deltaTK: 50,
      constraints: { number: 1 },
    };
    const cancelled = new Worker("/workers/size.worker.js");
    cancelled.postMessage(input);
    cancelled.terminate();
    return new Promise((resolve) => {
      const worker = new Worker("/workers/size.worker.js");
      worker.onmessage = (event) => {
        worker.terminate();
        resolve(event.data);
      };
      worker.onerror = () => {
        worker.terminate();
        resolve({ error: "Worker non avviabile" });
      };
      worker.postMessage(input);
    });
  });
  expect(restarted).toMatchObject({ solutions: [] });
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan.getByRole("button", { name: "Radiatore", exact: true }).click();
  await pickPlanPoint(plan, 2, 0.4);
  await plan.getByTestId("draft-radiator").click();
  const popup = page.getByRole("dialog", {
    name: "Configura apparecchio",
    exact: true,
  });
  await popup.getByRole("button", { name: "Global", exact: true }).click();
  await popup.getByRole("button", { name: "VIP", exact: true }).click();
  await popup
    .getByRole("spinbutton", { name: /^ΔT progetto \(K\)/ })
    .fill("50");
  await popup
    .getByRole("button", { name: "Trova radiatori compatibili" })
    .click();
  await expect(popup.locator(".soluzione-radiatore")).not.toHaveCount(0);
  await expect(plan.getByTestId("radiator-2d")).toHaveCount(0);
  await expect(plan.getByTestId("draft-radiator")).toHaveCount(1);
  expect(errors).toEqual([]);
});
