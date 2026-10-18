import { test as base, expect } from "@playwright/test";
import {
  createSession,
  getAccessConfig,
  SESSION_COOKIE,
  SESSION_SECONDS,
} from "../src/server/auth";

/** Every covered UI flow rejects uncaught runtime and browser console errors. */
export const test = base.extend<{
  expectedHttpError: { status: number; path: string } | null;
}>({
  expectedHttpError: [null, { option: true }],
  page: async ({ page, expectedHttpError, baseURL }, runFlow) => {
    const config = await getAccessConfig();
    await page.context().addCookies([
      {
        name: SESSION_COOKIE,
        value: createSession(config),
        url: baseURL ?? "http://127.0.0.1:3015",
        httpOnly: true,
        secure: (baseURL ?? "").startsWith("https:"),
        sameSite: "Strict",
        expires: Date.now() / 1000 + SESSION_SECONDS,
      },
    ]);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      // Only an explicitly tested invalid request may produce its expected HTTP console line.
      const expected =
        expectedHttpError &&
        message
          .text()
          .startsWith(
            `Failed to load resource: the server responded with a status of ${expectedHttpError.status} (`,
          ) &&
        message.text().endsWith(")");
      if (!expected) errors.push(message.text());
    });
    await runFlow(page);
    expect(errors, "Unexpected browser runtime/console errors").toEqual([]);
  },
});
export { expect };
