import { resolve } from "node:path";

import {
  activateLicense,
  deactivateLicense,
  licenseSetup,
  licenseStatus,
} from "@/server/license";

/**
 * Attivazione della licenza sulla postazione corrente.
 *
 *   npx tsx scripts/license-activate.ts status
 *   npx tsx scripts/license-activate.ts activate STAIANO-XXXXX-XXXXX-XXXXX-XXXXX
 *   npx tsx scripts/license-activate.ts deactivate
 *
 * Le variabili mancanti vengono lette da `.env.local`, come per `license:issue`.
 */
const readEnvFile = async () => {
  try {
    const file = resolve(".env.local");
    const { readFile } = await import("node:fs/promises");
    for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]])
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    return;
  }
};

await readEnvFile();

const [command = "status", key = ""] = process.argv.slice(2);

function report(status: Awaited<ReturnType<typeof licenseStatus>>) {
  console.log(
    `Stato:            ${status.state}${status.ok ? " (accesso consentito)" : " (accesso bloccato)"}`,
  );
  console.log(`Messaggio:        ${status.message || "-"}`);
  console.log(`Cliente:          ${status.customer ?? "-"}`);
  console.log(`Licenza:          ${status.licenseId ?? "-"}`);
  console.log(`Postazione:       ${status.machineId}`);
  console.log(`Server:           ${status.serverUrl || "non configurato"}`);
  console.log(`Controllo attivo: ${status.enforce ? "sì" : "no"}`);
  console.log(
    `Ultima verifica:  ${status.lastVerifiedAt ? new Date(status.lastVerifiedAt).toLocaleString("it-IT") : "mai"}`,
  );
}

if (command === "status") {
  const setup = await licenseSetup();
  report(await licenseStatus({ force: true }));
  console.log(`File locale:      ${setup.filePath}`);
} else if (command === "activate") {
  if (!key) {
    console.error("Uso: npx tsx scripts/license-activate.ts activate <chiave>");
    process.exit(1);
  }
  report(await activateLicense(key));
} else if (command === "deactivate") {
  report(await deactivateLicense());
} else {
  console.error("Comandi: status, activate <chiave>, deactivate");
  process.exit(1);
}
