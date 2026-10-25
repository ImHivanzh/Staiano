import type { Project } from "@/schemas/project";
import { projectSchema } from "@/schemas/project";
import { validateProject } from "@/domain/validation";
import { radiatorProductAtVersion } from "@/domain/catalogs/radiators";
import {
  resolveInstalledRadiatorFinish,
  isRadiatorFinishSupported,
} from "@/domain/catalogs/radiator-finishes";
import { airTerminalFamilyAtVersion } from "@/domain/catalogs/air-terminals";
import {
  hvacProductAtVersion,
  hvacDischargeConnection,
} from "@/domain/catalogs/hvac";
import {
  fanCoilProductAtVersion,
  fanCoilControlAtVersion,
  controllerBoardFor,
  fanCoilDefaultPanelType,
  fanCoilInstallationAccessories,
} from "@/domain/catalogs/fan-coils";
import {
  heatPumpProductAtVersion,
  heatPumpCapacity,
} from "@/domain/catalogs/heat-pumps";
import type { z } from "zod";
import type { sourceMetadataSchema } from "@/domain/catalogs/radiator-schema";
import { deviceCodes } from "@/services/export/device-codes";
import { airTerminalModelDescription } from "@/domain/air-terminals/description";
import { systemLinearBalances } from "@/domain/air-terminals/linear-meters";
import { airTerminalFaceWidthMm } from "@/domain/air-terminals/geometry";
import {
  splitCombinationAtVersion,
  splitIndoorAtVersion,
} from "@/domain/catalogs/splits";
import { vrvIndoorAtVersion, vrvOutdoorAtVersion } from "@/domain/catalogs/vrv";
import { hvacOutdoorDimensions } from "@/domain/air-conditioning/outdoor";
import { terminalDataQuality } from "@/domain/air-terminals/data-quality";
import { calculateEcoclimaBom } from "@/domain/air-terminals/commercial-bom";

export const TECHNICAL_NOTE =
  "Dimensionamento convenzionale preliminare: Q = volume netto x coefficiente termico scelto nel progetto (W/m³). Non sostituisce un calcolo delle dispersioni dell'edificio o un progetto esecutivo. Il fabbisogno indicato deve essere verificato da un tecnico qualificato prima dell’esecuzione dell’impianto. Il coefficiente scelto non determina automaticamente clima, involucro, ricambi d'aria, apporti solari e condizioni di esercizio. Potenze e portate provengono dai cataloghi indicati; verificare condizioni nominali, installazione e disponibilità commerciale prima dell'ordine. I prezzi di listino Ecoclima, quando riportati, sono separati dal dimensionamento tecnico.";
type Source = z.infer<typeof sourceMetadataSchema>;
const display = (value: number) =>
  value.toLocaleString("it-IT", { maximumFractionDigits: 2 });
