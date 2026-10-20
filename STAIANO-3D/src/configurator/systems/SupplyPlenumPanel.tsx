"use client";
import { Wind, SlidersHorizontal } from "@phosphor-icons/react";
import { useState } from "react";
import Image from "next/image";
import { PlenumPreview3D } from "@/configurator/viewer3d/PlenumPreview3D";
import type { Project } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber, numberFromForm } from "@/utils/format";
import {
  calculatePlenum,
  PLENUM_SOURCES,
  type PlenumSettings,
} from "@/domain/ducted/plenum";
import {
  plenumBranchGroups,
  plenumDiagramSvg,
} from "@/domain/ducted/plenum-diagram";
import { placeDuctedMachine, placePlenum } from "@/domain/ducted/placement";
import { LinearSummary } from "./OperatorTerminalControls";
import styles from "./SupplyPlenumPanel.module.css";

export function SupplyPlenumPanel({
  project,
  systemId,
  onPlaced,
}: {
  project: Project;
  systemId: string;
  /** Dopo aver creato o selezionato il plenum: chiudi i pannelli e mostra la pianta. */
  onPlaced?: () => void;
}) {
  const [use, setUse] = useState<"supply" | "return">("supply");
  const result = calculatePlenum(project, systemId, use);
  const [show3D, setShow3D] = useState(false);
  const [grouped, setGrouped] = useState(true);
  const groups = plenumBranchGroups(result.branches);
  const { commit } = useProjectStore();
  const placed = project.plenums.find(
    (pl) => pl.systemId === systemId && pl.use === use,
  );
  const system = project.hvacSystems.find((s) => s.id === systemId);
  const returnConnection = system?.returnConnection;
  const supplyPlenum = project.plenums.find(
    (pl) => pl.systemId === systemId && pl.use === "supply",
  );
  const returnPlenum = project.plenums.find(
    (pl) => pl.systemId === systemId && pl.use === "return",
  );
  const [machineRoomId, setMachineRoomId] = useState(
    system?.indoorUnits[0]?.roomId ?? system?.roomIds[0] ?? "",
  );
  const update = (patch: Partial<PlenumSettings>) =>
    commit((p) => ({
      ...p,
      hvacSystems: p.hvacSystems.map((s) =>
        s.id === systemId
          ? { ...s, plenumSettings: { ...result.settings, ...patch } }
          : s,
      ),
    }));
  const summary = result.groupedDiameters
    .map((group) => `${group.quantity} × Ø ${group.diameterMm} mm`)
    .join(" · ");
  const geometry = result.machineGeometry;
  const side = use === "supply" ? "mandata" : "ripresa";
  const diagramDescription =
    geometry?.bodyWidthMm != null
      ? `Plenum di ${side} ${result.machineModel}: corpo proposto ${geometry.bodyWidthMm} × ${geometry.bodyHeightMm} × ${geometry.totalDepthMm} mm, collegato al raccordo macchina dichiarato.`
      : `Plenum di ${side} ${result.machineModel ?? "macchina"}: quote dell’attacco da inserire o verificare`;

  return (
    <section
      className={styles.panel}
      aria-label={use === "supply" ? "Plenum di mandata" : "Plenum di ripresa"}
    >
      <header className={styles.heading}>
        <Wind size={22} aria-hidden="true" />
        <div>
          <h3>
            {use === "supply" ? "Plenum di mandata" : "Plenum di ripresa"}
          </h3>
          <p>{result.systemName}</p>
        </div>
        <span
          className={styles.status}
          data-ready={result.status === "ready"}
          role="status"
        >
          {result.status === "ready"
            ? use === "supply"
              ? "Mandata completa"
              : "Ripresa completa"
            : result.status === "unavailable"
              ? "Calcolo in attesa"
              : "Configurazione da completare"}
        </span>
      </header>
      <div className={styles.actions} role="group" aria-label="Lato del plenum">
        <button
          type="button"
          className="bottone piccolo tenue"
          aria-pressed={use === "supply"}
          onClick={() => setUse("supply")}
        >
          Plenum di mandata
        </button>
        <button
          type="button"
          className="bottone piccolo tenue"
          aria-pressed={use === "return"}
          onClick={() => setUse("return")}
        >
          Plenum di ripresa
        </button>
      </div>
      <dl className={styles.metrics}>
        <div>
          <dt>Attacchi richiesti</dt>
          <dd>
            <strong>{result.branches.length} stacchi</strong>
          </dd>
        </div>
        <div>
          <dt>Diametri verificati</dt>
          <dd>
            {geometry?.ports.length ?? 0} / {result.branches.length}
          </dd>
        </div>
        <div>
          <dt>Portata {use === "supply" ? "mandata" : "ripresa"}</dt>
          <dd>
            {formatNumber(
              use === "supply"
                ? result.supplyAirflowM3h
                : result.returnAirflowM3h,
              1,
            )}{" "}
            m³/h
          </dd>
        </div>
      </dl>
      {result.branches.length > 0 && (
        <div
          className={styles.actions}
          role="group"
          aria-label="Visualizzazione stacchi"
        >
          <button
            type="button"
            className="bottone piccolo tenue"
            aria-pressed={grouped}
            onClick={() => setGrouped(true)}
          >
            Vista raggruppata
          </button>
          <button
            type="button"
            className="bottone piccolo tenue"
            aria-pressed={!grouped}
            onClick={() => setGrouped(false)}
          >
            Dettaglio singoli stacchi
          </button>
        </div>
      )}
      {result.status !== "ready" && result.issues.length > 0 && (
        <div className={styles.nextSteps} aria-label="Da completare nel plenum">
          <strong>Da completare</strong>
          <ul>
            {result.issues.slice(0, 2).map((issue, index) => (
              <li key={`${issue.code}-${index}`}>{issue.message}</li>
            ))}
          </ul>
          <p>
            Completa mandata e ripresa nelle bocchette; verifica gli attacchi
            nei dettagli.
          </p>
        </div>
      )}
      <div className={styles.body}>
        <div className={styles.visual}>
          {!result.branches.length ? (
            <div className={styles.empty}>
              <Wind size={28} aria-hidden="true" />
              <h4>Prima aggiungi le bocchette di {side}</h4>
              <p>
                Il numero e il diametro degli attacchi derivano dalle bocchette
                di {side} inserite.
              </p>
            </div>
          ) : (
            <>
              <p className={styles.diameters}>
                {summary || "Diametri da verificare"}
              </p>
              {!show3D && (
                <Image
                  unoptimized
                  className={styles.diagram}
                  width={512}
                  height={312}
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(plenumDiagramSvg(result, grouped))}`}
                  alt={`Schema plenum di ${side}: ${result.branches.length} stacchi. ${summary || "Bocchette da configurare"}. ${diagramDescription}`}
                />
              )}
            </>
          )}
          {use === "supply" && (
            <button
              className="bottone piccolo"
              type="button"
              aria-pressed={show3D}
              onClick={() => setShow3D(!show3D)}
            >
              {show3D ? "Chiudi vista 3D plenum" : "Vista 3D plenum"}
            </button>
          )}
          {show3D && use === "supply" && (
            <PlenumPreview3D
              project={project}
              systemId={systemId}
              grouped={grouped}
            />
          )}
        </div>
        <div className={styles.setup}>
          <h4>Posa nel progetto</h4>
          <p className={styles.hint}>
            Un plenum per la mandata e uno per la ripresa, dedicati a questa
            macchina. La ripresa si colloca dal lato opposto della macchina.
          </p>
          <div
            className={styles.actions}
            role="group"
            aria-label="Plenums della macchina"
          >
            <button
              type="button"
              className="bottone piccolo tenue"
              aria-pressed={!!supplyPlenum}
              onClick={() => setUse("supply")}
            >
              Mandata {supplyPlenum ? "· creata" : "· da creare"}
            </button>
            <button
              type="button"
              className="bottone piccolo tenue"
              aria-pressed={!!returnPlenum}
              onClick={() => setUse("return")}
            >
              Ripresa {returnPlenum ? "· creata" : "· da creare"}
            </button>
          </div>
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
          <div className={styles.actions}>
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
              className="bottone piccolo chiara"
              onClick={() => {
                commit((p) => placePlenum(p, systemId, use));
                const state = useProjectStore.getState();
                const pl = state.project?.plenums.find(
                  (item) => item.systemId === systemId && item.use === use,
                );
                if (pl && !state.error) {
                  state.select({ kind: "device", id: pl.id });
                  onPlaced?.();
                }
              }}
            >
              {placed
                ? `Seleziona plenum di ${side} nel progetto`
                : `Crea plenum di ${side} nel progetto`}
            </button>
          </div>
          {use === "return" && (
            <form
              key={`${systemId}-${returnConnection?.connectionWidthMm ?? ""}-${returnConnection?.connectionHeightMm ?? ""}`}
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const connectionWidthMm = numberFromForm(
                  data.get("returnWidthMm"),
                );
                const connectionHeightMm = numberFromForm(
                  data.get("returnHeightMm"),
                );
                commit((p) => ({
                  ...p,
                  hvacSystems: p.hvacSystems.map((s) =>
                    s.id === systemId
                      ? {
                          ...s,
                          returnConnection: {
                            connectionWidthMm,
                            connectionHeightMm,
                            dimensionBasis: "ductOpening" as const,
                          },
                        }
                      : s,
                  ),
                }));
              }}
            >
              <fieldset>
                <legend>Attacco di ripresa dichiarato</legend>
                <p className={styles.hint}>
                  Quote dell’attacco di ripresa della macchina, come pubblicate
                  o rilevate: servono per quotare il plenum. Nessuna misura è
                  dedotta dall’ingombro.
                </p>
                <label className="campo">
                  <span>Larghezza attacco ripresa (mm)</span>
                  <input
                    type="number"
                    name="returnWidthMm"
                    min="1"
                    step="1"
                    required
                    defaultValue={
                      returnConnection?.connectionWidthMm ?? undefined
                    }
                  />
                </label>
                <label className="campo">
                  <span>Altezza attacco ripresa (mm)</span>
                  <input
                    type="number"
                    name="returnHeightMm"
                    min="1"
                    step="1"
                    required
                    defaultValue={
                      returnConnection?.connectionHeightMm ?? undefined
                    }
                  />
                </label>
                <button type="submit" className="bottone piccolo">
                  Salva attacco di ripresa
                </button>
              </fieldset>
            </form>
          )}
          <div className={styles.checks} aria-label="Verifiche del plenum">
            <p>
              <strong>Mandata</strong>
              <span>
                {formatNumber(result.supplyAirflowM3h, 1)} /{" "}
                {result.machineAirflowM3h === null
                  ? "—"
                  : formatNumber(result.machineAirflowM3h, 1)}{" "}
                m³/h
                {!result.supplyComplete && " · da completare"}
              </span>
            </p>
            <p>
              <strong>Ripresa</strong>
              <span>
                {result.returnTerminalCount} bocchette ·{" "}
                {formatNumber(result.returnAirflowM3h, 1)} m³/h
                {!result.returnComplete && " · da completare"}
              </span>
            </p>
          </div>
          {result.pendingSupplyPoints.length > 0 && use === "supply" && (
            <p className={styles.notice}>
              Mancano {result.pendingSupplyPoints.length} punti di mandata. Gli
              stacchi mostrati appartengono alle bocchette già inserite.
            </p>
          )}
          {result.pendingReturnPoints.length > 0 && use === "return" && (
            <p className={styles.notice}>
              Mancano {result.pendingReturnPoints.length} punti di ripresa. Gli
              stacchi mostrati appartengono alle bocchette già inserite.
            </p>
          )}
          {result.branches.length > 0 && !geometry?.bodyWidthMm && (
            <p className={styles.notice}>
              {use === "supply"
                ? "Attacco macchina da specificare prima di quotare il plenum."
                : "Raccordo di ripresa della macchina da dichiarare prima di quotare il plenum."}
            </p>
          )}
          <p className={styles.hint}>
            Schema indicativo. Quote, flangia e perdite di carico da verificare.
          </p>
        </div>
      </div>
      <details className={styles.disclosure}>
        <summary>
          Stacchi e diametri <span>{result.branches.length} attacchi</span>
        </summary>
        {result.branches.length ? (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  {grouped ? (
                    <>
                      <th>Stacchi</th>
                      <th>Portata totale m³/h</th>
                      <th>Diametri verificati</th>
                    </>
                  ) : (
                    <>
                      <th>Ambiente / punto</th>
                      <th>m³/h</th>
                      <th>Ø mm</th>
                      <th>m/s</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {grouped
                  ? groups.map((branches) => (
                      <tr key={branches[0].id}>
                        <td>
                          {branches.length} ×{" "}
                          {branches[0].diameterMm === null
                            ? "Ø da verificare"
                            : `Ø ${branches[0].diameterMm} mm`}
                        </td>
                        <td>
                          {formatNumber(
                            branches.reduce(
                              (sum, branch) => sum + branch.airflowM3h,
                              0,
                            ),
                            1,
                          )}
                        </td>
                        <td>
                          {branches.filter((branch) => branch.verified).length}{" "}
                          / {branches.length}
                        </td>
                      </tr>
                    ))
                  : result.branches.map((branch) => (
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
        ) : (
          <p className={styles.hint}>
            Nessun attacco: aggiungi le bocchette di mandata.
          </p>
        )}
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
      <details className={styles.disclosure}>
        <summary>Bilancio bocchette per ambiente</summary>
        <LinearSummary project={project} systemId={systemId} />
      </details>
      <details className={styles.disclosure}>
        <summary>
          <SlidersHorizontal size={16} aria-hidden="true" /> Criterio proposto e
          fonti
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
        <p className={styles.hint}>
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
          {geometry?.bodyWidthMm
            ? `Plenum su misura ${geometry.bodyWidthMm} × ${geometry.bodyHeightMm} × ${geometry.totalDepthMm} mm, collegato all’uscita macchina documentata.`
            : "Specificare l’interfaccia di mandata della macchina per disegnare e quotare il plenum."}{" "}
          {geometry?.inlet?.dimensionBasis === "flangeMountingSpan" &&
          !geometry.inlet.clearOpeningHeightMm
            ? "La scheda quota l’interasse/ingombro della flangia; luce libera verticale e foratura effettiva sono da verificare prima della fabbricazione."
            : "Verificare la flangia d’ingresso effettiva prima della fabbricazione."}{" "}
          Perdite di carico e rete dei condotti non sono calcolate.
        </p>
      </details>
    </section>
  );
}
