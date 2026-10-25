import type { Project } from "@/schemas/project";
import { radiatorCatalogAtVersion } from "@/domain/catalogs/radiators";
import { airTerminalCatalogAtVersion } from "@/domain/catalogs/air-terminals";
import { hvacCatalogAtVersion } from "@/domain/catalogs/hvac";
import { fanCoilCatalogAtVersion } from "@/domain/catalogs/fan-coils";
import { heatPumpCatalogAtVersion } from "@/domain/catalogs/heat-pumps";
import { splitCatalogAtVersion } from "@/domain/catalogs/splits";
import { vrvCatalogAtVersion } from "@/domain/catalogs/vrv";
type CatalogRequest = [{ preload(version: string): Promise<unknown> }, string];

/** Load only revisions referenced by installed objects, before synchronous geometry/calculation. */
export async function loadProjectCatalogs(project: Project): Promise<void> {
  const requests: CatalogRequest[] = [
    ...project.radiators.map((item): CatalogRequest => [
      radiatorCatalogAtVersion,
      item.catalogVersion,
    ]),
    ...project.airTerminals.map((item): CatalogRequest => [
      airTerminalCatalogAtVersion,
      item.catalogVersion,
    ]),
    ...(project.fanCoils ?? []).map((item): CatalogRequest => [
      fanCoilCatalogAtVersion,
      item.catalogVersion,
    ]),
    ...(project.hydronicSystems ?? []).map((item): CatalogRequest => [
      heatPumpCatalogAtVersion,
      item.catalogVersion,
    ]),
    ...project.hvacSystems
      .filter((item) => !item.fanCoilId)
      .map((item): CatalogRequest => [
        item.type === "vrv"
          ? vrvCatalogAtVersion
          : item.type === "split"
            ? splitCatalogAtVersion
            : hvacCatalogAtVersion,
        item.catalogVersion,
      ]),
  ];
  const unique = new Map<(typeof requests)[number][0], Set<string>>();
  for (const [catalog, version] of requests) {
    if (!unique.has(catalog)) unique.set(catalog, new Set());
    unique.get(catalog)!.add(version);
  }
  await Promise.all(
    [...unique].flatMap(([catalog, versions]) =>
      [...versions].map((version) => catalog.preload(version)),
    ),
  );
}
