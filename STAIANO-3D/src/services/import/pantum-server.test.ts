import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { readFile, stat, writeFile } from "node:fs/promises";
import { scanPantum } from "./pantum-server";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: execute }));
afterEach(() => vi.resetAllMocks());

it("runs only the local worker, blocks concurrent scans and deletes the temporary PDF", async () => {
  let complete!: () => void;
  let destination = "";
  execute.mockImplementation((...args: unknown[]) => {
    const workerArgs = args[1] as string[];
    expect(workerArgs[0]).toMatch(/native[\\/]pantum[\\/]scansione.py$/);
    expect(workerArgs[1]).toBe("--worker-scan");
    expect(workerArgs[2]).toBe("300");
    expect(workerArgs[4]).toBe("adf");
    destination = workerArgs[3];
    const callback = args[3] as (
      error: Error | null,
      stdout: string,
      stderr: string,
    ) => void;
    complete = () => {
      void writeFile(destination, "%PDF-1.7\nscan").then(() =>
        callback(null, "", ""),
      );
    };
  });
  const pending = scanPantum(300, "adf");
  await vi.waitFor(() => expect(complete).toBeDefined());
  await expect(scanPantum(150, "piano")).rejects.toMatchObject({ status: 409 });
  complete();
  expect((await pending).toString()).toBe("%PDF-1.7\nscan");
  await expect(readFile(destination)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(
    stat(destination.replace(/[\\/]scansione.pdf$/, "")),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

it("rejects invalid output, releases the lock after failures and handles worker errors", async () => {
  execute.mockImplementation((...args: unknown[]) => {
    const destination = (args[1] as string[])[3];
    const callback = args[3] as (
      error: unknown,
      stdout: string,
      stderr: string,
    ) => void;
    void writeFile(destination, "not a PDF").then(() => callback(null, "", ""));
  });
  await expect(scanPantum(150, "piano")).rejects.toThrow(
    "PDF della scansione non valido",
  );
  for (const [error, stderr, status] of [
    [{ code: "ENOENT" }, "", 503],
    [{ killed: true }, "", 504],
    [{ code: 1 }, "Vassoio vuoto", 502],
  ] as const) {
    execute.mockImplementation((...args: unknown[]) => {
      (args[3] as (error: unknown, stdout: string, stderr: string) => void)(
        error,
        "",
        stderr,
      );
    });
    await expect(scanPantum(150, "adf")).rejects.toMatchObject({ status });
  }
});

it("falls back to the source when the packaged .pyc is for another Python", async () => {
  vi.stubEnv("STAIANO_PACKAGED", "1");
  const scripts: string[] = [];
  execute.mockImplementation((...args: unknown[]) => {
    const [script, , , destination] = args[1] as string[];
    scripts.push(script);
    const callback = args[3] as (e: unknown, o: string, s: string) => void;
    if (script.endsWith(".pyc"))
      return callback({ code: 1 }, "", "ImportError: bad magic number in 'scansione'");
    void writeFile(destination, "%PDF-1.7\nscan").then(() => callback(null, "", ""));
  });
  expect((await scanPantum(150, "piano")).toString()).toBe("%PDF-1.7\nscan");
  expect(scripts.map((s) => path.basename(s))).toEqual(["scansione.pyc", "scansione.py"]);
  vi.unstubAllEnvs();
});
