import type { Project } from "@/schemas/project";
import type { z } from "zod";
import type { sourceMetadataSchema } from "@/domain/catalogs/radiator-schema";
import { radiatorProductAtVersion } from "@/domain/catalogs/radiators";
import { hvacProductAtVersion } from "@/domain/catalogs/hvac";
import {
  splitCombinationAtVersion,
  splitIndoorAtVersion,
} from "@/domain/catalogs/splits";
import {
  fanCoilProductAtVersion,
  fanCoilControlAtVersion,
} from "@/domain/catalogs/fan-coils";
import { heatPumpProductAtVersion } from "@/domain/catalogs/heat-pumps";
import { airTerminalCatalogAtVersion } from "@/domain/catalogs/air-terminals";
import { deviceCodes } from "./device-codes";

type Source = z.infer<typeof sourceMetadataSchema>;
export type TechnicalSheet = {
  source: Source;
  devices: string[];
  pages: number[];
};

/** Sources come from versioned server catalogs, never URLs supplied by the project. */
export function installedTechnicalSheets(project: Project) {
  const documents = new Map<string, TechnicalSheet>();
  const missing: string[] = [];
  const codes = deviceCodes(project);
  function add(id: string, label: string, source?: Source | null) {
    const device = `${codes.get(id) ?? id} · ${label}`;
    if (!source) {
      missing.push(
        `${device}: scheda non disponibile (modello manuale, su misura o catalogo storico assente).`,
      );
      return;
    }
    const sheet = documents.get(source.sha256) ?? {
      source,
      devices: [],
      pages: [],
    };
    if (!sheet.devices.includes(device)) sheet.devices.push(device);
    if (source.page && !sheet.pages.includes(source.page))
      sheet.pages.push(source.page);
    documents.set(source.sha256, sheet);
  }
  for (const item of project.radiators) {
    const product = radiatorProductAtVersion(
      item.productId,
      item.catalogVersion,
    );
    add(
      item.id,
      `${item.manufacturer} ${product?.model ?? item.family}`,
      product?.sourceMetadata,
    );
  }
  for (const system of project.hvacSystems) {
    if (system.genericMachine) {
      add(
        system.id,
        `${system.genericMachine.manufacturer} ${system.genericMachine.model}`,
      );
      continue;
    }
    if (system.type === "ducted") {
      const product = hvacProductAtVersion(
        system.productId,
        system.catalogVersion,
      );
      add(
        system.id,
        `${system.manufacturer} ${product?.indoorModel ?? system.productId}`,
        product?.sourceMetadata,
      );
      if (product?.dischargeConnection)
        add(
          system.id,
          "Disegno attacco macchina",
          product.dischargeConnection.sourceMetadata,
        );
    } else {
      const product = splitCombinationAtVersion(
        system.productId,
        system.catalogVersion,
      );
      add(
        system.id,
        `${system.manufacturer} ${product?.outdoorModel ?? system.productId}`,
        product?.sourceMetadata,
      );
      for (const source of product?.secondarySourceMetadata ?? [])
        add(system.id, "Abbinamento split", source);
      for (const unit of system.indoorUnits) {
        const indoor = splitIndoorAtVersion(
          unit.productId,
          system.catalogVersion,
        );
        add(
          unit.id,
          `${system.manufacturer} ${indoor?.model ?? unit.productId}`,
          indoor?.sourceMetadata,
        );
      }
    }
  }
  for (const unit of project.fanCoils ?? []) {
    const product = fanCoilProductAtVersion(
      unit.productId,
      unit.catalogVersion,
    );
    add(
      unit.id,
      `${product?.manufacturer ?? "Ventilconvettore"} ${product?.model ?? unit.productId}`,
      product?.sourceMetadata,
    );
    if (unit.controllerId) {
      const control = fanCoilControlAtVersion(
        unit.controllerId,
        unit.catalogVersion,
      );
      add(
        unit.id,
        `Comando ${control?.model ?? unit.controllerId}`,
        control?.sourceMetadata,
      );
    }
  }
  for (const system of project.hydronicSystems ?? []) {
    const product = heatPumpProductAtVersion(
      system.productId,
      system.catalogVersion,
    );
    add(
      system.outdoorUnit.id,
      `${product?.manufacturer ?? "Pompa di calore"} ${product?.model ?? system.productId}`,
      product?.sourceMetadata,
    );
  }
  for (const unit of project.airTerminals) {
    const family = airTerminalCatalogAtVersion(
      unit.catalogVersion,
    )?.families.find(
      (item) =>
        item.variants.some((variant) => variant.id === unit.productId) ||
        item.familyCode === unit.family,
    );
    add(
      unit.id,
      `Ecoclima ${family?.familyCode ?? unit.family}`,
      family?.sourceMetadata,
    );
  }
  for (const plenum of project.plenums)
    add(plenum.id, `Plenum ${plenum.model} su misura`);
  return { documents: [...documents.values()], missing };
}
