import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import type { Project } from "@/schemas/project";
import { installedTechnicalSheets } from "@/services/export/technical-sheets";
import { zipFiles } from "./zip";

let sourceIndex: Promise<Map<string, string>> | undefined;
async function archivedSources() {
  sourceIndex ??= (async () => {
    const root = resolve(process.cwd(), "catalog-data/sources");
    const entries = await readdir(root, { recursive: true });
    const index = new Map<string, string>();
    for (const name of entries) {
      if (!/\.(pdf|html|xlsx|xls)$/i.test(name)) continue;
      const path = resolve(root, name);
      const hash = createHash("sha256")
        .update(await readFile(path))
        .digest("hex");
      index.set(hash, path);
    }
    return index;
  })().catch((error) => {
    sourceIndex = undefined;
    throw error;
  });
  return sourceIndex;
}

export async function technicalSheetsArchive(project: Project) {
  const { documents, missing } = installedTechnicalSheets(project);
  const sources = await archivedSources();
  const files: { name: string; data: Buffer }[] = [];
  const index = [
    `Schede tecniche · ${project.name}`,
    "",
    "Documenti originali del produttore, nella versione usata dal catalogo.",
    "Un documento condiviso tra modelli compare una sola volta; le pagine indicano dove trovare i dati.",
    "",
  ];
  for (const sheet of documents) {
    const path = sources.get(sheet.source.sha256);
    if (!path) {
      missing.push(
        `${sheet.devices.join("; ")}: originale non archiviato. Fonte: ${sheet.source.sourceUrl}`,
      );
      continue;
    }
    const stem = basename(path, extname(path))
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 100);
    const name = `${sheet.source.manufacturer.replace(/[^a-zA-Z0-9_-]/g, "_")}-${stem}-${sheet.source.sha256.slice(0, 8)}${extname(path)}`;
    const data = await readFile(path);
    if (createHash("sha256").update(data).digest("hex") !== sheet.source.sha256)
      throw new Error(
        "Originale modificato: aggiornare il catalogo prima del download.",
      );
    files.push({ name, data });
    index.push(
      name,
      `Apparati: ${sheet.devices.join("; ")}`,
      `Pagine: ${sheet.pages.sort((a, b) => a - b).join(", ") || "vedere documento"}`,
      `Fonte: ${sheet.source.sourceUrl}`,
      `SHA256: ${sheet.source.sha256}`,
      "",
    );
  }
  index.push(
    "DOCUMENTI NON DISPONIBILI",
    ...(missing.length ? missing : ["Nessuno."]),
  );
  files.unshift({
    name: "INDICE-schede-tecniche.txt",
    data: Buffer.from(index.join("\r\n"), "utf8"),
  });
  return {
    archive: zipFiles(files),
    count: files.length - 1,
    missing: missing.length,
  };
}
