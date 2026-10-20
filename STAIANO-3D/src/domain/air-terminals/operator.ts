import { terminalBodyDepthMm } from "./geometry";
import type { Project } from "@/schemas/project";
import {
  airTerminalCatalog,
  airTerminalFamilyAtVersion,
  airTerminalMountings,
} from "@/domain/catalogs/air-terminals";
import {
  terminalPlenumOptionsSchema,
  type TerminalPlenumOptions,
} from "@/domain/catalogs/ecoclima-price-schema";
import { ductedRoomAllocation } from "@/domain/ducted/apply";
import { applyAirTerminalSolution } from "./apply";
import { acousticUpperBound } from "./size";
import { newId } from "@/domain/project";
import { resolveTerminalAccessorySpecification } from "./commercial-bom";
import { layoutLinearRun, linearRunMembers } from "./linear-run";
import { footprintInsideRoom } from "@/domain/geometry/footprint";
import {
  buildLinearPlan,
  markLinearPlanModified,
  saveLinearPlan,
} from "./linear-meters";

export type OperatorTerminalInput = {
  roomId: string;
  systemId: string | null;
  installationId?: string;
  familyCode: string;
  variantId: string;
  operatingPointIndex: number;
  use: "supply" | "return";
  mounting: "wall" | "ceiling";
  lengthMm: number;
  customLength?: boolean;
  moduleLengthsMm?: number[];
  style?: string;
  color?: string;
  finish?: string;
  plenumOptions?: TerminalPlenumOptions;
  manualDimensions?: {
    widthMm: number;
    heightMm: number;
    depthMm: number | null;
  };
};

