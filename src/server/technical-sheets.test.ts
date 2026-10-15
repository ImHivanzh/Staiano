import { readFileSync } from "node:fs";
import { crc32 } from "node:zlib";
import { expect, it } from "vitest";
import { parseProject } from "@/services/project/format";
import { installedTechnicalSheets } from "@/services/export/technical-sheets";
import { zipFiles } from "./zip";
import { technicalSheetsArchive } from "./technical-sheets";

function zipEntries(zip: Buffer) {
  const entries = new Map<string, Buffer>();
  let at = 0;
  while (zip.readUInt32LE(at) === 0x04034b50) {
    const size = zip.readUInt32LE(at + 18);
    const nameLength = zip.readUInt16LE(at + 26);
    const dataAt = at + 30 + nameLength;
    const name = zip.subarray(at + 30, dataAt).toString("utf8");
    const data = zip.subarray(dataAt, dataAt + size);
    expect(crc32(data)).toBe(zip.readUInt32LE(at + 14));
    entries.set(name, data);
    at = dataAt + size;
  }
  expect(zip.readUInt32LE(at)).toBe(0x02014b50);
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  expect(zip.readUInt32LE(end + 16)).toBe(at);
  expect(zip.readUInt16LE(end + 10)).toBe(entries.size);
  return entries;
}

it("writes ZIP entries with valid CRC, UTF8 names and central directory, rejecting unsafe paths", () => {
  const zip = zipFiles([
    { name: "scheda-è.txt", data: Buffer.from("123456789") },
  ]);
  expect(zipEntries(zip).get("scheda-è.txt")?.toString()).toBe("123456789");
  expect(zip.readUInt32LE(14)).toBe(0xcbf43926);
  expect(() =>
    zipFiles([{ name: "../secret.txt", data: Buffer.alloc(0) }]),
  ).toThrow("non valido");
});

it("archives installed originals once, preserves model associations and reports manual devices", async () => {
  const project = parseProject(
    JSON.parse(readFileSync("tests/fixtures/realistic-home.hvacproj", "utf8")),
  );
  const sources = installedTechnicalSheets(project);
  expect(
    new Set(sources.documents.map((sheet) => sheet.source.sha256)).size,
  ).toBe(sources.documents.length);
  expect(sources.documents.length).toBeGreaterThan(0);
  const result = await technicalSheetsArchive(project);
  const entries = zipEntries(result.archive);
  expect(entries.size).toBe(result.count + 1);
  const index = entries.get("INDICE-schede-tecniche.txt")!.toString();
  expect(index).toContain(project.name);
  expect(index).toContain("SHA256:");
  expect(index).toContain("Fonte: https://");
  for (const item of project.radiators)
    expect(index).toContain(item.manufacturer);
  expect(result.count).toBeGreaterThan(0);
}, 60000);
