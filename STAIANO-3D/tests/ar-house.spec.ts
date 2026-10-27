import { expect, test } from "./browser-test";
import { openDisclosure } from "./ui-helpers";

test("tutta la casa si condivide in AR con un link da 30 minuti", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await openDisclosure(page, "File");
  await page
    .getByRole("button", { name: "Impostazioni progetto e piani" })
    .click();
  await page.getByLabel("Nome del nuovo piano").fill("Primo piano");
  await page
    .locator(".gestione-piano")
    .getByRole("button", { name: "Aggiungi piano" })
    .click();
  await expect(page.getByText("Quota 3 m")).toBeVisible();
  await page.getByRole("button", { name: "Planimetria", exact: true }).click();
  await openDisclosure(page, "File");
  await page
    .getByRole("button", { name: "Casa in realtà aumentata (iPad/telefono)" })
    .click();
  await expect(page.getByAltText("QR code del link AR")).toBeVisible({
    timeout: 60000,
  });
  const link = new URL(await page.getByLabel("Link AR").inputValue());
  const base = `http://127.0.0.1:${link.port}${link.pathname}`;
  expect((await request.get(base)).status()).toBe(200);
  const glb = Buffer.from(await (await request.get(`${base}/m/0/0.glb`)).body());
  expect(glb.toString("latin1", 0, 4)).toBe("glTF");
  const json = JSON.parse(
    glb.toString("utf8", 20, 20 + glb.readUInt32LE(12)),
  ) as { nodes: { name?: string }[] };
  const names = json.nodes.map((node) => node.name);
  expect(names).toContain("Piano terra");
  expect(names).toContain("Primo piano");
});
