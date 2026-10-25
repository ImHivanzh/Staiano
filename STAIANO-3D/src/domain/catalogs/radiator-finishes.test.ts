import { resolve } from "node:path";
import { expect, it } from "vitest";
import {
  archivedDocument,
  reportUnarchived,
  sha256File,
} from "./archived-sources";
import {
  getRadiatorFinishOptions,
  isRadiatorFinishSupported,
  radiatorFinishCatalog,
  resolveRadiatorFinish,
  resolveInstalledRadiatorFinish,
  radiatorFinishes,
  genericRadiatorAccessoryFinishes,
} from "./radiator-finishes";

it("has finite manufacturer palettes with archived source hashes", () => {
  expect(
    new Set(radiatorFinishCatalog.finishes.map((finish) => finish.manufacturer))
      .size,
  ).toBe(4);
  const unarchived: string[] = [];
  for (const source of radiatorFinishCatalog.sources) {
    const archived = archivedDocument(source.sha256, resolve(source.localPath));
    if (archived) expect(sha256File(archived), source.id).toBe(source.sha256);
    else unarchived.push(source.id);
  }
  reportUnarchived(unarchived);
});

it("offers generic white and chrome only for valves and lockshields, regardless of manufacturer", () => {
  expect(genericRadiatorAccessoryFinishes.map((finish) => finish.id)).toEqual([
    "generic-white",
    "generic-chrome",
  ]);
  for (const manufacturer of ["Lazzarini", "Unknown"]) {
    for (const finish of genericRadiatorAccessoryFinishes) {
      const item = {
        manufacturer,
        family: "Empoli antracite",
        finishes: {
          bodyColorId: finish.id,
          valveColorId: finish.id,
          lockshieldColorId: finish.id,
          pipeCoverColorId: finish.id,
        },
      };
      expect(resolveInstalledRadiatorFinish(item, "valve")).toBe(finish);
      expect(resolveInstalledRadiatorFinish(item, "lockshield")).toBe(finish);
      expect(resolveInstalledRadiatorFinish(item, "body")).toBeNull();
      expect(resolveInstalledRadiatorFinish(item, "pipeCover")).toBeNull();
      expect(
        isRadiatorFinishSupported(
          manufacturer,
          item.family,
          "valve",
          finish.id,
        ),
      ).toBe(false);
      expect(finish.sourceUrl).toBeUndefined();
    }
  }
});

it("matches automatic valves and lockshields to every non-metal body colour without changing catalog availability", () => {
  for (const family of radiatorFinishCatalog.families) {
    for (const body of getRadiatorFinishOptions(
      family.manufacturer,
      family.id,
      "body",
    )) {
      if (body.kind === "metal") continue;
      const item = {
        manufacturer: family.manufacturer,
        family: family.id,
        finishes: { bodyColorId: body.id },
      };
      for (const role of ["valve", "lockshield"] as const) {
        const finish = resolveInstalledRadiatorFinish(item, role)!;
        expect(finish.colorHex, `${family.id}/${body.id}/${role}`).toBe(
          body.colorHex,
        );
        expect(finish.kind).toBe(body.kind);
        expect(radiatorFinishes).toContain(finish);
      }
    }
  }
});

it("matches factory coloured radiators without saved finishes and preserves explicit accessory choices", () => {
  const item = { manufacturer: "Lazzarini", family: "Empoli antracite" };
  expect(resolveInstalledRadiatorFinish(item, "valve")?.id).toBe(
    "lazzarini-vov12",
  );
  expect(resolveInstalledRadiatorFinish(item, "lockshield")?.id).toBe(
    "lazzarini-vov12",
  );
  const chrome = getRadiatorFinishOptions(
    item.manufacturer,
    item.family,
    "valve",
  ).find((f) => f.kind === "metal")!;
  expect(
    resolveInstalledRadiatorFinish(
      { ...item, finishes: { valveColorId: chrome.id } },
      "valve",
    ),
  ).toBe(chrome);
  expect(
    resolveInstalledRadiatorFinish(
      { ...item, finishes: { valveColorId: "unknown" } },
      "valve",
    ),
  ).toBeNull();
  expect(
    isRadiatorFinishSupported(
      item.manufacturer,
      item.family,
      "valve",
      "lazzarini-vov12",
    ),
  ).toBe(false);
});

