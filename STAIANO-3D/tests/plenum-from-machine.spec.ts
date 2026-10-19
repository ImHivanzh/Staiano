import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";

/** Macchina canalizzata con tre bocchette di mandata reali e il plenum posato. */
function networkProject() {
  return JSON.parse(readFileSync(".cache/guided-ui-fixtures.json", "utf8"))
    .network as {
    hvacSystems: { id: string; indoorUnits: { id: string }[] }[];
    airTerminals: { id: string; use: string; systemId: string }[];
  };
}

test("la macchina apre la vista plenum con una uscita per stacco delle bocchette", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1680, height: 1050 });
  const project = networkProject();
  const system = project.hvacSystems[0];
  const vents = project.airTerminals.filter(
    (terminal) => terminal.use === "supply" && terminal.systemId === system.id,
  );
  expect(system.indoorUnits).toHaveLength(1);
  expect(vents).toHaveLength(3);

  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "plenum-macchina.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const free = page.getByRole("button", {
    name: "Continua liberamente nell’editor",
  });
  if (await free.count()) await free.click();
  const backToEditor = page.getByRole("button", {
    name: "Torna all’editor",
    exact: true,
  });
  if (await backToEditor.count()) await backToEditor.click();
  // Si clicca la macchina sulla pianta, come farebbe l'operatore.
  await page.getByTestId("split-2d").first().click();
  const picker = page.getByRole("dialog", {
    name: "Scegli macchina canalizzata",
  });
  if (await picker.count()) {
    // La macchina già configurata espone il plenum nella sua stessa finestra.
    await picker
      .getByRole("button", { name: "Vista plenum", exact: true })
      .click();
    const machinePlenum = page.getByRole("dialog", {
      name: "Vista plenum",
      exact: true,
    });
    await expect(
      machinePlenum.getByRole("region", { name: "Plenum di mandata" }),
    ).toBeVisible();
    await expect(
      machinePlenum.locator('img[alt^="Schema plenum di mandata:"]'),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(machinePlenum).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const viewer = page.getByTestId("viewer-3d");
  await expect(viewer.locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
    { timeout: 30000 },
  );

  await viewer
    .getByRole("button", { name: "Vista plenum", exact: true })
    .click({ timeout: 15000 });
  const plenum = page.getByRole("dialog", {
    name: "Plenum degli impianti autonomi",
  });
  // Il plenum mostrato è quello della macchina cliccata, non un impianto a caso.
  await expect(plenum.getByLabel("Impianto plenum")).toHaveValue(system.id);
  const panel = plenum.getByRole("region", { name: "Plenum di mandata" });
  const diagram = panel.locator('img[alt^="Schema plenum di mandata:"]');
  await expect(diagram).toBeVisible();
  const branches = Number(
    (await diagram.getAttribute("alt"))?.match(/: (\d+) stacchi/)?.[1],
  );
  // Almeno un attacco per bocchetta collegata.
  expect(branches).toBeGreaterThanOrEqual(vents.length);
  await expect(
    panel.getByRole("strong").filter({ hasText: `${branches} stacchi` }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Vista raggruppata", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await panel
    .getByRole("button", { name: "Dettaglio singoli stacchi", exact: true })
    .click();
  await expect(panel.locator("table tbody tr")).toHaveCount(branches);
  await panel
    .getByRole("button", { name: "Vista 3D plenum", exact: true })
    .click();
  await expect(
    panel.getByTestId("plenum-preview-3d").locator("canvas"),
  ).toHaveAttribute("data-plenum-ports", String(branches));
});
