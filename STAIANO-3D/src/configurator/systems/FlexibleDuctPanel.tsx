"use client";
import type { Project } from "@/schemas/project";
import {
  addDuctWaypoint,
  ductLength,
  ductRoute,
  generateDuctRoutes,
  removeDuctWaypoint,
  setDuctKind,
} from "@/domain/ducted/routes";
import { useProjectStore } from "@/stores/project-store";
import { deviceCodes } from "@/services/export/device-codes";
import { formatNumber } from "@/utils/format";
import styles from "./FlexibleDuctPanel.module.css";

export function FlexibleDuctPanel({
  project,
  floorId,
  onEdit3D,
}: {
  project: Project;
  floorId: string;
  onEdit3D: (ductId: string) => void;
}) {
  const { commit } = useProjectStore();
  const codes = deviceCodes(project);
  const ducts = (project.ducts ?? []).filter((duct) =>
    project.plenums.some(
      (plenum) => plenum.id === duct.plenumId && plenum.floorId === floorId,
    ),
  );
  const systems = project.hvacSystems.filter(
    (system) => system.type === "ducted",
  );
  return (
    <section className={styles.panel} aria-label="Configurazione flessibili">
      <p className="nota">
        Clicca un tubo in 3D per selezionarlo, fai doppio clic sul tubo per
        aggiungere una curva e trascina i punti. Qui sotto puoi cambiare il
        tipo, aggiungere o togliere curve.
      </p>
      {!ducts.length && (
        <p className="nota">
          Nessun canale in questo piano. Usa «Configura percorsi» o genera i
          percorsi proposti.
        </p>
      )}
      <div className={styles.systems}>
        {systems.map((system) => {
          const rows = ducts.filter((duct) => duct.systemId === system.id);
          const canGenerate = project.plenums.some(
            (plenum) =>
              plenum.systemId === system.id &&
              plenum.use === "supply" &&
              plenum.attachmentId === undefined,
          );
          if (!rows.length && !canGenerate) return null;
          return (
            <details key={system.id} className={styles.system} open>
              <summary>
                {codes.get(system.id) ?? system.name ?? "Macchina"} ·{" "}
                {rows.length} {rows.length === 1 ? "ramo" : "rami"}
              </summary>
              <div className={styles.rows}>
                {rows.map((duct) => {
                  const points = ductRoute(project, duct);
                  return (
                    <article key={duct.id} className={styles.row}>
                      <div className={styles.rowHeader}>
                        <strong>{codes.get(duct.id) ?? "Canale"}</strong>
                        <span className={styles.endpoint}>
                          {duct.terminalId
                            ? codes.get(duct.terminalId)
                            : "Macchina → plenum"}
                        </span>
                        <span className={styles.badge} data-kind={duct.kind}>
                          {duct.kind === "flexible" ? "Flessibile" : "Rigido"}
                        </span>
                        <span className={styles.length}>
                          {formatNumber(ductLength(points))} m ·{" "}
                          {duct.waypoints.length}{" "}
                          {duct.waypoints.length === 1 ? "curva" : "curve"}
                        </span>
                      </div>
                      <div className={styles.actions}>
                        <label className={styles.type}>
                          <span>Tipo</span>
                          <select
                            aria-label={`Tipo del canale ${codes.get(duct.id) ?? duct.id}`}
                            value={duct.kind}
                            disabled={duct.locked}
                            onChange={(event) =>
                              commit((p) =>
                                setDuctKind(
                                  p,
                                  duct.id,
                                  event.target.value as "rigid" | "flexible",
                                ),
                              )
                            }
                          >
                            <option value="rigid">Rigido</option>
                            <option value="flexible">Flessibile</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          className="bottone piccolo"
                          disabled={duct.locked}
                          onClick={() =>
                            commit((p) => addDuctWaypoint(p, duct.id).project)
                          }
                        >
                          Aggiungi curva
                        </button>
                        <button
                          type="button"
                          className="bottone piccolo chiara"
                          disabled={duct.locked}
                          onClick={() => onEdit3D(duct.id)}
                        >
                          Modifica in 3D
                        </button>
                      </div>
                      {duct.waypoints.length > 0 && (
                        <div className={styles.points}>
                          {duct.waypoints.map((point, index) => (
                            <span key={index} className={styles.point}>
                              Curva {index + 1} ·{" "}
                              {formatNumber(point.elevationM)} m
                              <button
                                type="button"
                                aria-label={`Rimuovi curva ${index + 1}`}
                                disabled={duct.locked}
                                onClick={() =>
                                  commit((p) =>
                                    removeDuctWaypoint(p, duct.id, index),
                                  )
                                }
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
                {!rows.length && canGenerate && (
                  <button
                    type="button"
                    className="bottone piccolo"
                    onClick={() =>
                      commit((p) => generateDuctRoutes(p, system.id))
                    }
                  >
                    Genera percorsi proposti
                  </button>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
