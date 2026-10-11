"use client";
import type { Project } from "@/schemas/project";
import type { AirTerminalFamily } from "@/domain/catalogs/air-terminal-schema";
import type { AirTerminalSolution } from "@/domain/air-terminals/size";
import { terminalDistribution } from "@/domain/air-terminals/distribution";
import { formatNumber } from "@/utils/format";
import styles from "./TerminalDistribution.module.css";

export function RoomMeterDistribution({
  rows,
}: {
  rows: {
    roomId: string;
    roomName: string;
    share: number;
    requiredM: number;
    installedM?: number;
    terminalCount?: number;
    status?: "ok" | "deficit";
  }[];
}) {
  return (
    <ul className={styles.rooms} aria-label="Metri lineari per ambiente">
      {rows.map((row) => (
        <li key={row.roomId} className={styles.row}>
          <div className={styles.label}>
            <strong>{row.roomName}</strong>
            <strong>{formatNumber(row.requiredM)} m</strong>
          </div>
          <div className={styles.track} aria-hidden="true">
            <div
              className={styles.bar}
              style={{ width: `${row.share * 100}%` }}
            />
          </div>
          <span>{formatNumber(row.share * 100, 1)}% del totale richiesto</span>
          {row.installedM !== undefined && (
            <span>
              Installati: {formatNumber(row.installedM)} m · {row.terminalCount}{" "}
              {row.terminalCount === 1 ? "bocchetta" : "bocchette"}
            </span>
          )}
          {row.status === "deficit" && (
            <strong className={styles.deficit}>
              {row.terminalCount === 0
                ? "Mandata assente"
                : "Mandata insufficiente"}
            </strong>
          )}
        </li>
      ))}
    </ul>
  );
}

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
        {family.isLinearPerMeter
          ? use === "supply"
            ? "Metri da distribuire"
            : "Ripresa consigliata"
          : "Terminali per ambiente"}
      </h3>
      <p>
        <strong>
          {formatNumber(result.machine.maxAirflowM3h)} m³/h massimi
        </strong>{" "}
        · {result.machine.model}
      </p>
      {result.theoreticalLengthM !== null && (
        <p>
          <strong>
            Minimo richiesto: {formatNumber(result.theoreticalLengthM)} m
          </strong>
          <br />
          Modello selezionato: {family.familyCode} ·{" "}
          {formatNumber(solution.operatingPoint.airflowPerMeterM3h!)} m³/h per
          metro
        </p>
      )}
      <p className="nota">
        {family.isLinearPerMeter
          ? "Metri lineari di bocchette, ripartiti in proporzione al fabbisogno termico di ogni ambiente. Lunghezze modificabili."
          : "Terminali ripartiti in proporzione al fabbisogno termico di ogni ambiente."}
        {use === "supply"
          ? " Prevedi almeno una bocchetta di mandata in ogni ambiente servito."
          : " La ripresa può essere centralizzata, da verificare nel progetto."}
      </p>
      {result.theoreticalLengthM !== null && (
        <RoomMeterDistribution
          rows={result.rows.map((row) => ({
            roomId: row.roomId,
            roomName: row.roomName,
            share: row.share,
            requiredM: row.theoreticalLengthM!,
          }))}
        />
      )}
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
                : `${row.units} moduli · ${formatNumber(row.commercialLengthM)} m commerciali complessivi`
              : "Aumenta i punti o scegli un’altra misura"}
          </span>
        </div>
      ))}
    </section>
  );
}
