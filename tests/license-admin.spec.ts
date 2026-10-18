import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import worker from "../license-server/src/index";

let server: Server, origin: string, database: DatabaseSync;
const adminToken = "local-browser-test-administrator";
let configuredAdminToken: string | undefined = adminToken;
test.afterEach(() => {
  configuredAdminToken = adminToken;
});
test.beforeAll(async () => {
  database = new DatabaseSync(":memory:");
  database.exec(readFileSync("license-server/schema.sql", "utf8"));
  const statement = (query: string, values: unknown[] = []) => ({
    bind: (...bound: unknown[]) => statement(query, bound),
    first: async () =>
      database.prepare(query).get(...(values as never[])) ?? null,
    all: async () => ({
      results: database.prepare(query).all(...(values as never[])),
    }),
    run: async () => {
      database.prepare(query).run(...(values as never[]));
      return { success: true };
    },
  });
  const env = {
    get PASSKEY_ORIGIN() {
      return origin;
    },
    DB: { prepare: statement, batch: async () => [] },
    get ADMIN_TOKEN() {
      return configuredAdminToken;
    },
    LICENSE_PRIVATE_KEY: generateKeyPairSync("ed25519").privateKey.export({
      type: "pkcs8",
      format: "pem",
    }) as string,
    ASSETS: {
      fetch: async (request: Request) => {
        const name = new URL(request.url).pathname.slice(1);
        return new Response(readFileSync(`license-server/public/${name}`), {
          headers: {
            "Content-Type": name.endsWith(".css")
              ? "text/css"
              : name.endsWith(".js")
                ? "text/javascript"
                : "text/html",
          },
        });
      },
    },
  } as Parameters<typeof worker.fetch>[1];
  server = createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const result = await worker.fetch(
        new Request(`${origin}${request.url}`, {
          method: request.method,
          headers: request.headers as Record<string, string>,
          body: chunks.length ? Buffer.concat(chunks) : undefined,
        }),
        env,
      );
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      response.writeHead(500);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Server di collaudo non avviato.");
  origin = `http://localhost:${address.port}`;
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  database.close();
});

test("pannello licenze: accesso, creazione, modifica, revoca, ripristino e chiusura accesso", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page
    .getByText("Primo accesso o recupero con token", { exact: true })
    .click();
  await page.getByLabel("Token amministratore").fill("errato");
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Autorizzazione richiesta",
  );
  await page.getByLabel("Token amministratore").fill(adminToken);
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await page.getByRole("button", { name: "Crea licenza", exact: true }).click();
  await page
    .getByLabel("Cliente", { exact: true })
    .fill("Termoidraulica Collaudo");
  await page.getByRole("button", { name: "Salva licenza" }).click();
  await expect(page.locator("#new-key")).toHaveText(/^LIC-/);
  await page.getByRole("button", { name: "Ho salvato la chiave" }).click();
  await page.getByRole("button", { name: "Modifica", exact: true }).click();
  await page.getByLabel("Postazioni", { exact: true }).fill("2");
  await page
    .getByLabel("Note", { exact: true })
    .fill("Licenza di collaudo interfaccia. Nessun dato reale.");
  await page.getByRole("button", { name: "Salva licenza" }).click();
  await expect(page.locator("#licenses")).toContainText("0/2 postazioni");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Revoca", exact: true }).click();
  await expect(page.locator("#licenses")).toContainText("Revocata");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Ripristina", exact: true }).click();
  await expect(page.locator("#licenses .status")).toHaveText("Attiva");
  for (const [width, height, name] of [
    [1920, 1080, "desktop"],
    [1024, 768, "tablet"],
    [390, 844, "mobile"],
  ] as const) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.impeccable/review/license-${name}.png`,
      fullPage: true,
    });
  }
  await page.getByLabel("Cerca cliente o ID").fill("inesistente");
  await expect(page.locator("#licenses")).toContainText(
    "Nessuna licenza corrisponde",
  );
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  await page.getByRole("button", { name: "Esci", exact: true }).click();
  await expect(page.getByLabel("Token amministratore")).toBeVisible();
  await expect(page.locator("#licenses")).toBeEmpty();
  expect(errors).toEqual([]);
});

test("consegna la chiave monouso anche quando il refresh successivo fallisce", async ({
  page,
}) => {
  await page.goto(origin);
  await page
    .getByText("Primo accesso o recupero con token", { exact: true })
    .click();
  await page.getByLabel("Token amministratore").fill(adminToken);
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await page.getByRole("button", { name: "Crea licenza", exact: true }).click();
  await page
    .getByLabel("Cliente", { exact: true })
    .fill("Cliente con rete interrotta");
  await page.route("**/admin/licenses", async (route) => {
    if (route.request().method() === "GET")
      await route.fulfill({
        status: 503,
        json: { message: "Elenco non disponibile" },
      });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Salva licenza" }).click();
  await expect(page.locator("#new-key")).toHaveText(/^LIC-/);
  await expect(page.locator("#message")).toContainText(
    "Elenco non disponibile",
  );
});

test("passkey: registrazione autenticata, accesso e cookie protetto", async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto(origin);
  await page
    .getByText("Primo accesso o recupero con token", { exact: true })
    .click();
  await page.getByLabel("Token amministratore").fill(adminToken);
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await page
    .getByRole("button", { name: "Registra passkey", exact: true })
    .click();
  await expect(page.locator("#message")).toContainText("Passkey registrata");
  configuredAdminToken = undefined;
  expect(
    (
      await page.request.get(`${origin}/admin/licenses`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).status(),
  ).toBe(401);
  await page.getByRole("button", { name: "Esci", exact: true }).click();
  await page
    .getByRole("button", { name: "Accedi con passkey", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Crea licenza", exact: true }),
  ).toBeVisible();
  const session = (await page.context().cookies()).find(
    (cookie) => cookie.name === "__Host-licenses-admin",
  );
  expect(session).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Crea licenza", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#token-recovery")).toBeHidden();
  await page.getByRole("button", { name: "Esci", exact: true }).click();
  expect(
    (await page.context().cookies()).find(
      (cookie) => cookie.name === "__Host-licenses-admin",
    ),
  ).toBeUndefined();
});

test("conserva il software scelto nel form dopo un refresh dell'elenco", async ({
  page,
}) => {
  await page.goto(origin);
  await page
    .getByText("Primo accesso o recupero con token", { exact: true })
    .click();
  await page.getByLabel("Token amministratore").fill(adminToken);
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await page
    .getByRole("button", { name: "Gestisci software", exact: true })
    .click();
  await page
    .getByLabel("Nome software", { exact: true })
    .fill("Secondo applicativo");
  await page
    .getByLabel("ID software", { exact: true })
    .fill("secondo-applicativo");
  await page
    .getByRole("button", { name: "Registra software", exact: true })
    .click();
  await expect(page.locator("#products-list")).toContainText(
    "Secondo applicativo",
  );
  await page.getByRole("button", { name: "Crea licenza", exact: true }).click();
  await page.locator("#license-product").selectOption("secondo-applicativo");
  await page
    .getByLabel("Cliente", { exact: true })
    .fill("Cliente secondo software");
  await page
    .getByRole("button", { name: "Aggiorna elenco", exact: true })
    .click();
  await expect(page.locator("#license-product")).toHaveValue(
    "secondo-applicativo",
  );
  await page.getByRole("button", { name: "Salva licenza" }).click();
  await expect(
    page
      .locator("#licenses article")
      .filter({ hasText: "Cliente secondo software" }),
  ).toContainText("Secondo applicativo");
});
