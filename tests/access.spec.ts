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
  await page.getByRole("button", { name: "Esci", exact: true }).click();
  await expect(page).toHaveURL(/\/accedi/);
  const cookies = await context.cookies();
  expect(cookies.some((cookie) => cookie.name === SESSION_COOKIE)).toBe(false);
});
