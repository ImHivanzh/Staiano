import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";

test("shared API locks tabs, checks revisions, logs changes and supports grant/revoke", async ({
  page,
  baseURL,
}) => {
  await page.goto("/");
  const project = JSON.parse(
    readFileSync("tests/fixtures/realistic-home.hvacproj", "utf8"),
  );
  project.id = randomUUID();
  project.name = `Test condivisione ${project.id}`;
  const token = randomUUID(),
    otherToken = randomUUID();
  const origin = new URL(baseURL ?? "http://127.0.0.1:3015").origin;
  const api = page.context().request;
  const post = (body: object) =>
    api.post("/api/projects", {
      headers: { Origin: origin },
      data: { id: project.id, token, ...body },
    });
  let published = false,
    revision = 1;
  try {
    const created = await post({ action: "publish", project });
    expect(created.status()).toBe(200);
    published = true;
    expect(
      (await post({ action: "acquire", token: otherToken })).status(),
    ).toBe(423);
    expect(
      (await post({ action: "save", revision: 0, project })).status(),
    ).toBe(409);
    const renamed = {
      ...project,
      name: `${project.name} aggiornato`,
      updatedAt: new Date().toISOString(),
    };
    const saved = await post({ action: "save", revision, project: renamed });
    expect(saved.status()).toBe(200);
    const savedResult = await saved.json();
    revision = savedResult.revision;
    expect(savedResult.audit.at(-1).action).toContain("nome:");
    expect(savedResult.audit.at(-1).username).toBe(savedResult.owner);
    const catalog = await (await api.get("/api/projects")).json();
    const recipient = catalog.users.find(
      (user: { username: string }) => user.username !== savedResult.owner,
    );
    if (recipient) {
      expect(
        (
          await post({
            action: "share",
            revision,
            username: recipient.username,
          })
        ).status(),
      ).toBe(200);
      const read = await (
        await api.get(`/api/projects?id=${project.id}`)
      ).json();
      expect(read.members).toContain(recipient.username);
      expect(
        (
          await post({
            action: "revoke",
            revision,
            username: recipient.username,
          })
        ).status(),
      ).toBe(200);
      expect(
        (await (await api.get(`/api/projects?id=${project.id}`)).json())
          .members,
      ).not.toContain(recipient.username);
    }
  } finally {
    if (published)
      expect((await post({ action: "delete", revision })).status()).toBe(200);
  }
});

test("sharing popup shows registered users and closes cleanly", async ({
  page,
}) => {
  await page.goto("/");
  const project = JSON.parse(
    readFileSync("tests/fixtures/realistic-home.hvacproj", "utf8"),
  );
  project.id = randomUUID();
  project.name = "Test popup condivisione";
  await page
    .getByTestId("project-file")
    .setInputFiles({
      name: "sharing.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(
    page.getByRole("heading", { name: project.name, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Condividi progetto", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Condivisione progetto" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Utente registrato")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Condividi", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Chiudi", exact: true }).click();
  await expect(dialog).not.toBeVisible();
});
