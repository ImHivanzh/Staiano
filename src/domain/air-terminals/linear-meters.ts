import type { LinearPlan, Project } from "@/schemas/project";
import type {
  AirTerminalFamily,
  OperatingPoint,
} from "@/domain/catalogs/air-terminal-schema";
import { airTerminalFamilyAtVersion } from "@/domain/catalogs/air-terminals";
import { distributeAirflow } from "@/domain/ducted/calculate";
import { ductedMaximumAirflow } from "@/domain/ducted/machine";

export type LinearUse = "supply" | "return";

export type LinearArm = {
  familyCode: string;
  operatingPointIndex: number;
  variantId?: string;
};

function ductedSystem(project: Project, systemId: string) {
  const system = project.hvacSystems.find(
    (s) => s.id === systemId && s.type === "ducted",
  );
  if (!system) return null;
  const rooms = project.rooms.filter((r) => system.roomIds.includes(r.id));
  if (!rooms.length || rooms.some((r) => r.geometryStatus !== "closed"))
    return null;
  const airflowM3h = ductedMaximumAirflow(system);
  if (airflowM3h === null || airflowM3h <= 0) return null;
  return { system, rooms, airflowM3h };
}

function linearFamily(
  familyCode: string,
  version: string,
): AirTerminalFamily | null {
  const family = airTerminalFamilyAtVersion(familyCode, version);
  return family?.isLinearPerMeter ? family : null;
}

/** Usable catalogue point: valid quality and a declared per-meter rate. */
export function linearOperatingPoint(
  family: AirTerminalFamily,
  index: number,
  variantId?: string,
): OperatingPoint | null {
  const point = variantId
    ? family.variants.find((v) => v.id === variantId)?.operatingPoints[index]
    : family.variants.flatMap((v) => v.operatingPoints)[index];
  if (!point || point.quality !== "valid" || !point.airflowPerMeterM3h)
    return null;
  if ((point.noiseDbA ?? point.noiseUpperBoundDbA ?? Infinity) > 37)
    return null;
  return point;
}

/**
 * Minimum required linear meters. This is a requirement, never a vent: the
 * operator always decides how many physical vents cover it.
 */
export function requiredLinearMeters(
  airflowM3h: number,
  airflowPerMeterM3h: number,
): number {
  if (
    !Number.isFinite(airflowM3h) ||
    airflowM3h <= 0 ||
    !Number.isFinite(airflowPerMeterM3h) ||
    airflowPerMeterM3h <= 0
  )
    throw new Error("Portata e portata per metro positive necessarie.");
  return airflowM3h / airflowPerMeterM3h;
}

/** Physically installed linear meters for one system arm. */
export function installedLinearMeters(
  project: Project,
  systemId: string,
  use: LinearUse,
): number {
  return project.airTerminals
    .filter((t) => t.systemId === systemId && t.use === use)
    .filter(
      (t) =>
        airTerminalFamilyAtVersion(t.family, t.catalogVersion)
          ?.isLinearPerMeter,
    )
    .reduce((sum, t) => sum + t.widthMm / 1000, 0);
}

/** Snapshot a suggestion. Storing a plan never creates vents by itself. */
export function buildLinearPlan(
  project: Project,
  systemId: string,
  arms: { supply?: LinearArm; return?: LinearArm },
  catalogVersion?: string,
): LinearPlan | null {
  const sized = ductedSystem(project, systemId);
  if (!sized || (!arms.supply && !arms.return)) return null;
  const version = catalogVersion ?? project.catalogVersions.Ecoclima ?? "";
  const resolve = (use: LinearUse, arm?: LinearArm) => {
    if (!arm) return null;
    const family = linearFamily(arm.familyCode, version);
    const point =
      family &&
      linearOperatingPoint(family, arm.operatingPointIndex, arm.variantId);
    if (!family || !point || !point.airflowPerMeterM3h) return null;
    if (!family.use.includes(use)) return null;
    return { family, point };
  };
  const supply = resolve("supply", arms.supply);
  const returned = resolve("return", arms.return);
  if (arms.supply && !supply) return null;
  if (arms.return && !returned) return null;
  const allocations = distributeAirflow(sized.rooms, sized.airflowM3h);
  const distribution: LinearPlan["distribution"] = [];
  for (const allocation of allocations)
    for (const [use, resolved] of [
      ["supply", supply],
      ["return", returned],
    ] as const) {
      if (!resolved) continue;
      distribution.push({
        roomId: allocation.roomId,
        use,
        suggestedM: allocation.airflowM3h / resolved.point.airflowPerMeterM3h!,
        airflowM3h: allocation.airflowM3h,
      });
    }
  const primary = supply ?? returned!;
  return {
    updatedAt: new Date().toISOString(),
    airflowM3h: sized.airflowM3h,
    familyCode: primary.family.familyCode,
    catalogVersion: version,
    ...(arms.supply?.variantId
      ? {
          supplyVariantId: arms.supply.variantId,
          supplyOperatingPointIndex: arms.supply.operatingPointIndex,
        }
      : {}),
    ...(arms.return?.variantId
      ? {
          returnVariantId: arms.return.variantId,
          returnOperatingPointIndex: arms.return.operatingPointIndex,
        }
      : {}),
    operatingPointLabel: primary.point.noiseLabel,
    airflowPerMeterM3h: primary.point.airflowPerMeterM3h,
    returnFamilyCode: returned?.family.familyCode ?? null,
    returnOperatingPointLabel: returned?.point.noiseLabel ?? null,
    returnAirflowPerMeterM3h: returned?.point.airflowPerMeterM3h ?? null,
    requiredSupplyM: supply
      ? requiredLinearMeters(sized.airflowM3h, supply.point.airflowPerMeterM3h!)
      : 0,
    requiredReturnM: returned
      ? requiredLinearMeters(
          sized.airflowM3h,
          returned.point.airflowPerMeterM3h!,
        )
      : 0,
    distribution,
    status: "proposed",
  };
}

