"use client";
import { LengthInput } from "../LengthInput";
import type { Project } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { applyManualDuctedSystem } from "@/domain/ducted/apply";
import { numberFromForm } from "@/utils/format";

export function ManualMachineForm({
  project,
  roomIds,
  onApplied,
  installationId,
}: {
  project: Project;
  roomIds: string[];
  onApplied?: () => void;
  installationId?: string;
}) {
  const existing = project.hvacSystems.find(
    (system) =>
      system.type === "ducted" &&
      system.roomIds.some((id) => roomIds.includes(id)) &&
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
        const connectionWidthMm = optional("connectionWidth"),
          connectionHeightMm = optional("connectionHeight");
        commit((p) =>
          applyManualDuctedSystem(
            p,
            existing?.roomIds ?? roomIds,
            {
              manufacturer: String(values.get("brand")),
              model: String(values.get("model")),
              maxAirflowM3h: numberFromForm(values.get("flow")),
              coolingCapacityW: optional("cooling"),
              heatingCapacityW: optional("heating"),
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
      <details>
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
          ["cooling", "Potenza freddo (W)", input?.coolingCapacityW],
          ["heating", "Potenza caldo (W)", input?.heatingCapacityW],
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
            />
          ) : (
            <label className="campo" key={String(key)}>
              <span>{label}</span>
              <input
                type="number"
                name={String(key)}
                min="1"
                step="any"
                defaultValue={value}
              />
            </label>
          ),
        )}
      </details>
      <button className="bottone chiara" type="submit">
        {existing ? "Aggiorna macchina manuale" : "Inserisci macchina manuale"}
      </button>
    </form>
  );
}