export type MaterialRow = {
  description: string;
  quantity: number;
  /** Unita di misura della quantita ordinabile (elementi, pezzi, kit, metri). */
  unit: string;
  /** Dimensioni pubblicate dal catalogo, in millimetri; vuoto quando assenti. */
  dimensions?: string;
  details: string;
  codes: string[];
  locales: string[];
  /** Apparecchi raggruppati dalla stessa riga. */
  pieces: number;
  /** Unita di `pieces` quando l'unita di ordine e diversa (radiatori: batterie ed elementi). */
  pieceUnit?: string;
};
export function buildDossier(project: Project) {
  const p = projectSchema.parse(project),
    codes = deviceCodes(p);
  const roomIdsByCode = new Map<string, string[]>();
  const assignRooms = (id: string, roomIds: string[]) => {
    const code = codes.get(id);
    if (code) roomIdsByCode.set(code, roomIds);
  };
  for (const system of p.hvacSystems) {
    assignRooms(system.id, system.roomIds);
    for (const unit of system.indoorUnits) assignRooms(unit.id, [unit.roomId]);
  }
  for (const system of p.hydronicSystems ?? [])
    assignRooms(system.id, system.roomIds);
  for (const device of [
    ...p.radiators,
    ...p.airTerminals,
    ...(p.fanCoils ?? []),
  ])
    assignRooms(device.id, [device.roomId]);
  const localesByCode = new Map(
    [...roomIdsByCode].map(([code, roomIds]) => {
      const roomSet = new Set(roomIds);
      return [
        code,
        p.rooms.filter((room) => roomSet.has(room.id)).map((room) => room.name),
      ];
    }),
  );
  const sources = new Map<string, Source>(),
    unresolved: string[] = [];
  const addSource = (s: Source | undefined | null, description: string) => {
    if (s) sources.set(`${s.sha256}:${s.page}`, s);
    else unresolved.push(description);
  };
  const materialMap = new Map<string, MaterialRow>(),
    accessoryMap = new Map<string, MaterialRow>();
  const collect =
    (target: Map<string, MaterialRow>) =>
    (
      key: string,
      row: Omit<MaterialRow, "quantity" | "codes" | "locales" | "pieces">,
      code: string,
      step = 1,
    ) => {
      const locales = localesByCode.get(code) ?? [];
      const existing = target.get(key);
      if (existing) {
        existing.quantity += step;
        existing.pieces++;
        existing.codes.push(code);
        existing.locales = [...new Set([...existing.locales, ...locales])];
      } else
        target.set(key, {
          ...row,
          quantity: step,
          pieces: 1,
          codes: [code],
          locales,
        });
    };
  const material = collect(materialMap),
    accessoryMaterial = collect(accessoryMap);
  for (const d of p.radiators) {
    const product = radiatorProductAtVersion(d.productId, d.catalogVersion),
      code = codes.get(d.id)!,
      model = `${d.manufacturer} ${product?.model ?? d.family}`;
    addSource(
      product?.sourceMetadata,
      `${code}: catalogo radiatori ${d.catalogVersion} non disponibile`,
    );
    const sectional = product?.construction !== "fixed";
    material(
      `rad:${d.productId}:${d.elements}:${d.deltaTK}`,
      {
        description: model,
        unit: sectional ? "elementi" : "pezzi",
        ...(sectional ? { pieceUnit: "batterie" } : {}),
        dimensions: `${display(d.widthMm)} x ${display(d.heightMm)} x ${display(d.depthMm)} mm`,
        details: `${sectional ? `Batteria da ${d.elements} elementi; ` : ""}DT ${display(d.deltaTK)} K; ${display(d.outputW)} W`,
      },
      code,
      sectional ? d.elements : 1,
    );
    const accessory = (
      key: string,
      description: string,
      unit: string,
      details: string,
    ) =>
      accessoryMaterial(
        `rad-accessorio:${key}:${d.productId}`,
        { description, unit, details },
        code,
      );
    accessory(
      "staffe",
      `Staffe di sostegno ${model}`,
      "kit",
      "Fissaggio a muro: numero di staffe e inclusione nella confezione da verificare sul catalogo del produttore.",
    );
    for (const { role, noun, unit } of [
      { role: "valve", noun: "Valvola", unit: "pezzi" },
      {
        role: "lockshield",
        noun: "Detentore",
        unit: "pezzi",
      },
      {
        role: "pipeCover",
        noun: "Kit copritubo",
        unit: "kit",
      },
    ] as const) {
      const finish = resolveInstalledRadiatorFinish(d, role);
      const documented =
        finish &&
        isRadiatorFinishSupported(d.manufacturer, d.family, role, finish.id);
      accessory(
        `${role}:${finish?.id ?? "non-documentata"}`,
        `${noun} ${model}`,
        unit,
        finish
          ? `Finitura ${finish.label}${finish.ralCode ? `, RAL ${finish.ralCode}` : ""}; ${!finish.sourceUrl ? "finitura generica" : documented ? "scelta grafica separata dalla vendita" : "in tinta corpo, disponibilità della finitura accessorio da verificare"}, codice articolo da verificare sul listino del produttore.`
          : "Finitura non documentata per questo modello; disponibilita e codice articolo da verificare sul catalogo del produttore.",
      );
    }
  }
  for (const d of p.airTerminals) {
    const family = airTerminalFamilyAtVersion(d.family, d.catalogVersion);
    addSource(
      family?.sourceMetadata,
      `${codes.get(d.id)}: catalogo terminali ${d.catalogVersion} non disponibile`,
    );
    material(
      `air:${d.productId}:${airTerminalFaceWidthMm(d)}:${d.heightMm}:${d.use}:${d.availableAirflowM3h}`,
      {
        description: `Ecoclima ${airTerminalModelDescription(family, d.productId, d.commercialOptions?.profileCode)} - ${d.use === "supply" ? "mandata" : "ripresa"}`,
        unit: "pezzi",
        dimensions: `Faccia ${display(airTerminalFaceWidthMm(d))} x ${display(d.heightMm)} mm; profondità ${d.depthMm === null ? "non pubblicata" : display(d.depthMm) + " mm"}`,
        details: `${display(d.availableAirflowM3h)} m³/h per unità`,
      },
      codes.get(d.id)!,
    );
  }
  for (const s of p.hvacSystems) {
    // La macchina è già nella riga del ventilconvettore; plenum, percorsi e
    // bilanci hanno sezioni dedicate nel PDF.
    if (s.fanCoilId) continue;
    const outdoorDimensions = hvacOutdoorDimensions(s);
    const product = hvacProductAtVersion(s.productId, s.catalogVersion);
    const combination =
      s.type === "split"
        ? splitCombinationAtVersion(s.productId, s.catalogVersion)
        : null;
    const vrvOutdoor =
      s.type === "vrv"
        ? vrvOutdoorAtVersion(s.productId, s.catalogVersion)
        : null;
    addSource(
      product?.sourceMetadata ??
        vrvOutdoor?.sourceMetadata ??
        combination?.sourceMetadata,
      `${codes.get(s.id)}: catalogo HVAC ${s.catalogVersion} non disponibile`,
    );
    const inletSource =
      s.type === "ducted" && !s.genericMachine
        ? hvacDischargeConnection(product)?.sourceMetadata
        : null;
    if (inletSource) addSource(inletSource, "");
    combination?.secondarySourceMetadata.forEach((source) =>
      addSource(source, ""),
    );
    if (outdoorDimensions?.sourceMetadata)
      addSource(outdoorDimensions.sourceMetadata, "");
    material(
      `hvac:${s.productId}`,
      {
        description: `${s.manufacturer} ${s.genericMachine?.model ?? (vrvOutdoor ? vrvOutdoor.model : combination ? combination.outdoorModel : (product?.indoorModel ?? s.productId))}`,
        unit: "sistemi",
        dimensions: s.outdoorUnit
          ? `Unità esterna L × H × P: ${s.outdoorUnit.widthMm} × ${s.outdoorUnit.heightMm} × ${s.outdoorUnit.depthMm} mm`
          : undefined,
        details: `Unità esterna: ${product?.outdoorModel ?? vrvOutdoor?.model ?? combination?.outdoorModel ?? "non dichiarata"}; ${s.type === "ducted" ? "canalizzato" : s.type === "vrv" ? "VRV/VRF" : (combination?.mode ?? "split")}; ${s.capacityW === null ? "potenza non dichiarata" : `${s.capacityW} W`}${s.airflowM3h !== null ? `; ${s.airflowM3h} m³/h massimi` : ""}${s.genericMachine ? "; dati inseriti dall’operatore" : ""}${s.type === "split" && s.outdoorUnit && outdoorDimensions?.dimensionStatus !== "published" ? "; ingombro esterno indicativo, misure e distanze di servizio da verificare sul disegno del produttore" : ""}`,
      },
      codes.get(s.id)!,
    );
    for (const d of s.indoorUnits) {
      const indoor = hvacProductAtVersion(d.productId, d.catalogVersion);
      const splitIndoor = splitIndoorAtVersion(d.productId, d.catalogVersion);
      const vrvIndoor = vrvIndoorAtVersion(d.productId, d.catalogVersion);
      addSource(
        indoor?.sourceMetadata ??
          vrvIndoor?.sourceMetadata ??
          splitIndoor?.sourceMetadata,
        `${codes.get(d.id)}: fonte unità interna non disponibile`,
      );
      material(
        `indoor:${d.productId}`,
        {
          description: `${s.manufacturer} ${indoor?.indoorModel ?? vrvIndoor?.model ?? splitIndoor?.model ?? d.productId} - unità interna`,
          unit: "pezzi",
          dimensions: `${d.widthMm} x ${d.heightMm} x ${d.depthMm} mm`,
          details: `Inclusa nel sistema ${codes.get(s.id)}`,
        },
        codes.get(d.id)!,
      );
    }
  }
  for (const unit of p.fanCoils ?? []) {
    const product = fanCoilProductAtVersion(
      unit.productId,
      unit.catalogVersion,
    );
    const point = product?.operatingPoints[unit.operatingPointIndex];
    const control = unit.controllerId
      ? fanCoilControlAtVersion(unit.controllerId, unit.catalogVersion)
      : null;
    const code = codes.get(unit.id)!;
    addSource(
      product?.sourceMetadata,
      `${code}: catalogo ventilconvettori ${unit.catalogVersion} non disponibile`,
    );
    if (unit.mounting === "ceiling" && product?.ceilingInstallation)
      addSource(product.ceilingInstallation.sourceMetadata, "");
    material(
      `fan-coil:${unit.productId}:${unit.catalogVersion}:${unit.operatingPointIndex}:${unit.mounting}`,
      {
        description: product
          ? `${product.manufacturer} ${product.family} ${product.model}`
          : unit.productId,
        unit: "pezzi",
        dimensions: `${unit.widthMm} x ${unit.heightMm} x ${unit.depthMm} mm`,
        details: `${unit.mounting === "wall" ? "parete" : "soffitto"}; ${point ? `${display(point.coolingW)} W freddo / ${display(point.heatingW)} W caldo; ${point.label}` : "punto operativo non verificabile"}; geometria 3D orientativa: corpo e griglie schematici; verificare attacchi e spazi di manutenzione sulla scheda ufficiale${unit.mounting === "ceiling" && product?.ceilingInstallation ? `; ${product.ceilingInstallation.note}` : ""}`,
      },
      code,
    );
    if (product)
      for (const accessory of fanCoilInstallationAccessories(
        product,
        unit.mounting,
        unit.panelType ?? fanCoilDefaultPanelType(product, unit.mounting),
        unit.coverType,
      ))
        accessoryMaterial(
          `fan-coil-accessory:${accessory.code || accessory.description}`,
          {
            description: accessory.description,
            unit: "pezzi",
            details: accessory.code
              ? `Codice produttore ${accessory.code}; accessorio da ordinare separatamente; prezzo non presente nei dati di catalogo.`
              : "Pannello previsto dal manuale per la configurazione a griglie; da realizzare in cantiere, senza codice o prezzo di listino.",
          },
          code,
        );
    if (unit.controllerId) {
      addSource(
        control?.sourceMetadata,
        `${code}: comando ${unit.controllerId} non disponibile nella revisione ${unit.catalogVersion}`,
      );
      const expectedBoard =
        product && control ? controllerBoardFor(product, control) : null;
      material(
        `fan-coil-control:${unit.controllerId}:${unit.catalogVersion}:${unit.controllerBoard}`,
        {
          description: control
            ? `${control.manufacturer} ${control.series} ${control.model} - comando originale`
            : `Comando ${unit.controllerId}`,
          unit: "pezzi",
          details: `Associato a ${code}; scheda salvata ${unit.controllerBoard ?? "non scelta"}; ${expectedBoard && unit.controllerBoard === expectedBoard ? "abbinamento documentato" : "abbinamento da verificare"}`,
        },
        code,
      );
      if (expectedBoard)
        accessoryMaterial(
          `fan-coil-board:${expectedBoard}`,
          {
            description: `Scheda interfaccia comando Innova ${expectedBoard}`,
            unit: "pezzi",
            details: `Scheda richiesta per il comando ${control?.model ?? unit.controllerId}; codice produttore ${expectedBoard}; verificare inclusione nella fornitura prima dell'ordine.`,
          },
          code,
        );
    }
  }
  for (const system of p.hydronicSystems ?? []) {
    const product = heatPumpProductAtVersion(
      system.productId,
      system.catalogVersion,
    );
    const point = product?.operatingPoints[system.operatingPointIndex];
    const capacity = point && heatPumpCapacity(point);
    addSource(
      product?.sourceMetadata,
      `${codes.get(system.id)}: catalogo pompe di calore ${system.catalogVersion} non disponibile`,
    );
    material(
      `hydronic:${system.productId}:${system.catalogVersion}:${system.operatingPointIndex}`,
      {
        description: product
          ? `${product.manufacturer} ${product.family} ${product.model} - pompa di calore`
          : system.productId,
        unit: "pezzi",
        dimensions: `${system.outdoorUnit.widthMm} x ${system.outdoorUnit.heightMm} x ${system.outdoorUnit.depthMm} mm`,
        details: `${point && capacity ? `${display(capacity.heatingW)} W caldo / ${display(capacity.coolingW)} W freddo; potenze ${capacity.basis}; ${point.label}` : "punto operativo non verificabile"}; ventilconvettori ${system.fanCoilIds.map((id) => codes.get(id) ?? id).join(", ") || "nessuno collegato"}`,
      },
      codes.get(system.id)!,
    );
  }
  const openingIds = new Set(p.openings.map((opening) => opening.id));
  const commercialBom = calculateEcoclimaBom(p);
  return {
    project: p,
    codes,
    sources: [...sources.values()],
    unresolved,
    dataQuality: p.airTerminals.map((terminal) => ({
      code: codes.get(terminal.id) ?? terminal.family,
      ...terminalDataQuality(p, terminal, commercialBom),
    })),
    materials: [...materialMap.values()],
    accessories: [...accessoryMap.values()],
    checks: validateProject(p).filter(
      (check) => !openingIds.has(check.openingId ?? check.entityId ?? ""),
    ),
    linearBalances: p.hvacSystems
      .filter((s) => s.type === "ducted")
      .flatMap((s) =>
        systemLinearBalances(p, s.id).map((b) => ({ ...b, systemId: s.id })),
      ),
    provisionalRooms: p.rooms.filter((r) => r.geometryStatus === "unresolved"),
    totals: p.rooms
      .filter((r) => r.geometryStatus === "closed")
      .reduce(
        (a, r) => ({
          areaM2: a.areaM2 + r.netAreaM2,
          volumeM3: a.volumeM3 + r.volumeM3,
          loadW: a.loadW + r.designLoadW,
        }),
        { areaM2: 0, volumeM3: 0, loadW: 0 },
      ),
  };
}
