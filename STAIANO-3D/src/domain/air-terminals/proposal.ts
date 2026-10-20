import type { Project } from "@/schemas/project";
import {
  airTerminalFamilyAtVersion,
  airTerminalMountings,
} from "@/domain/catalogs/air-terminals";
import { sizeAirTerminal } from "./size";
import { applyAirTerminalSolution } from "./apply";
import { systemLinearBalances } from "./linear-meters";

/** Explicit acceptance only. Existing operator pieces are never replaced. */
export function acceptTerminalProposal(
  project: Project,
  systemId: string,
  mounting: "wall" | "ceiling",
  appearance: { style: string; color: string; finish: string },
) {
  const plan = project.hvacSystems.find((s) => s.id === systemId)?.linearPlan;
  if (!plan || plan.status !== "proposed")
    throw new Error("Generare una nuova proposta prima di accettarla.");
  const proposalId = `${systemId}:${plan.updatedAt}`;
  let next = structuredClone(project);
  // Regeneration removes only untouched pieces of the previous proposal.
  next.airTerminals = next.airTerminals.filter(
    (t) =>
      t.systemId !== systemId ||
      !t.proposalId ||
      t.decisionOrigin === "manual" ||
      t.locked,
  );
  for (const row of plan.distribution) {
    const familyCode =
      row.use === "supply" ? plan.familyCode : plan.returnFamilyCode;
    const variantId =
      row.use === "supply" ? plan.supplyVariantId : plan.returnVariantId;
    const index =
      row.use === "supply"
        ? plan.supplyOperatingPointIndex
        : plan.returnOperatingPointIndex;
    const family = familyCode
      ? airTerminalFamilyAtVersion(
          familyCode,
          plan.catalogVersion ?? next.catalogVersions.Ecoclima ?? "",
        )
      : null;
    const variant = family?.variants.find((v) => v.id === variantId);
    const op = index === undefined ? null : variant?.operatingPoints[index];
    if (
      !family ||
      !variant ||
      !op ||
      !airTerminalMountings(family)?.includes(mounting)
    )
      throw new Error("Modello o montaggio non disponibile per la proposta.");
    const installedFlow = next.airTerminals
      .filter(
        (t) =>
          t.systemId === systemId &&
          t.roomId === row.roomId &&
          t.use === row.use,
      )
      .reduce((sum, t) => sum + t.availableAirflowM3h, 0);
    const remaining = row.airflowM3h - installedFlow;
    if (remaining <= 1e-9) continue;
    const model = {
      ...family,
      variants: [{ ...variant, operatingPoints: [op] }],
    };
    const choice = sizeAirTerminal(remaining, 1, model, row.use)[0];
    if (!choice) throw new Error("Nessuna proposta commerciale verificata.");
    // Restore original point references for the catalogue invariant.
    choice.variant = variant;
    const ids = new Set(next.airTerminals.map((t) => t.id));
    next = applyAirTerminalSolution(
      next,
      row.roomId,
      systemId,
      row.use,
      family.familyCode,
      choice,
      mounting,
      "append",
    );
    next.airTerminals = next.airTerminals.map((t) =>
      ids.has(t.id)
        ? t
        : {
            ...t,
            ...appearance,
            proposalId,
            decisionOrigin: "confirmed",
            pointIndex: null,
            unitIndex: null,
            plenumId:
              next.plenums.find(
                (pl) =>
                  pl.systemId === systemId &&
                  pl.floorId === t.floorId &&
                  pl.use === t.use,
              )?.id ?? null,
          },
    );
  }
  if (systemLinearBalances(next, systemId).some((b) => b.status === "deficit"))
    throw new Error("Proposta insufficiente: verificare portate e catalogo.");
  return {
    ...next,
    hvacSystems: next.hvacSystems.map((s) =>
      s.id === systemId
        ? { ...s, linearPlan: { ...plan, status: "accepted" as const } }
        : s,
    ),
  };
}

export function cancelTerminalProposal(project: Project, systemId: string) {
  return {
    ...project,
    airTerminals: project.airTerminals.filter(
      (t) =>
        t.systemId !== systemId ||
        !t.proposalId ||
        t.decisionOrigin === "manual" ||
        t.locked,
    ),
    hvacSystems: project.hvacSystems.map((s) =>
      s.id === systemId
        ? {
            ...s,
            linearPlan: s.linearPlan
              ? { ...s.linearPlan, status: "none" as const }
              : null,
          }
        : s,
    ),
  };
}
