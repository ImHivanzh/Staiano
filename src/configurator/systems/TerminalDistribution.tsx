"use client";
import type { Project } from "@/schemas/project";
import type { AirTerminalFamily } from "@/domain/catalogs/air-terminal-schema";
import type { AirTerminalSolution } from "@/domain/air-terminals/size";
import { terminalDistribution } from "@/domain/air-terminals/distribution";
import { formatNumber } from "@/utils/format";

export function TerminalDistribution({
  project,
  systemId,
  family,
  solution,
  use,
}: {
  project: Project;
  systemId: string;
  family: AirTerminalFamily;
  solution: AirTerminalSolution;
  use: "supply" | "return";
}) {
  const result = terminalDistribution(project, systemId, family, solution, use);
  if (!result) return null;
  return (
    <section aria-label="Distribuzione consigliata nelle stanze">
      <h3>
        {use === "supply" ? "Metri da distribuire" : "Ripresa consigliata"}
      </h3>
      <p>
        <strong>
          {formatNumber(result.machine.maxAirflowM3h)} m³/h massimi
        </strong>{" "}
        · {result.machine.model}
      </p>
      {result.theoreticalLengthM !== null && (
        <p>
          <strong>{formatNumber(result.theoreticalLengthM)} m teorici</strong>
          {result.commercialLengthM !== null &&
            ` · ${formatNumber(result.commercialLengthM)} m commerciali`}
        </p>
      )}
      <p className="nota">
        Ripartizione per metratura
        {result.sameHeights ? "." : " e altezza degli ambienti."} Il calcolo usa
        il fabbisogno di ogni stanza.
      </p>
      {result.rows.map((row) => (
        <div key={row.roomId} className="riparto-terminale">
          <strong>{row.roomName}</strong>
          <span>
            {formatNumber(row.areaM2)} m² · {formatNumber(row.airflowM3h)} m³/h
          </span>
          <span>
            {row.solution
              ? row.commercialLengthM === null
                ? `${row.units} unità · ${row.solution.variant.widthMm ?? row.solution.variant.nominalDiameterMm} × ${row.solution.variant.heightMm ?? row.solution.variant.nominalDiameterMm} mm`
                : `${formatNumber(row.commercialLengthM)} m · ${row.units} moduli`
              : "Aumenta i punti o scegli un’altra misura"}
          </span>
        </div>
      ))}
    </section>
  );
}
