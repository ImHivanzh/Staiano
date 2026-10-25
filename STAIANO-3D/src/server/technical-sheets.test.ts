import { readFileSync } from "node:fs";
import { crc32 } from "node:zlib";
import { expect, it } from "vitest";
import { parseProject } from "@/services/project/format";
import { installedTechnicalSheets } from "@/services/export/technical-sheets";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
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

it("archives the supporting EGA50 dimension drawing with the product sheet", async () => {
  const project = parseProject(
    JSON.parse(readFileSync("tests/fixtures/realistic-home.hvacproj", "utf8")),
  );
  Object.assign(project.airTerminals[0], {
    family: "EGA50-3F",
    productId: "ecoclima-ega50-3f-400x400",
    catalogVersion: airTerminalCatalog.version,
  });
  const sources = installedTechnicalSheets(project),
    dimensionSource = sources.documents.find(
      (item) =>
        item.source.sha256 ===
        "a0cf28881ef67e23e097c2bfafc0fd16b1da64b0a96880c51e3cf0a27610ab69",
    );
  expect(dimensionSource?.pages).toEqual([2]);
  expect(dimensionSource?.devices[0]).toContain("EGA50-3F · dimensioni");
  const archive = await technicalSheetsArchive(project),
    entries = zipEntries(archive.archive),
    name = [...entries.keys()].find((item) => item.includes("a0cf2888"));
  expect(name).toBeTruthy();
  expect(entries.get(name!)?.subarray(0, 4).toString("ascii")).toBe("%PDF");
});

it("includes EDE1/EDE2/EBL/EBLR/EBLS/EDFL/EGQIF sheets in the installed-source index", () => {
  const project = parseProject(
    JSON.parse(readFileSync("tests/fixtures/realistic-home.hvacproj", "utf8")),
  );
  for (const [family, productId, sha256] of [
    [
      "EDE1",
      "ecoclima-ede1-500",
      "ecde224abcbbf1e5764abbe0978095dc11c564213f80ef6859f071e93758bdc4",
    ],
    [
      "EDE2",
      "ecoclima-ede2-500",
      "f5631aba5cb141faa48d5f00232c9adf75de5576c13b09531c5f341e6a68d81d",
    ],
    [
      "EBL",
      "ecoclima-ebl-600x75",
      "5aa95558b04cc846c696e614882064a16ad0b206847df952833f5174472b78c1",
    ],
    [
      "EBLR",
      "ecoclima-eblr-600x150",
      "f0bf526a43dbc149be6f6a9d90fd4a05619ec9bec44edea9fda31df8dbb0b4a6",
    ],
    [
      "EBLS",
      "ecoclima-ebls-600x150",
      "901589d35c04c42902d55de9415fbb75ebbf36c42a5b76a0c3ac2683058eaa0b",
    ],
    [
      "EDFL-20",
      "ecoclima-edfl-20-1f",
      "273a781cdc0ba9cb6bbebc0a3688b60ac02a75c9b954c34b3efc84609a492afe",
    ],
    [
      "EGQIF",
      "ecoclima-egqif-400x75",
      "bc9d957a6b1388eaf7ef7789fbf70c426003dd47bb081d34502003f81b0bb778",
    ],
    [
      "EGA50",
      "ecoclima-ega50-400x400",
      "c8e8d018b03bae40c60b2ee417f80b940a69391af0514d72cc218bb50555ed5e",
    ],
    [
      "EGZ50",
      "ecoclima-egz50-400x400",
      "45b6aa4dbccfc9769a5b3bf76c81646cb401b7c8d5f7e681fd3061ae46be9f15",
    ],
    [
      "EGZ100",
      "ecoclima-egz100-600x600",
      "043d30f7bfb505cf4fe343b5e14f5b079f72a783ed5cc18dde7fd1a16c3c86f4",
    ],
  ]) {
    Object.assign(project.airTerminals[0], {
      family,
      productId,
      catalogVersion: airTerminalCatalog.version,
    });
    const source = installedTechnicalSheets(project).documents.find(
      (item) => item.source.sha256 === sha256,
    );
    expect(source?.devices[0]).toContain(`${family} · dimensioni`);
    expect(source?.source.sourceType).toBe("pdf");
  }
});

it("keeps the EGA50-3S embedded front drawing in the installed-source index", () => {
  const project = parseProject(
    JSON.parse(readFileSync("tests/fixtures/realistic-home.hvacproj", "utf8")),
  );
  Object.assign(project.airTerminals[0], {
    family: "EGA50-3S",
    productId: "ecoclima-ega50-3s-400x400",
    catalogVersion: airTerminalCatalog.version,
  });
  const source = installedTechnicalSheets(project).documents.find(
    (item) =>
      item.source.sha256 ===
      "1b86a0131e4ca270ea0c4cccd29b8b82b92359a92867c2796714794a68544420",
  );
  expect(
    source?.devices.some((device) => device.includes("EGA50-3S · dimensioni")),
  ).toBe(true);
  expect(source?.source.sourceType).toBe("html");
});
