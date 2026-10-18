import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect } from "./browser-test";

test("admin crea un utente e resetta la password; operatore senza gestione utenti e vecchia sessione revocata", async ({
  page,
  browser,
  baseURL,
}, info) => {
  test.setTimeout(60000);
  const authFile = process.env.AUTH_FILE;
  test.skip(
    !authFile ||
      (!resolve(authFile).startsWith(resolve("tmp") + "/") &&
        !resolve(authFile).startsWith(resolve("tmp") + "\\")),
    "Richiede AUTH_FILE isolato dentro tmp; non modificare account reali nei test.",
  );
  const original = await readFile(authFile!, "utf8");
  const username = `test.${Date.now()}`;
  const initialPassword = "Initial-test-user-password-2026";
  const personalPassword = "Personal-test-user-password-2026";
  const resetPassword = "Reset-test-user-password-2026";
  const operator = await browser.newContext({ baseURL });
  try {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Gestione utenti", exact: true })
      .click();
    const create = page.getByRole("region", { name: "Nuovo utente" });
    await create.getByLabel("Nome utente", { exact: true }).fill(username);
    await create
      .getByLabel("Nome visualizzato", { exact: true })
      .fill("Utente di prova");
    await create
      .getByLabel("Password iniziale", { exact: true })
      .fill(initialPassword);
    await create
      .getByLabel("Ripeti password iniziale", { exact: true })
      .fill(initialPassword);
    await create
      .getByRole("button", { name: "Crea utente", exact: true })
      .click();
    await expect(
      page.getByText(
        "Utente creato. Cambio password richiesto al primo accesso.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      create.getByLabel("Password iniziale", { exact: true }),
    ).toHaveValue("");
    const row = page.getByRole("article", {
      name: `Utente ${username}`,
      exact: true,
    });
    await expect(row).toContainText("Operatore");
    const operatorPage = await operator.newPage();
    await operatorPage.goto("/accedi");
    await operatorPage
      .getByLabel("Utente", { exact: true })
      .selectOption(username);
    await operatorPage
      .getByLabel("Password", { exact: true })
      .fill(initialPassword);
    await operatorPage
      .getByRole("button", { name: "Accedi", exact: true })
      .click();
    await expect(
      operatorPage.getByRole("heading", { name: "Password personale" }),
    ).toBeVisible();
    await operatorPage
      .getByLabel("Password attuale", { exact: true })
      .fill(initialPassword);
    await operatorPage
      .getByLabel("Nuova password", { exact: true })
      .fill(personalPassword);
    await operatorPage
      .getByLabel("Ripeti nuova password", { exact: true })
      .fill(personalPassword);
    const [parallel] = await Promise.all([
      page.request.post("/api/admin/users", {
        headers: { origin: baseURL! },
        form: {
          action: "create",
          username: `${username}.parallel`,
          displayName: "Verifica simultanea",
          password: initialPassword,
          confirmPassword: initialPassword,
        },
      }),
      operatorPage.getByRole("button", { name: "Salva e continua" }).click(),
    ]);
    expect(parallel.status()).toBe(201);
    const listed = await (await page.request.get("/api/admin/users")).json();
    expect(
      listed.users.some(
        (u: { username: string }) => u.username === `${username}.parallel`,
      ),
    ).toBe(true);
    await expect(
      operatorPage.getByRole("button", { name: "Nuovo", exact: true }),
    ).toBeVisible();
    await expect(
      operatorPage.getByRole("button", {
        name: "Gestione utenti",
        exact: true,
      }),
    ).toHaveCount(0);
    expect((await operator.request.get("/api/admin/users")).status()).toBe(403);
    await row.locator("summary").click();
    await row
      .getByLabel(`Nuova password per ${username}`, { exact: true })
      .fill(resetPassword);
    await row
      .getByLabel(`Ripeti password per ${username}`, { exact: true })
      .fill(resetPassword);
    await row
      .getByRole("button", { name: "Salva password", exact: true })
      .click();
    await expect(page.getByText(/^Password impostata\./)).toBeVisible();
    expect((await operator.request.get("/api/auth/session")).status()).toBe(
      401,
    );
    expect((await page.request.get("/api/admin/users")).status()).toBe(200);
    await operatorPage.goto("/accedi");
    await operatorPage
      .getByLabel("Utente", { exact: true })
      .selectOption(username);
    await operatorPage
      .getByLabel("Password", { exact: true })
      .fill(resetPassword);
    await operatorPage
      .getByRole("button", { name: "Accedi", exact: true })
      .click();
    await expect(
      operatorPage.getByRole("heading", { name: "Password personale" }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("gestione-utenti.png"),
      fullPage: true,
    });
  } finally {
    await operator.close();
    await writeFile(authFile!, original);
  }
});
