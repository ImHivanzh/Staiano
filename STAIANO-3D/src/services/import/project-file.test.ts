import { afterEach, expect, it, vi } from "vitest";
import { createProject } from "@/domain/project";
import { importProjectFile } from "./project-file";

afterEach(() => vi.unstubAllGlobals());

it("trasferisce il buffer del progetto al worker senza clonarlo come stringa", async () => {
  const project = createProject("Importato");
  let sentBuffer: ArrayBuffer | undefined;
  let transfer: Transferable[] = [];
  class TestWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    postMessage(message: { buffer: ArrayBuffer }, list: Transferable[]) {
      sentBuffer = message.buffer;
      transfer = list;
      queueMicrotask(() =>
        this.onmessage?.({ data: { project } } as MessageEvent),
      );
    }
    terminate() {}
  }
  vi.stubGlobal("Worker", TestWorker);

  await expect(
    importProjectFile(new File(["{}"], "progetto.hvacproj")),
  ).resolves.toEqual(project);
  expect(sentBuffer).toBeInstanceOf(ArrayBuffer);
  expect(transfer).toEqual([sentBuffer]);
});