export function saveLinearPlan(
  project: Project,
  systemId: string,
  plan: LinearPlan,
): Project {
  return {
    ...project,
    hvacSystems: project.hvacSystems.map((s) =>
      s.id === systemId ? { ...s, linearPlan: plan } : s,
    ),
  };
}

/** Recalculate requirements from live machine flow, preserving operator pieces. */
export function systemLinearBalances(project: Project, systemId: string) {
  const system = project.hvacSystems.find((s) => s.id === systemId);
  const flow = system && ductedMaximumAirflow(system);
  if (!system || !flow) return [];
  return (["supply", "return"] as const).flatMap((use) => {
    const plan = system.linearPlan;
    const first = project.airTerminals.find(
      (t) =>
        t.systemId === systemId &&
        t.use === use &&
        airTerminalFamilyAtVersion(t.family, t.catalogVersion)
          ?.isLinearPerMeter,
    );
    const rate =
      use === "supply" && (plan?.requiredSupplyM ?? 0) > 0
        ? plan?.airflowPerMeterM3h
        : use === "return"
          ? plan?.returnAirflowPerMeterM3h
          : null;
    const familyCode =
      use === "supply" ? plan?.familyCode : plan?.returnFamilyCode;
    const family =
      first && airTerminalFamilyAtVersion(first.family, first.catalogVersion);
    const op =
      first?.operatingPointIndex == null
        ? null
        : family?.variants.find((v) => v.id === first.productId)
            ?.operatingPoints[first.operatingPointIndex];
    const effectiveRate = rate ?? op?.airflowPerMeterM3h;
    if (!effectiveRate) return [];
    const requiredM = requiredLinearMeters(flow, effectiveRate);
    const installedM = installedLinearMeters(project, systemId, use);
    const terminals = project.airTerminals.filter(
      (t) => t.systemId === systemId && t.use === use,
    );
    const availableAirflowM3h = terminals.reduce((sum, terminal) => {
      const family = airTerminalFamilyAtVersion(
        terminal.family,
        terminal.catalogVersion,
      );
      const point =
        terminal.operatingPointIndex === null
          ? null
          : family?.variants.find((v) => v.id === terminal.productId)
              ?.operatingPoints[terminal.operatingPointIndex];
      if (
        !point ||
        point.quality !== "valid" ||
        !family?.use.includes(use) ||
        (point.use && point.use !== use) ||
        terminal.legacyUnverified
      )
        return sum;
      return (
        sum +
        (family.isLinearPerMeter
          ? (terminal.widthMm / 1000) * (point.airflowPerMeterM3h ?? 0)
          : point.airflowM3h)
      );
    }, 0);
    const mixedModels =
      new Set(terminals.map((t) => `${t.productId}:${t.operatingPointIndex}`))
        .size > 1 ||
      terminals.some(
        (t) =>
          !airTerminalFamilyAtVersion(t.family, t.catalogVersion)
            ?.isLinearPerMeter,
      );
    const equivalentInstalledM = availableAirflowM3h / effectiveRate;
    const enough = availableAirflowM3h + 1e-7 >= flow;
    return [
      {
        use,
        familyCode: familyCode ?? first?.family ?? "",
        requiredM,
        installedM,
        marginM: installedM - requiredM,
        status: enough ? ("ok" as const) : ("deficit" as const),
        mixedModels,
        availableAirflowM3h,
        equivalentInstalledM,
        airflowM3h: flow,
        airflowPerMeterM3h: effectiveRate,
        operatingPointLabel:
          (use === "supply"
            ? plan?.operatingPointLabel
            : plan?.returnOperatingPointLabel) ??
          op?.noiseLabel ??
          "da verificare",
      },
    ];
  });
}

/** Any operator edit after a proposal marks it modified, never overwrites it. */
export function markLinearPlanModified(
  project: Project,
  systemId: string,
): Project {
  return {
    ...project,
    hvacSystems: project.hvacSystems.map((s) =>
      s.id === systemId &&
      s.linearPlan &&
      (s.linearPlan.status === "proposed" || s.linearPlan.status === "accepted")
        ? { ...s, linearPlan: { ...s.linearPlan, status: "modified" as const } }
        : s,
    ),
  };
}
