import { resolve } from "node:path";

/**
 * Amministrazione delle licenze tramite il Worker Cloudflare.
 *
 *   node scripts/license-issue.mjs create --customer "Cliente" [--plan standard] [--seats 1] [--notes "..."]
 *   node scripts/license-issue.mjs list
 *   node scripts/license-issue.mjs revoke <id>
 *   node scripts/license-issue.mjs restore <id>
 *   node scripts/license-issue.mjs release <id> --machine mch_...
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

const serverUrl = (process.env.LICENSE_SERVER_URL || "").replace(/\/+$/, "");
const adminToken = (process.env.LICENSE_ADMIN_TOKEN || "").trim();
if (!serverUrl || !adminToken) {
  console.error(
    "Servono LICENSE_SERVER_URL e LICENSE_ADMIN_TOKEN (anche in .env.local).",
  );
  process.exit(1);
}

const [command = "list", ...rest] = process.argv.slice(2);
const flag = (name, fallback = "") => {
  const index = rest.indexOf(`--${name}`);
  return index >= 0 ? (rest[index + 1] ?? fallback) : fallback;
};

async function call(path, init = {}) {
  const response = await fetch(`${serverUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(
      `Errore ${response.status}: ${body.message ?? "richiesta fallita"}`,
    );
    process.exit(1);
  }
  return body;
}

if (command === "create") {
  const customer = flag("customer");
  if (!customer) {
    console.error(
      'Uso: create --customer "Cliente" [--plan standard] [--seats 1]',
    );
    process.exit(1);
  }
  const result = await call("/admin/licenses", {
    method: "POST",
    body: JSON.stringify({
      customer,
      productId: flag("product", "staiano-hvac"),
      plan: flag("plan", "standard"),
      seats: Number(flag("seats", "1")),
      notes: flag("notes"),
    }),
  });
  console.log(`Licenza creata per ${result.license.customer} (${result.license.id})
  Chiave (mostrata una sola volta):
    ${result.key}
  Postazioni consentite: ${result.license.seats}`);
} else if (command === "list") {
  const result = await call("/admin/licenses", { method: "GET" });
  if (!result.licenses.length) console.log("Nessuna licenza emessa.");
  for (const license of result.licenses) {
    console.log(
      `${license.id}  ${license.status.toUpperCase().padEnd(8)} ${license.customer}  posti:${license.seats}`,
    );
    for (const activation of license.activations ?? [])
      console.log(
        `    ${activation.released_at ? "libera  " : "attiva  "} ${activation.machine_id}  ${activation.hostname ?? "-"}  ultima:${activation.last_seen}`,
      );
  }
} else if (["revoke", "restore"].includes(command)) {
  const id = rest[0];
  if (!id) {
    console.error(`Uso: ${command} <id>`);
    process.exit(1);
  }
  const result = await call(`/admin/licenses/${id}/${command}`, {
    method: "POST",
  });
  console.log(`${id}: ${result.status}`);
} else if (command === "release") {
  const id = rest[0],
    machineId = flag("machine");
  if (!id || !machineId) {
    console.error("Uso: release <id> --machine mch_...");
    process.exit(1);
  }
  const result = await call(`/admin/licenses/${id}/release`, {
    method: "POST",
    body: JSON.stringify({ machineId }),
  });
  console.log(`${result.id}: postazione ${result.machineId} liberata.`);
} else {
  console.error(
    "Comandi: create, list, revoke <id>, restore <id>, release <id> --machine mch_...",
  );
  process.exit(1);
}
