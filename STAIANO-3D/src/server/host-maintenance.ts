import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// L'app gira con permessi limitati: scrive solo una richiesta. L'attività
// «Staiano HVAC Update» (privilegi massimi, ogni 5 minuti) la esegue.
export const HOST_ACTIONS = ["anydesk", "reboot"] as const;
export type HostAction = (typeof HOST_ACTIONS)[number];

const requestFile = () =>
  process.env.HOST_REQUEST_FILE ||
  path.join(process.cwd(), ".cache", "host-request.json");
const resultFile = () =>
  path.join(path.dirname(requestFile()), "host-request-result.json");

export function isHostAction(value: unknown): value is HostAction {
  return HOST_ACTIONS.includes(value as HostAction);
}

export async function requestHostAction(action: HostAction, by: string) {
  await mkdir(path.dirname(requestFile()), { recursive: true });
  await writeFile(
    requestFile(),
    JSON.stringify({ action, by, requestedAt: new Date().toISOString() }),
  );
  // Avvio immediato; se l'attività manca o è occupata si aspetta il ciclo di 5 minuti.
  if (process.platform === "win32")
    execFile(
      "schtasks.exe",
      ["/Run", "/TN", "Staiano HVAC Update"],
      { windowsHide: true },
      () => {},
    );
}

async function readJson(file: string) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

export async function hostStatus() {
  return {
    pending: await readJson(requestFile()),
    last: await readJson(resultFile()),
  };
}
