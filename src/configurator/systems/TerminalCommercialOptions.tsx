"use client";
import type { Project } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import {
  commercialChoicesForTerminal,
  commercialPlenumChoicesForTerminal,
} from "@/domain/air-terminals/commercial-bom";

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
  const plenums = commercialPlenumChoicesForTerminal(terminal);
  const selected = choices.find(
    (p) =>
      p.modelCode === terminal.commercialOptions?.profileCode &&
      (p.colorCode ?? undefined) === terminal.commercialOptions?.colorCode,
  );
  const update = (
    patch: Partial<NonNullable<typeof terminal.commercialOptions>>,
  ) =>
    commit((p) => ({
      ...p,
      airTerminals: p.airTerminals.map((t) =>
        t.roomId === terminal.roomId &&
        t.family === terminal.family &&
        t.productId === terminal.productId &&
        t.use === terminal.use
          ? {
              ...t,
              commercialOptions: {
                insulatedPlenum: true,
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
              {choice.modelCode} · {choice.colorCode ?? "finitura non indicata"}{" "}
              ·{" "}
              {(choice.unitPriceCents / 100).toLocaleString("it-IT", {
                style: "currency",
                currency: "EUR",
              })}
            </option>
          ))}
        </select>
      </label>
      <label className="campo">
        <span>Plenum isolato compatibile</span>
        <select
          aria-label="Plenum isolato Ecoclima"
          value={
            terminal.commercialOptions?.plenumModelCode
              ? `${terminal.commercialOptions.plenumModelCode}|${terminal.commercialOptions.connectionPosition ?? ""}`
              : ""
          }
          onChange={(e) => {
            const choice = plenums.find(
              (p) =>
                `${p.modelCode}|${p.connectionPosition ?? ""}` ===
                e.target.value,
            );
            update({
              plenumModelCode: choice?.modelCode,
              ...(choice?.connectionPosition
                ? { connectionPosition: choice.connectionPosition }
                : {}),
            });
          }}
        >
          <option value="">
            {plenums.length === 1 ? plenums[0].modelCode : "Scegli il plenum"}
          </option>
          {[
            ...new Map(
              plenums.map((p) => [`${p.modelCode}:${p.connectionPosition}`, p]),
            ).values(),
          ].map((choice) => (
            <option
              key={choice.id}
              value={`${choice.modelCode}|${choice.connectionPosition ?? ""}`}
            >
              {choice.modelCode} ·{" "}
              {choice.connectionPosition === "upper"
                ? "stacco superiore"
                : "stacco laterale"}
            </option>
          ))}
        </select>
      </label>
      <p className="nota">
        La scelta si applica ai moduli di questo modello e utilizzo nella
        stanza. Ponti e kit richiesti dalle istruzioni restano nella distinta.
      </p>
      {!choices.length && (
        <p className="nota">
          Prezzo o corrispondenza esatta da verificare sulla scheda originale.
        </p>
      )}
    </details>
  );
}
