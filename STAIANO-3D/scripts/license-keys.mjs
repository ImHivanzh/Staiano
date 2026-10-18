import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/** Genera la coppia Ed25519 del server licenze. */
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--force")) {
  console.error("Uso: node scripts/license-keys.mjs [--force]");
  process.exit(1);
}
const directory = resolve(process.env.LICENSE_KEYS_DIR || ".cache");
const privatePath = resolve(directory, "license-private.pem");
const publicPath = resolve(directory, "license-public.pem");
if (
  !args.includes("--force") &&
  (existsSync(privatePath) || existsSync(publicPath))
) {
  console.error(
    `Chiavi già presenti in ${directory}. Usare --force solo se si accetta di riemettere tutte le licenze.`,
  );
  process.exit(1);
}
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
mkdirSync(directory, { recursive: true, mode: 0o700 });
writeFileSync(
  privatePath,
  privateKey.export({ type: "pkcs8", format: "pem" }),
  {
    mode: 0o600,
  },
);
writeFileSync(publicPath, publicKey.export({ type: "spki", format: "pem" }), {
  mode: 0o600,
});
console.log(`Chiavi generate:
  privata  ${privatePath}   (segreto del Worker, non copiare nel repo)
  pubblica ${publicPath}    (usata dall'app locale per verificare i token)

Passi successivi
  1. Registra il segreto di firma sul Worker:
     Get-Content "${privatePath}" -Raw | npx --yes wrangler secret put LICENSE_PRIVATE_KEY -c license-server/wrangler.toml
  2. Token amministrativo per emettere le licenze:
     npx --yes wrangler secret put ADMIN_TOKEN -c license-server/wrangler.toml
  3. Configura il server locale:
     LICENSE_SERVER_URL=https://licenses.ivanbuonocore.dev
     LICENSE_PUBLIC_KEY_FILE=${publicPath}
     LICENSE_ENFORCE=1   (solo quando la licenza è attiva su questa postazione)
  4. Emetti la licenza:  npm run license:issue -- create --customer "Cliente"
     Attiva qui:          npm run license:activate -- activate STAIANO-XXXXX-XXXXX-XXXXX-XXXXX`);
