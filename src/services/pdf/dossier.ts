import type { Project } from "@/schemas/project";
import { projectSchema } from "@/schemas/project";
import { validateProject } from "@/domain/validation";
import { radiatorProductAtVersion } from "@/domain/catalogs/radiators";
import { airTerminalFamilyAtVersion } from "@/domain/catalogs/air-terminals";
import { hvacProductAtVersion } from "@/domain/catalogs/hvac";
import type { z } from "zod";
import type { sourceMetadataSchema } from "@/domain/catalogs/radiator-schema";
import { deviceCodes } from "@/services/export/device-codes";
import { airTerminalModelDescription } from "@/domain/air-terminals/description";
import {
  splitCombinationAtVersion,
  splitIndoorAtVersion,
} from "@/domain/catalogs/splits";

export const TECHNICAL_NOTE =
  "Dimensionamento convenzionale preliminare: Q = volume netto x 35 W/m³. Non sostituisce un calcolo delle dispersioni dell'edificio o un progetto esecutivo. Il fabbisogno indicato deriva dal criterio convenzionale Volume × 35 W/m³ e deve essere verificato da un tecnico qualificato prima dell’esecuzione dell’impianto. Il coefficiente fisso non considera clima, involucro, ricambi d'aria, apporti solari e condizioni di esercizio. Potenze e portate provengono dai cataloghi indicati; verificare condizioni nominali, installazione e disponibilità commerciale prima dell'ordine. I prezzi di listino Ecoclima, quando riportati, sono separati dal dimensionamento tecnico.";
type Source = z.infer<typeof sourceMetadataSchema>;
const display = (value: number) =>
  value.toLocaleString("it-IT", { maximumFractionDigits: 2 });
export type MaterialRow = {
  description: string;
  quantity: number;
  unit: string;
  details: string;
  codes: string[];
  locales: string[];
};
export function buildDossier(project: Project) {
  const p = projectSchema.parse(project),
    codes = deviceCodes(p);
  const sources = new Map<string, Source>(),
    unresolved: string[] = [];
  const addSource = (s: Source | undefined | null, description: string) => {
    if (s) sources.set(`${s.sha256}:${s.page}`, s);
    else unresolved.push(description);
  };
  const materialMap = new Map<string, MaterialRow>();
  const material = (
    key: string,
    row: Omit<MaterialRow, "quantity" | "codes" | "locales">,
    code: string,
  ) => {
    const deviceId = [...codes.entries()].find(
      ([, value]) => value === code,
    )?.[0];
    const system = p.hvacSystems.find((s) => s.id === deviceId);
    const device = [
      ...p.radiators,
      ...p.airTerminals,
      ...p.hvacSystems.flatMap((s) => s.indoorUnits),
    ].find((d) => d.id === deviceId);
    const roomIds = system?.roomIds ?? (device ? [device.roomId] : []);
    const locales = p.rooms
      .filter((r) => roomIds.includes(r.id))
      .map((r) => r.name);
    const existing = materialMap.get(key);
    if (existing) {
      existing.quantity++;
      existing.codes.push(code);
      existing.locales = [...new Set([...existing.locales, ...locales])];
    } else
      materialMap.set(key, { ...row, quantity: 1, codes: [code], locales });
  };
  for (const d of p.radiators) {
    const product = radiatorProductAtVersion(d.productId, d.catalogVersion);
    addSource(
      product?.sourceMetadata,
      `${codes.get(d.id)}: catalogo radiatori ${d.catalogVersion} non disponibile`,
    );
    material(
      `rad:${d.productId}:${d.elements}:${d.deltaTK}`,
      {
        description: `${d.manufacturer} ${product?.model ?? d.family}`,
        unit: "batterie",
        details: `${d.elements} elementi; ${display(d.widthMm)} x ${display(d.heightMm)} x ${display(d.depthMm)} mm; DT ${display(d.deltaTK)} K; ${display(d.outputW)} W`,
      },
      codes.get(d.id)!,
    );
  }
  for (const d of p.airTerminals) {
    const family = airTerminalFamilyAtVersion(d.family, d.catalogVersion);
    addSource(
      family?.sourceMetadata,
      `${codes.get(d.id)}: catalogo terminali ${d.catalogVersion} non disponibile`,
    );
    material(
      `air:${d.productId}:${d.widthMm}:${d.heightMm}:${d.use}:${d.availableAirflowM3h}`,
      {
        description: `Ecoclima ${airTerminalModelDescription(family, d.productId)} - ${d.use === "supply" ? "mandata" : "ripresa"}`,
        unit: "pezzi",
        details: `Faccia ${display(d.widthMm)} x ${display(d.heightMm)} mm; profondità ${d.depthMm === null ? "non pubblicata" : display(d.depthMm) + " mm"}; ${display(d.availableAirflowM3h)} m³/h per unità`,
      },
      codes.get(d.id)!,
    );
  }
  for (const s of p.hvacSystems) {
    const product = hvacProductAtVersion(s.productId, s.catalogVersion);
    const combination =
      s.type === "split"
        ? splitCombinationAtVersion(s.productId, s.catalogVersion)
        : null;
    addSource(
      product?.sourceMetadata ?? combination?.sourceMetadata,
      `${codes.get(s.id)}: catalogo HVAC ${s.catalogVersion} non disponibile`,
    );
    combination?.secondarySourceMetadata.forEach((source) =>
      addSource(source, ""),
    );
    material(
      `hvac:${s.productId}`,
      {
        description: `${s.manufacturer} ${s.genericMachine?.model ?? (combination ? combination.outdoorModel : (product?.indoorModel ?? s.productId))}`,
        unit: "sistemi",
        details: `Unità esterna: ${product?.outdoorModel ?? combination?.outdoorModel ?? "non dichiarata"}; ${s.type === "ducted" ? "canalizzato" : (combination?.mode ?? "split")}; ${s.capacityW === null ? "potenza non dichiarata" : `${s.capacityW} W`}${s.airflowM3h !== null ? `; ${s.airflowM3h} m³/h massimi` : ""}${s.genericMachine ? "; dati inseriti dall’operatore" : ""}`,
      },
      codes.get(s.id)!,
    );
    for (const d of s.indoorUnits) {
      const indoor = hvacProductAtVersion(d.productId, d.catalogVersion);
      const splitIndoor = splitIndoorAtVersion(d.productId, d.catalogVersion);
      addSource(
        indoor?.sourceMetadata ?? splitIndoor?.sourceMetadata,
        `${codes.get(d.id)}: fonte unità interna non disponibile`,
      );
      material(
        `indoor:${d.productId}`,
        {
          description: `${s.manufacturer} ${indoor?.indoorModel ?? splitIndoor?.model ?? d.productId} - unità interna`,
          unit: "pezzi",
          details: `${d.widthMm} x ${d.heightMm} x ${d.depthMm} mm; inclusa nel sistema ${codes.get(s.id)}`,
        },
        codes.get(d.id)!,
      );
    }
  }
  return {
    project: p,
    codes,
    sources: [...sources.values()],
    unresolved,
    materials: [...materialMap.values()],
    checks: validateProject(p),
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
