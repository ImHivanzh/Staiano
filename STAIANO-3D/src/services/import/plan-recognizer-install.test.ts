import { EventEmitter } from "node:events";
import { beforeEach, expect, it, vi } from "vitest";

const spawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn }));

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  spawn.mockReturnValueOnce(child);
  return child;
}

beforeEach(() => {
  vi.resetModules();
  spawn.mockReset();
});

it.skipIf(process.platform !== "win32")(
  "installa Python 3.12 con winget e libera lo stato a fine lavoro",
  async () => {
    const { installPython312, setupState } =
      await import("./plan-recognizer-setup");
    const child = fakeChild();
    installPython312();
    expect(spawn.mock.calls[0].slice(0, 2)).toEqual([
      "winget",
      expect.arrayContaining(["install", "Python.Python.3.12", "--silent"]),
    ]);
    expect(setupState()).toMatchObject({ state: "running", phase: "python" });
    installPython312();
    expect(spawn).toHaveBeenCalledTimes(1);
    child.emit("close", 0);
    expect(setupState()).toBeNull();
  },
);

it.skipIf(process.platform !== "win32")(
  "segnala l'errore se winget fallisce",
  async () => {
    const { installPython312, setupState } =
      await import("./plan-recognizer-setup");
    const child = fakeChild();
    installPython312();
    child.stderr.emit("data", Buffer.from("accesso negato"));
    child.emit("close", 1);
    expect(setupState()).toMatchObject({
      state: "error",
      message: expect.stringContaining("accesso negato"),
    });
  },
);
