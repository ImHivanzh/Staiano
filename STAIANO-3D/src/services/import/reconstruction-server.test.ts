import { EventEmitter } from "node:events";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  stat: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  readFile: mocks.readFile,
  stat: mocks.stat,
}));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
import { recognitionAiStatus } from "./reconstruction-server";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readFile.mockResolvedValue(
    JSON.stringify({
      python: path.resolve("fake-ai/python.exe"),
      source: path.resolve("fake-ai/source"),
      checkpoint: path.resolve("fake-ai/checkpoint.pth"),
    }),
  );
  mocks.stat.mockResolvedValue({ isFile: () => true });
});
afterEach(() => vi.useRealTimers());
function python(output: string, code = 0) {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    kill: vi.fn(),
  });
  mocks.spawn.mockImplementation(() => {
    queueMicrotask(() => {
      child.stdout.emit("data", output);
      child.emit("close", code);
    });
    return child;
  });
}
it("reports missing runtime without starting Python", async () => {
  mocks.stat.mockRejectedValue(Error("missing"));
  expect(await recognitionAiStatus(true)).toMatchObject({
    available: false,
    state: "unavailable",
  });
  expect(mocks.spawn).not.toHaveBeenCalled();
});
it("distinguishes installation from an explicit working dependency check", async () => {
  expect(await recognitionAiStatus()).toMatchObject({
    available: true,
    state: "installed",
  });
  expect(mocks.spawn).not.toHaveBeenCalled();
  python('{"ok":true,"device":"cpu"}\n');
  expect(await recognitionAiStatus(true)).toMatchObject({
    available: true,
    state: "ready",
    device: "cpu",
  });
  expect(mocks.spawn).toHaveBeenCalledWith(
    expect.any(String),
    expect.arrayContaining(["-c"]),
    expect.objectContaining({ shell: false, windowsHide: true }),
  );
});
it.each([
  ["not json", 0],
  ['{"ok":false,"device":"cpu"}', 0],
  ["", 1],
])(
  "reports invalid or broken Python without leaking paths (%s)",
  async (output, code) => {
    python(output, code);
    const result = await recognitionAiStatus(true);
    expect(result).toMatchObject({ available: false, state: "error" });
    expect(JSON.stringify(result)).not.toContain("fake-ai");
  },
);
it("bounds an unresponsive check and allows retry", async () => {
  vi.useFakeTimers();
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    kill: vi.fn(),
  });
  mocks.spawn.mockReturnValue(child);
  const pending = recognitionAiStatus(true);
  await vi.advanceTimersByTimeAsync(15001);
  expect(await pending).toMatchObject({ available: false, state: "error" });
  expect(child.kill).toHaveBeenCalledOnce();
  python('{"ok":true,"device":"cuda"}\n');
  expect(await recognitionAiStatus(true)).toMatchObject({
    state: "ready",
    device: "cuda",
  });
});