/** One operator action adds one point, optionally composed of joined modules. */
export function addOperatorTerminal(
  project: Project,
  input: OperatorTerminalInput,
): Project {
  if (input.moduleLengthsMm) {
    const lengths = input.moduleLengthsMm;
    if (
      lengths.length < 2 ||
      lengths.length > 100 ||
      lengths.some(
        (length) => !Number.isFinite(length) || length <= 0 || length > 10000,
      ) ||
      lengths.reduce((sum, length) => sum + length, 0) !== input.lengthMm ||
      (input.manualDimensions !== undefined &&
        input.manualDimensions.widthMm !== input.lengthMm) ||
      !airTerminalCatalog.families.find(
        (family) => family.familyCode === input.familyCode,
      )?.isLinearPerMeter
    )
      throw new Error(
        "Composizione non valida: almeno due moduli positivi, totale fino a 10000 mm.",
      );
    const placed = addOperatorTerminal(project, {
      ...input,
      moduleLengthsMm: undefined,
    });
    const whole = placed.airTerminals.at(-1)!;
    const runId = newId();
    const members = layoutLinearRun(
      lengths.map((widthMm, index) => ({
        ...whole,
        id: index === 0 ? whole.id : newId(),
        widthMm,
        availableAirflowM3h:
          (whole.availableAirflowM3h * widthMm) / whole.widthMm,
        requiredAirflowM3h:
          (whole.requiredAirflowM3h * widthMm) / whole.widthMm,
        commercialOptions: {
          ...whole.commercialOptions,
          insulatedPlenum: whole.commercialOptions?.insulatedPlenum ?? true,
          fixingBridges: true,
          continuityKit: true,
          linearRunId: runId,
          linearRunOrder: index,
        },
      })),
      whole,
    );
    if (
      members.some(
        (item) =>
          !resolveTerminalAccessorySpecification(item)?.continuitySupported,
      )
    )
      throw new Error(
        "Kit di continuità non disponibile per queste misure. Scegli moduli compatibili di catalogo.",
      );
    return { ...placed, airTerminals: [...project.airTerminals, ...members] };
  }
  if (
    project.rooms.find((room) => room.id === input.roomId)
      ?.conditioningExclusion
  )
    throw new Error(
      "Riattivare la climatizzazione dell’ambiente prima di inserire bocchette.",
    );
  const family = airTerminalCatalog.families.find(
    (f) => f.familyCode === input.familyCode,
  );
  const variant = family?.variants.find((v) => v.id === input.variantId);
  const op = variant?.operatingPoints[input.operatingPointIndex];
  const allocation = ductedRoomAllocation(
    project,
    input.roomId,
    project.hvacSystems.find((system) => system.id === input.systemId)
      ?.installationId,
    input.systemId ?? undefined,
  );
  if (
    !family ||
    !variant ||
    !op ||
    (input.systemId &&
      (!allocation || allocation.system.id !== input.systemId)) ||
    op.quality !== "valid" ||
    (input.use === "supply" && (acousticUpperBound(op) ?? Infinity) > 37) ||
    (op.use && op.use !== input.use)
  )
    throw new Error("Punto di catalogo e macchina compatibili necessari.");
  if (
    input.installationId &&
    !project.installations.some(
      (item) =>
        item.id === input.installationId &&
        item.type === "ducted" &&
        item.roomIds.includes(input.roomId),
    )
  )
    throw new Error("Impianto canalizzato coerente necessario.");
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
      requiredAirflowPerPointM3h: !input.systemId
        ? 0
        : input.use === "return"
          ? (allocation!.system.airflowM3h ?? allocation!.airflowM3h)
          : allocation!.airflowM3h,
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
        installationId:
          input.installationId ?? allocation?.system.installationId,
        decisionOrigin: "manual",
        style: input.style ?? "",
        color: input.color ?? "",
        finish: input.finish ?? "",
        commercialOptions: input.plenumOptions
          ? {
              fixingBridges: true,
              continuityKit: true,
              ...added.commercialOptions,
              ...terminalPlenumOptionsSchema.parse(input.plenumOptions),
            }
          : added.commercialOptions,
        pointIndex: null,
        unitIndex: null,
        plenumId:
          project.plenums.find(
            (pl) =>
              pl.systemId === input.systemId &&
              pl.floorId === added.floorId &&
              pl.use === input.use &&
              pl.attachmentId === undefined,
          )?.id ?? null,
      },
    ],
  };
  if (
    input.systemId &&
    family.isLinearPerMeter &&
    !allocation!.system.linearPlan
  ) {
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
  return input.systemId ? markLinearPlanModified(next, input.systemId) : next;
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
      | "ceilingBandId"
      | "ceilingEdge"
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
    (airTerminalMountings(family)
      ? !airTerminalMountings(family)!.includes(
          before.mounting as "wall" | "ceiling",
        )
      : !before.manualDimensions)
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
  let next = {
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
            depthMm: terminalBodyDepthMm(family, variant),
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
  const members = linearRunMembers(
    next,
    next.airTerminals.find((t) => t.id === id)!,
  );
  if (members.length > 1) {
    if (members.some((item) => item.locked))
      throw new Error(
        "Sbloccare tutti i moduli del punto prima di modificarlo.",
      );
    const updated = next.airTerminals.find((t) => t.id === id)!;
    if (
      members.some(
        (item) =>
          item.family !== updated.family ||
          item.productId !== updated.productId ||
          item.heightMm !== updated.heightMm ||
          !resolveTerminalAccessorySpecification(item)?.continuitySupported,
      )
    )
      throw new Error(
        "Per il punto composto scegli moduli dello stesso modello e misure compatibili con il kit.",
      );
    const arranged = layoutLinearRun(
      members,
      updated,
      members.findIndex((t) => t.id === id),
    );
    if (
      arranged.some(
        (item) =>
          !footprintInsideRoom(
            next.rooms.find((room) => room.id === item.roomId)!,
            item.position,
            item.widthMm / 1000,
            (item.mounting === "ceiling"
              ? item.heightMm
              : (item.depthMm ?? 0)) / 1000,
            item.rotation,
          ),
      )
    )
      throw new Error(
        "Il punto composto non rientra nel contorno della stanza.",
      );
    next = {
      ...next,
      airTerminals: next.airTerminals.map(
        (t) => arranged.find((item) => item.id === t.id) ?? t,
      ),
    };
  }
  return before.systemId ? markLinearPlanModified(next, before.systemId) : next;
}
