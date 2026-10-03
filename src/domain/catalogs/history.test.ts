import { expect, it } from "vitest";
import { createProject, addRectangle } from "@/domain/project";
import { applyDuctedSystem, ductedRoomAllocation } from "@/domain/ducted/apply";
import { applyAirTerminalSolution } from "@/domain/air-terminals/apply";
import { sizeAirTerminal } from "@/domain/air-terminals/size";
import { validateProject } from "@/domain/validation";
import {
  airTerminalCatalog,
  airTerminalCatalogAtVersion,
} from "./air-terminals";
import {
  radiatorCatalogAtVersion,
  radiatorCatalogs,
  radiatorProductAtVersion,
} from "./radiators";

it("never validates a stored terminal against a different catalog revision", () => {
  let project = createProject();
  project = addRectangle(project, project.floors[0].id, {
    width: 4.2,
    length: 3.8,
    height: 2.7,
    name: "Camera",
  });
  const room = project.rooms[0];
  project = applyDuctedSystem(project, [room.id], "Mitsubishi Electric", null);
  const allocation = ductedRoomAllocation(project, room.id)!;
  const family = airTerminalCatalog.families.find(
    (f) => f.familyCode === "EDLS",
  )!;
  const solution = sizeAirTerminal(
    allocation.airflowM3h,
    1,
    family,
    "supply",
  )[0];
  project = applyAirTerminalSolution(
    project,
    room.id,
    allocation.system.id,
    "supply",
    "EDLS",
    solution,
    "ceiling",
  );
  expect(
    validateProject(project).find((c) => c.code === "terminalCatalog")?.status,
  ).toBe("valid");
  project.airTerminals[0].catalogVersion = "unavailable-history-version";
  expect(
    validateProject(project).find((c) => c.code === "terminalCatalog")?.status,
  ).toBe("invalid");
  expect(
    validateProject(project).find((c) => c.code === "terminalCapacity")?.status,
  ).toBe("invalid");
  expect(airTerminalCatalogAtVersion("unavailable-history-version")).toBeNull();
});

it("resolves exact manufacturer revision and preserves unavailable history", () => {
  for (const catalog of radiatorCatalogs) {
    const product = catalog.products[0];
    expect(radiatorCatalogAtVersion(catalog.version)?.manufacturer).toBe(
      catalog.manufacturer,
    );
    expect(radiatorProductAtVersion(product.id, catalog.version)).toEqual(
      product,
    );
    expect(
      radiatorProductAtVersion(product.id, "unavailable-version"),
    ).toBeNull();
  }
});
