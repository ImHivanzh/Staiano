"use client";
import type { Project } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { commercialChoicesForTerminal } from "@/domain/air-terminals/commercial-bom";
import { linearRunMembers } from "@/domain/air-terminals/linear-run";
import {
  terminalFinishLabel,
  terminalFinishSpecification,
} from "@/domain/air-terminals/finishes";

export function TerminalCommercialOptions({
  project,
  terminalId,
}: {
  project: Project;
  terminalId: string;
}) {
  const terminal = project.airTerminals.find((t) => t.id === terminalId);
  const { commit } = useProjectStore();
  if (!terminal) return null;
  const choices = commercialChoicesForTerminal(terminal);
  const selected = choices.find(
    (p) =>
      p.modelCode === terminal.commercialOptions?.profileCode &&
      (p.colorCode ?? undefined) === terminal.commercialOptions?.colorCode,
  );
  const memberIds = new Set(
    linearRunMembers(project, terminal).map((item) => item.id),
  );
  const update = (
    patch: Partial<NonNullable<typeof terminal.commercialOptions>>,
    individual = false,
  ) =>
    commit((p) => ({
      ...p,
      airTerminals: p.airTerminals.map((t) =>
        (individual ? t.id === terminalId : memberIds.has(t.id)) && !t.locked
          ? {
              ...t,
              commercialOptions: {
                fixingBridges: true,
                continuityKit: true,
                ...t.commercialOptions,
                ...patch,
              },
            }
          : t,
      ),
    }));
  return (
    <details className="azione-inspector">
      <summary>Modello, finitura e accessori</summary>
      <label className="campo">
        <span>Articolo di listino</span>
        <select
          aria-label="Articolo Ecoclima di listino"
          value={selected?.id ?? ""}
          onChange={(e) => {
            const choice = choices.find((p) => p.id === e.target.value);
            if (choice)
              update({
                profileCode: choice.modelCode,
                colorCode: choice.colorCode ?? undefined,
                ...(terminal.family === "EBCV" && choice.dimensions.diameterMm
                  ? { mountingDuctDiameterMm: choice.dimensions.diameterMm }
                  : {}),
              });
          }}
        >
          <option value="">Scegli modello e finitura</option>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.modelCode} ·{" "}
              {terminalFinishLabel(
                choice.colorCode ??
                  terminalFinishSpecification(choice.modelCode)
                    ?.standardFinish ??
                  terminalFinishSpecification(choice.familyCode)
                    ?.standardFinish ??
                  "finitura non indicata",
              )}{" "}
              ·{" "}
              {(choice.unitPriceCents / 100).toLocaleString("it-IT", {
                style: "currency",
                currency: "EUR",
              })}
            </option>
          ))}
        </select>
      </label>
      {!choices.length && (
        <p className="nota">
          Prezzo o corrispondenza esatta da verificare sulla scheda originale.
        </p>
      )}
    </details>
  );
}
