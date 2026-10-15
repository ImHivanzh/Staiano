"use client";
import { LengthInput } from "../LengthInput";
import type { Project } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { applyManualDuctedSystem } from "@/domain/ducted/apply";
import { numberFromForm } from "@/utils/format";
import type { Ref } from "react";

export function ManualMachineForm({
  project,
  roomIds,
  onApplied,
  installationId,
  systemId,
  onPlace,
  saveButtonRef,
}: {
  project: Project;
  roomIds: string[];
  onApplied?: () => void;
  installationId?: string;
  systemId?: string | null;
  onPlace?: (change: (project: Project) => Project) => void;
  saveButtonRef?: Ref<HTMLButtonElement>;
}) {
  const existing = project.hvacSystems.find(
    (system) =>
      system.type === "ducted" &&
      (systemId === undefined || system.id === systemId) &&
      (systemId !== undefined ||
        system.roomIds.some((id) => roomIds.includes(id)) ||
        system.indoorUnits.some((unit) => roomIds.includes(unit.roomId))) &&
      (!installationId || system.installationId === installationId),
  );
  const input = existing?.genericMachine;
  const { commit } = useProjectStore();
  return (
    <form
      key={existing?.id ?? roomIds.join("|")}
      onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        const optional = (key: string) =>
          values.get(key) ? numberFromForm(values.get(key)) : undefined;
        const coolingKw = optional("cooling"),
          heatingKw = optional("heating");
        const connectionWidthMm = optional("connectionWidth"),
          connectionHeightMm = optional("connectionHeight");
        (onPlace ?? commit)((p) =>
          applyManualDuctedSystem(
            p,
            roomIds,
            {
              manufacturer: String(values.get("brand")),
              model: String(values.get("model")),
              maxAirflowM3h: numberFromForm(values.get("flow")),
              coolingCapacityW:
                coolingKw === undefined ? undefined : coolingKw * 1000,
              heatingCapacityW:
                heatingKw === undefined ? undefined : heatingKw * 1000,
              widthMm: optional("width"),
              heightMm: optional("height"),
              depthMm: optional("depth"),
              ...(connectionWidthMm && connectionHeightMm
                ? {
                    dischargeConnection: {
                      connectionWidthMm,
                      connectionHeightMm,
                      dimensionBasis: "ductOpening" as const,
                    },
                  }
                : {}),
            },
            existing?.id ?? null,
            installationId,
          ),
        );
        if (!useProjectStore.getState().error) onApplied?.();
      }}
    >
      <h3>Macchina manuale</h3>
      <p className="nota">
        Inserisci i dati della tua macchina. La distribuzione usa sempre la
        portata massima.
      </p>
      <label className="campo">
        <span>Marca</span>
        <input
          name="brand"
          aria-label="Marca macchina manuale"
          maxLength={100}
          defaultValue={input?.manufacturer ?? ""}
          required
        />
      </label>
      <label className="campo">
        <span>Modello</span>
        <input
          name="model"
          aria-label="Modello macchina manuale"
          maxLength={100}
          defaultValue={input?.model ?? ""}
          required
        />
      </label>
      <label className="campo">
        <span>Portata massima (m³/h)</span>
        <input
          name="flow"
          aria-label="Portata massima macchina manuale"
          type="number"
          min="0.1"
          step="any"
          defaultValue={input?.maxAirflowM3h}
          required
        />
      </label>
      <details open={!!onPlace}>
        <summary>Quote e potenze, se disponibili</summary>
        {[
          ["width", "Larghezza macchina (mm)", input?.widthMm],
          ["height", "Altezza macchina (mm)", input?.heightMm],
          ["depth", "Profondità macchina (mm)", input?.depthMm],
          [
            "connectionWidth",
            "Larghezza attacco mandata (mm)",
            input?.dischargeConnection?.connectionWidthMm,
          ],
          [
            "connectionHeight",
            "Altezza attacco mandata (mm)",
            input?.dischargeConnection?.connectionHeightMm,
          ],
          [
            "cooling",
            "Potenza freddo (kW)",
            input?.coolingCapacityW === undefined
              ? undefined
              : input.coolingCapacityW / 1000,
          ],
          [
            "heating",
            "Potenza caldo (kW)",
            input?.heatingCapacityW === undefined
              ? undefined
              : input.heatingCapacityW / 1000,
          ],
        ].map(([key, label, value]) =>
          /\((m|mm|cm)\)$/.test(String(label)) ? (
            <LengthInput
              key={String(key)}
              label={String(label).replace(/ \((m|mm|cm)\)$/, "")}
              baseUnit={
                String(label).endsWith("(mm)")
                  ? "mm"
                  : String(label).endsWith("(cm)")
                    ? "cm"
                    : "m"
              }
              name={String(key)}
              min="1"
              step="any"
              defaultValue={value}
              required={
                !!onPlace && ["width", "height", "depth"].includes(String(key))
              }
            />
          ) : (
            <label className="campo" key={String(key)}>
              <span>{label}</span>
              <input
                type="number"
                name={String(key)}
                min="0.001"
                step="any"
                defaultValue={value}
              />
            </label>
          ),
        )}
      </details>
      <button
        ref={saveButtonRef}
        style={saveButtonRef ? { display: "none" } : undefined}
        className="bottone chiara"
        type="submit"
      >
        {existing ? "Aggiorna macchina manuale" : "Inserisci macchina manuale"}
      </button>
    </form>
  );
}