it("keeps metallic bodies, pipe covers and unknown families on their documented defaults", () => {
  const item = { manufacturer: "Lazzarini", family: "Empoli cromato" };
  expect(resolveInstalledRadiatorFinish(item, "valve")).toBe(
    resolveRadiatorFinish(item.manufacturer, item.family, "valve"),
  );
  expect(
    resolveInstalledRadiatorFinish(
      { ...item, family: "Empoli antracite" },
      "pipeCover",
    ),
  ).toBeNull();
  expect(
    resolveInstalledRadiatorFinish(
      { manufacturer: "Unknown", family: "Unknown" },
      "valve",
    ),
  ).toBeNull();
});

it("restricts Lisa 22 imported white models to documented R01/R02", () => {
  expect(
    getRadiatorFinishOptions("Cordivari", "Lisa 22", "body").map(
      (finish) => finish.code,
    ),
  ).toEqual(["R01", "R02"]);
  expect(
    isRadiatorFinishSupported("Cordivari", "Lisa 22", "valve", "cordivari-f28"),
  ).toBe(false);
});

it("does not turn a painted Lazzarini model into a chrome thermal variant", () => {
  expect(
    getRadiatorFinishOptions("Lazzarini", "Sanremo cromato dritto", "body").map(
      (finish) => finish.id,
    ),
  ).toEqual(["lazzarini-chrome"]);
  expect(
    isRadiatorFinishSupported(
      "Lazzarini",
      "Sanremo bianco dritto",
      "body",
      "lazzarini-chrome",
    ),
  ).toBe(false);
  expect(
    getRadiatorFinishOptions("Lazzarini", "Empoli antracite", "body").map(
      (finish) => finish.id,
    ),
  ).toEqual(["lazzarini-vov12"]);
});

it("keeps pipe covers separate from radiator and valve colour palettes", () => {
  expect(
    getRadiatorFinishOptions(
      "Zehnder",
      "Nova Easy verticale ZNV",
      "pipeCover",
    ).map((finish) => finish.id),
  ).toEqual(["zehnder-chrome", "zehnder-brushed-inox"]);
  expect(
    getRadiatorFinishOptions("Lazzarini", "Garda bianco", "pipeCover"),
  ).toEqual([]);
  expect(isRadiatorFinishSupported("Global", "VIP", "body", "global-99")).toBe(
    false,
  );
  expect(
    isRadiatorFinishSupported("Global", "VIP", "pipeCover", "global-99"),
  ).toBe(true);
});

it("resolves missing values to official defaults but preserves unsupported selection as unresolved", () => {
  expect(
    resolveRadiatorFinish("Zehnder", "Charleston 3 colonne", "body")?.id,
  ).toBe("zehnder-9016");
  expect(
    resolveRadiatorFinish(
      "Zehnder",
      "Charleston 3 colonne",
      "body",
      "cordivari-r01",
    ),
  ).toBeNull();
  expect(resolveRadiatorFinish("Unknown", "Unknown", "body")).toBeNull();
  expect(
    resolveRadiatorFinish("Lazzarini", "Garda bianco", "pipeCover"),
  ).toBeNull();
});

it("keeps F28 transparent exclusive to Ardesia bodies", () => {
  expect(
    isRadiatorFinishSupported(
      "Cordivari",
      "Ardesia 3 colonne",
      "body",
      "cordivari-f28",
    ),
  ).toBe(true);
  expect(
    isRadiatorFinishSupported("Cordivari", "Claudia", "body", "cordivari-f28"),
  ).toBe(false);
  expect(
    isRadiatorFinishSupported(
      "Cordivari",
      "Ardesia 3 colonne",
      "valve",
      "cordivari-f28",
    ),
  ).toBe(false);
});
