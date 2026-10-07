"use client";
import { Wind, SlidersHorizontal } from "@phosphor-icons/react";
import { useState } from "react";
import Image from "next/image";
import { PlenumPreview3D } from "@/configurator/viewer3d/PlenumPreview3D";
import type { Project } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber } from "@/utils/format";
import {
  calculateSupplyPlenum,
  PLENUM_SOURCES,
  type PlenumSettings,
} from "@/domain/ducted/plenum";
import styles from "./SupplyPlenumPanel.module.css";
import { plenumDiagramSvg } from "@/domain/ducted/plenum-diagram";
import {
  placeDuctedMachine,
  placeSupplyPlenum,
} from "@/domain/ducted/placement";
import { LinearSummary } from "./OperatorTerminalControls";

export function SupplyPlenumPanel({
  project,
  systemId,
}: {
  project: Project;
  systemId: string;
}) {
  const result = calculateSupplyPlenum(project, systemId);
  const [show3D, setShow3D] = useState(false);
  const { commit } = useProjectStore();
  const placed = project.plenums.find((pl) => pl.systemId === systemId);
  const system = project.hvacSystems.find((s) => s.id === systemId);
  const [machineRoomId, setMachineRoomId] = useState(
    system?.indoorUnits[0]?.roomId ?? system?.roomIds[0] ?? "",
  );
  const update = (patch: Partial<PlenumSettings>) =>
    commit((p) => ({
      ...p,
      hvacSystems: p.hvacSystems.map((s) =>
        s.id === systemId
          ? {
              ...s,
              plenumSettings: { ...result.settings, ...patch },
            }
          : s,
      ),
    }));
  const summary = result.groupedDiameters
    .map((group) => `${group.quantity} × Ø ${group.diameterMm} mm`)
    .join(" · ");
  const diagramDescription =
    result.machineGeometry?.bodyWidthMm !== null &&
    result.machineGeometry?.bodyWidthMm !== undefined
      ? `Plenum ${result.machineModel}: corpo proposto ${result.machineGeometry.bodyWidthMm} × ${result.machineGeometry.bodyHeightMm} × ${result.machineGeometry.totalDepthMm} mm, collegato al raccordo macchina documentato.`
      : `Plenum ${result.machineModel ?? "macchina"}: quote dell’attacco da inserire o verificare`;
  return (
    <section className={styles.panel} aria-label="Plenum di mandata">
      <div className={styles.heading}>
        <Wind size={23} weight="duotone" aria-hidden="true" />
        <div>
          <h3>Plenum di mandata</h3>
          <p>{result.systemName}</p>
        </div>
      </div>
      <strong className={styles.summary}>
        {result.branches.length
          ? `${result.branches.length} stacchi`
          : "Configura le bocchette"}
      </strong>
      <LinearSummary project={project} systemId={systemId} />
      <p className={styles.notice}>
        {result.branches.length} attacchi richiesti;{" "}
        {result.machineGeometry?.ports.length ?? 0} attacchi con diametro
        verificato. Un plenum dedicato esclusivamente a questa macchina.
      </p>
      <label className="campo">
        <span>Stanza di posa macchina</span>
        <select
          aria-label="Stanza di posa macchina"
          value={machineRoomId}
          onChange={(e) => setMachineRoomId(e.target.value)}
        >
          {project.rooms
            .filter((r) => system?.roomIds.includes(r.id))
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
      </label>
      <button
        className="bottone piccolo"
        onClick={() =>
          commit((p) => placeDuctedMachine(p, systemId, machineRoomId))
        }
      >
        {system?.indoorUnits.length
          ? "Aggiorna posa macchina"
          : "Posiziona macchina nel progetto"}
      </button>
      <button
        className="bottone piccolo"
        onClick={() => {
          commit((p) => placeSupplyPlenum(p, systemId));
          const state = useProjectStore.getState();
          const pl = state.project?.plenums.find(
            (pl) => pl.systemId === systemId,
          );
          if (pl && !state.error) state.select({ kind: "device", id: pl.id });
        }}
      >
        {placed
          ? "Seleziona plenum nel progetto"
          : "Crea plenum dedicato nel progetto"}
      </button>
      {summary && <p className={styles.diameters}>{summary}</p>}
      {!show3D && (
        <Image
          unoptimized
          className={styles.diagram}
          width={512}
          height={312}
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(plenumDiagramSvg(result))}`}
          alt={`Schema plenum di mandata: ${result.branches.length} stacchi. ${summary || "Bocchette da configurare"}. ${diagramDescription}`}
        />
      )}
      <button
        className="bottone piccolo"
        type="button"
        onClick={() => setShow3D(!show3D)}
      >
        {show3D ? "Chiudi vista 3D plenum" : "Vista 3D plenum"}
      </button>
      {show3D && <PlenumPreview3D project={project} systemId={systemId} />}
      <p className={styles.status} role="status">
        {result.status === "ready"
          ? "Mandata e ripresa complete"
          : result.status === "unavailable"
            ? "Calcolo in attesa"
            : "Configurazione da completare"}
        {result.branches.length > 0 && " · stacchi dalle schede dei terminali"}
      </p>
      {result.pendingSupplyPoints.length > 0 && (
        <p className={styles.notice}>
          Mancano {result.pendingSupplyPoints.length} punti di mandata. Gli
          stacchi indicati si riferiscono alle bocchette già inserite.
        </p>
      )}
      {result.status !== "unavailable" && (
        <p className={styles.balance}>
          Mandata {formatNumber(result.supplyAirflowM3h, 1)} /{" "}
          {formatNumber(result.machineAirflowM3h ?? 0, 1)} m³/h
          <br />
          Ripresa separata: {result.returnTerminalCount} bocchette ·{" "}
          {formatNumber(result.returnAirflowM3h, 1)} m³/h
          {!result.returnComplete && " · da completare"}
        </p>
      )}
      <details>
        <summary>Stacchi e diametri</summary>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Ambiente / punto</th>
                <th>m³/h</th>
                <th>Ø mm</th>
                <th>m/s</th>
              </tr>
            </thead>
            <tbody>
              {result.branches.map((branch) => (
                <tr key={branch.id}>
                  <td>
                    {branch.roomName}
                    <small>
                      {branch.pointIndex === null
                        ? "Punto da verificare"
                        : `Mandata ${branch.pointIndex + 1}`}
                      {` · ${branch.terminalIds.length} ${branch.terminalIds.length === 1 ? "bocchetta" : "bocchette"}`}
                    </small>
                  </td>
                  <td>{formatNumber(branch.airflowM3h, 1)}</td>
                  <td>{branch.diameterMm ?? "Da verificare"}</td>
                  <td>
                    {branch.velocityMs === null
                      ? "—"
                      : formatNumber(branch.velocityMs, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result.issues.length > 0 && (
          <ul className={styles.issues}>
            {[...new Set(result.issues.map((issue) => issue.message))].map(
              (message) => (
                <li key={message}>{message}</li>
              ),
            )}
          </ul>
        )}
      </details>
      <details className={styles.criteria}>
        <summary>
          <SlidersHorizontal size={16} aria-hidden="true" /> Criterio proposto
        </summary>
        <label className="campo">
          <span>Velocità massima negli stacchi (m/s)</span>
          <input
            key={`${systemId}-${result.settings.maxBranchVelocityMs}`}
            type="number"
            defaultValue={result.settings.maxBranchVelocityMs}
            min={0.5}
            max={10}
            step={0.1}
            onBlur={(e) => {
              const value = Number(e.target.value);
              if (value >= 0.5 && value <= 10)
                update({ maxBranchVelocityMs: value });
              else e.target.value = String(result.settings.maxBranchVelocityMs);
            }}
          />
        </label>
        <p className={styles.balance}>
          Q / 3600 = v × π × D² / 4. Il diametro degli attacchi è quello della
          scheda; il minimo teorico è calcolato come riferimento. Velocità
          iniziale proposta: 2,5 m/s, modificabile per questo impianto.
        </p>
        {PLENUM_SOURCES.map((source) => (
          <p className={styles.source} key={source.url}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.title}
            </a>
            <br />
            {source.description}
          </p>
        ))}
        <p className={styles.notice}>
          {result.machineGeometry?.bodyWidthMm
            ? `Plenum su misura ${result.machineGeometry.bodyWidthMm} × ${result.machineGeometry.bodyHeightMm} × ${result.machineGeometry.totalDepthMm} mm, collegato all’uscita macchina documentata.`
            : "Specificare l’interfaccia di mandata della macchina per disegnare e quotare il plenum."}{" "}
          {result.machineGeometry?.inlet?.dimensionBasis ===
            "flangeMountingSpan" &&
          !result.machineGeometry.inlet.clearOpeningHeightMm
            ? "La scheda quota l’interasse/ingombro della flangia; luce libera verticale e foratura effettiva sono da verificare prima della fabbricazione."
            : "Verificare la flangia d’ingresso effettiva prima della fabbricazione."}{" "}
          Perdite di carico e rete dei condotti non sono calcolate.
        </p>
      </details>
    </section>
  );
}
