import { generateKeyPairSync } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";

const publicFile = "dossier-guide/public-key.json";
const privateFile = ".cache/dossier-private.pkcs8";
if (existsSync(publicFile) || existsSync(privateFile)) {
  if (!existsSync(publicFile) || !existsSync(privateFile))
    throw Error(
      "Coppia di chiavi incompleta. Recuperare la chiave mancante prima di procedere.",
    );
  console.log("Chiavi dossier già presenti: conservate senza rotazione.");
} else {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });
  await mkdir(".cache", { recursive: true });
  await writeFile(privateFile, privateKey.toString("base64"), {
    flag: "wx",
    mode: 0o600,
  });
  await writeFile(
    publicFile,
    JSON.stringify({ spki: publicKey.toString("base64") }, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(
    "Chiave pubblica generata. Chiave privata locale in .cache: caricarla come segreto DOSSIER_PRIVATE_KEY e conservarla per i QR già emessi.",
  );
}
