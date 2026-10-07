import type { Project } from "@/schemas/project";
import {
  airTerminalCatalog,
  airTerminalFamilyAtVersion,
} from "@/domain/catalogs/air-terminals";
import { ductedRoomAllocation } from "@/domain/ducted/apply";
import { applyAirTerminalSolution } from "./apply";
import { acousticUpperBound } from "./size";
import {
  buildLinearPlan,
  markLinearPlanModified,
  saveLinearPlan,
} from "./linear-meters";

export type OperatorTerminalInput = {
  roomId: string;
  systemId: string;
  familyCode: string;
  variantId: string;
  operatingPointIndex: number;
  use: "supply" | "return";
  mounting: "wall" | "ceiling";
  lengthMm: number;
  style?: string;
  color?: string;
  finish?: string;
  manualDimensions?: {
    widthMm: number;
    heightMm: number;
    depthMm: number | null;
  };
};

/** One explicit operator action adds ONE piece. Required meters never set its length. */
export function addOperatorTerminal(
  project: Project,
  input: OperatorTerminalInput,
): Project {
  const family = airTerminalCatalog.families.find(
    (f) => f.familyCode === input.familyCode,
  );
  const variant = family?.variants.find((v) => v.id === input.variantId);
  const op = variant?.operatingPoints[input.operatingPointIndex];
  const allocation = ductedRoomAllocation(project, input.roomId);
  if (
    !family ||
    !variant ||
    !op ||
    !allocation ||
    allocation.system.id !== input.systemId ||
    op.quality !== "valid" ||
    (acousticUpperBound(op) ?? Infinity) > 37 ||
    (op.use && op.use !== input.use)
  )
    throw new Error("Punto di catalogo e macchina compatibili necessari.");
  if (
    !Number.isFinite(input.lengthMm) ||
    input.lengthMm <= 0 ||
    input.lengthMm > 10000
  )
    throw new Error(
      "Scegliere la lunghezza della singola bocchetta, tra 1 e 10000 mm.",
    );
  const available = family.isLinearPerMeter
    ? (input.lengthMm / 1000) * (op.airflowPerMeterM3h ?? 0)
    : op.airflowM3h;
  if (available <= 0) throw new Error("Portata per metro non disponibile.");
  // Reuse the placement search in append mode, preserving every operator piece.
  const existing = project.airTerminals;
  const placed = applyAirTerminalSolution(
    project,
    input.roomId,
    input.systemId,
    input.use,
    input.familyCode,
    {
      variant,
      operatingPoint: op,
      numberOfPoints: 1,
      quantityPerPoint: 1,
      requiredAirflowPerPointM3h: allocation.airflowM3h,
      theoreticalLengthM: null,
      commercialLengthM: family.isLinearPerMeter ? input.lengthMm / 1000 : null,
      availableAirflowPerPointM3h: available,
      log: [],
    },
    input.mounting,
    "append",
    input.manualDimensions,
  );
  const added = placed.airTerminals.find(
    (t) => !existing.some((v) => v.id === t.id),
  );
  if (!added) throw new Error("Bocchetta non posizionata.");
  let next: Project = {
    ...placed,
    rooms: project.rooms,
    airTerminals: [
      ...existing,
      {
        ...added,
        decisionOrigin: "manual",
        style: input.style ?? "",
        color: input.color ?? "",
        finish: input.finish ?? "",
        pointIndex: null,
        unitIndex: null,
        plenumId:
          project.plenums.find(
            (pl) =>
              pl.systemId === input.systemId && pl.floorId === added.floorId,
          )?.id ?? null,
      },
    ],
  };
  if (family.isLinearPerMeter && !allocation.system.linearPlan) {
    const plan = buildLinearPlan(
      next,
      input.systemId,
      {
        [input.use]: {
          familyCode: family.familyCode,
          variantId: variant.id,
          operatingPointIndex: input.operatingPointIndex,
        },
      },
      airTerminalCatalog.version,
    );
    if (plan) next = saveLinearPlan(next, input.systemId, plan);
  }
  return markLinearPlanModified(next, input.systemId);
}

export function editOperatorTerminal(
  project: Project,
  id: string,
  patch: Partial<
    Pick<
      Project["airTerminals"][number],
      | "position"
      | "rotation"
      | "widthMm"
      | "heightMm"
      | "elevationM"
      | "wallId"
      | "style"
      | "color"
      | "finish"
      | "productCode"
      | "plenumId"
    >
  > & { familyCode?: string; variantId?: string; operatingPointIndex?: number },
) {
  const before = project.airTerminals.find((t) => t.id === id);
  if (!before) throw new Error("Bocchetta inesistente.");
  if (before.locked)
    throw new Error("Sbloccare la bocchetta prima di modificarla.");
  const family = airTerminalFamilyAtVersion(
    patch.familyCode ?? before.family,
    before.catalogVersion,
  );
  const variant = family?.variants.find(
    (v) => v.id === (patch.variantId ?? before.productId),
  );
  const index = patch.operatingPointIndex ?? before.operatingPointIndex;
  const op = index === null ? undefined : variant?.operatingPoints[index];
  if (
    !family ||
    !variant ||
    !op ||
    op.quality !== "valid" ||
    (op.use && op.use !== before.use) ||
    !family.use.includes(before.use) ||
    !family.mountings?.includes(before.mounting as "wall" | "ceiling")
  )
    throw new Error(
      "Modello o punto di funzionamento non compatibile: selezionare un punto valido.",
    );
  const widthMm =
    patch.widthMm ??
    (patch.variantId && !family.isLinearPerMeter
      ? variant.faceWidthMm
      : before.widthMm);
  const heightMm =
    patch.heightMm ??
    (patch.variantId ? variant.faceHeightMm : before.heightMm);
  if (
    !widthMm ||
    !heightMm ||
    !Number.isFinite(widthMm) ||
    !Number.isFinite(heightMm) ||
    widthMm <= 0 ||
    heightMm <= 0 ||
    widthMm > 10000 ||
    heightMm > 10000
  )
    throw new Error("Misure positive fino a 10000 mm necessarie.");
  if (
    !family.isLinearPerMeter &&
    !before.manualDimensions &&
    variant.faceWidthMm &&
    variant.faceHeightMm &&
    (widthMm !== variant.faceWidthMm || heightMm !== variant.faceHeightMm)
  )
    throw new Error(
      "Terminale non lineare: scegliere le dimensioni reali di una variante di catalogo.",
    );
  const pose = { ...patch };
  delete pose.familyCode;
  delete pose.variantId;
  const next = {
    ...project,
    airTerminals: project.airTerminals.map((t) =>
      t.id === id
        ? {
            ...t,
            ...pose,
            widthMm,
            heightMm,
            productId: variant.id,
            family: family.familyCode,
            shape: family.shape ?? t.shape,
            depthMm: variant.bodyDepthMm ?? null,
            availableAirflowM3h: family.isLinearPerMeter
              ? (widthMm / 1000) * (op.airflowPerMeterM3h ?? 0)
              : op.airflowM3h,
            operatingPointIndex: index,
            noiseDbA: op.noiseDbA,
            noiseUpperBoundDbA: op.noiseUpperBoundDbA,
            noiseLabel: op.noiseLabel,
            pressureDropPa: op.pressureDropPa,
            throwM: op.throwM,
            openingMm: op.openingMm ?? null,
            theoreticalLengthM: null,
            decisionOrigin: "manual" as const,
          }
        : t,
    ),
  };
  return before.systemId ? markLinearPlanModified(next, before.systemId) : next;
}
