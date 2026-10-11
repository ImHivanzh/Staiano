import { openDisclosure } from "./ui-helpers";
import { test, expect } from "@playwright/test";
import {
  createSession,
  getAccessConfig,
  SESSION_COOKIE,
} from "../src/server/auth";

test("access protects pages, APIs and catalog assets; signed session and logout work", async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/accedi/);
  await expect(page.getByLabel("Password")).toBeVisible();
  expect(
    (await context.request.get("/fonts/Inter-Variable.woff2")).status(),
  ).toBe(200);
  await page.evaluate(() => document.fonts.ready);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: ".impeccable/review/access.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".impeccable/review/access-mobile.png" });
  await page.setViewportSize({ width: 1280, height: 720 });
  for (const path of [
    "/api/import/dwg",
    "/models3d/ardesia-2-460-1800.glb",
    "/workers/pdf.worker.min.mjs",
  ]) {
    const response = await context.request.get(path, { maxRedirects: 0 });
    expect([401, 303, 307]).toContain(response.status());
  }
  const config = await getAccessConfig();
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: createSession(config),
      url: baseURL!,
      httpOnly: true,
      secure: baseURL!.startsWith("https:"),
      sameSite: "Strict",
    },
  ]);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Nuovo", exact: true }),
  ).toBeVisible();
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esci", exact: true }).click();
  await expect(page).toHaveURL(/\/accedi/);
  const cookies = await context.cookies();
  expect(cookies.some((cookie) => cookie.name === SESSION_COOKIE)).toBe(false);
});

test("login stays readable on desktop and phone, including errors and password changes", async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto("/accedi");
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page
      .locator(".logo img")
      .evaluate((node) => (node as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  await expect(page.getByLabel("Utente", { exact: true })).toBeFocused();
  await page.getByLabel("Utente", { exact: true }).press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await page.getByLabel("Password", { exact: true }).press("Tab");
  await expect(
    page.getByRole("button", { name: "Accedi", exact: true }),
  ).toBeFocused();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 620 },
    { width: 390, height: 844 },
    { width: 320, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    expect(
      (await page
        .getByRole("button", { name: "Accedi", exact: true })
        .boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: `.impeccable/review/login-${viewport.width}.png`,
      fullPage: true,
    });
  }
  await page.goto("/accedi?error=invalid");
  await expect(page.getByRole("alert")).toHaveText(
    "Utente o password non corretti. Riprova.",
  );
  await page.screenshot({
    path: ".impeccable/review/login-error.png",
    fullPage: true,
  });
  const config = await getAccessConfig();
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: createSession(config),
      url: baseURL!,
      httpOnly: true,
      secure: baseURL!.startsWith("https:"),
      sameSite: "Strict",
    },
  ]);
  await page.goto("/accedi?password=change");
  await expect(
    page.getByRole("heading", { name: "Password personale", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Nuova password", { exact: true }),
  ).toHaveAttribute("minlength", "12");
  await expect(
    page.getByRole("button", { name: "Salva e continua" }),
  ).toBeVisible();
  await page.screenshot({
    path: ".impeccable/review/login-password.png",
    fullPage: true,
  });
});
