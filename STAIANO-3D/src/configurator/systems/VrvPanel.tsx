"use client";
import { useState, type Ref } from "react";
import Image from "next/image";
import type { Project, Room } from "@/schemas/project";
import { vrvCatalog, vrvOutdoorAtVersion } from "@/domain/catalogs/vrv";
import { sizeVrvSystems } from "@/domain/air-conditioning/vrv-size";
import { applyVrvSystem } from "@/domain/air-conditioning/vrv-apply";
import { removeHvacSystem } from "@/domain/ducted/apply";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber } from "@/utils/format";
import styles from "./SystemConfiguration.module.css";

export function VrvPanel({
  project,
  room,
  installationId,
  onPlace,
  saveButtonRef,
  existingDeviceId,
}: {
  project: Project;
  room: Room;
  installationId?: string;
  onPlace?: (change: (project: Project) => Project) => void;
  saveButtonRef?: Ref<HTMLButtonElement>;
  existingDeviceId?: string;
}) {
  const existing = project.hvacSystems.find(
      (system) =>
        system.type === "vrv" &&
        (!existingDeviceId ||
          system.indoorUnits.some((unit) => unit.id === existingDeviceId)) &&
        system.roomIds.includes(room.id) &&
        (!installationId || system.installationId === installationId),
    ),
    { commit } = useProjectStore();
  const [roomIds, setRoomIds] = useState(
      existing?.roomIds ??
        project.installations.find((item) => item.id === installationId)
          ?.roomIds ?? [room.id],
    ),
    [outdoorId, setOutdoorId] = useState(existing?.productId ?? "");
  const solutions = sizeVrvSystems(project, roomIds, vrvCatalog),
    preview =
      solutions.find((solution) => solution.outdoor.id === outdoorId) ??
      solutions[0],
    installed = existing
      ? vrvOutdoorAtVersion(existing.productId, existing.catalogVersion)
      : null,
    outdoor = preview?.outdoor ?? installed;
  const connected = preview?.connectedCoolingW ?? null,
    ratio = preview?.connectionRatio ?? null;
  return (
    <section className={styles.panel} aria-label="Configurazione VRV/VRF">
      <header className={styles.heading}>
        <h3>VRV/VRF Daikin</h3>
        <p className="nota">
          Una unità esterna VRV con una unità interna a parete per ambiente. Il
          dimensionamento usa le capacità nominali pubblicate e il rapporto di
          connessione ammesso 50–130%.
        </p>
      </header>
      <div className={styles.layout}>
        <div className={styles.controls}>
          <h4>Modello e ambienti</h4>
          <details open>
            <summary>Ambienti climatizzati · {roomIds.length}</summary>
            <fieldset>
              <legend className="legenda-nascosta">
                Ambienti climatizzati
              </legend>
              {project.rooms.map((item) => (
                <label className="ambiente-servito" key={item.id}>
                  <input
                    type="checkbox"
                    checked={roomIds.includes(item.id)}
                    onChange={(event) =>
                      setRoomIds(
                        event.target.checked
                          ? [...roomIds, item.id]
                          : roomIds.filter((id) => id !== item.id),
                      )
                    }
                  />
                  {item.name} · {formatNumber(item.designLoadW / 1000)} kW
                </label>
              ))}
            </fieldset>
          </details>
          <label className="campo">
            <span>Serie e modello VRV</span>
            <select
              aria-label="Serie e modello VRV"
              value={preview?.outdoor.id ?? ""}
              onChange={(event) => setOutdoorId(event.target.value)}
            >
              {solutions.map((solution) => (
                <option key={solution.outdoor.id} value={solution.outdoor.id}>
                  {solution.outdoor.family} · {solution.outdoor.model} ·{" "}
                  {formatNumber(solution.outdoor.coolingW / 1000)} kW · CR{" "}
                  {formatNumber(solution.connectionRatio, 0)}%
                </option>
              ))}
            </select>
          </label>
          {solutions[0] && (
            <div className={styles.recommendation} aria-label="VRV consigliato">
              <strong>Consigliato</strong>
              <p>
                {solutions[0].outdoor.model} ·{" "}
                {solutions[0].assignments
                  .map((assignment) => assignment.indoor.model)
                  .join(" + ")}
              </p>
              <button
                type="button"
                className="bottone"
                aria-pressed={preview?.outdoor.id === solutions[0].outdoor.id}
                onClick={() => setOutdoorId(solutions[0].outdoor.id)}
              >
                Usa consigliato
              </button>
            </div>
          )}
        </div>
        <div className={styles.result}>
          <h4>
            {preview
              ? "Soluzione selezionata"
              : "Nessuna soluzione compatibile"}
          </h4>
          {existing && (
            <p className={styles.installed}>
              Sistema installato: {existing.manufacturer} ·{" "}
              {installed?.model ?? existing.productId}
            </p>
          )}
          {preview?.assignments.map((assignment) => {
            const assigned = project.rooms.find(
              (item) => item.id === assignment.roomId,
            );
            return (
              <div className={styles.product} key={assignment.roomId}>
                <Image
                  src={assignment.indoor.productPhoto.localPath}
                  alt={assignment.indoor.productPhoto.caption}
                  width={420}
                  height={210}
                  unoptimized
                />
                <div>
                  <h4>{assignment.indoor.family}</h4>
                  <p>{assignment.indoor.model}</p>
                  <p>{assigned?.name}</p>
                </div>
              </div>
            );
          })}
          {!preview && (
            <p role="status" className="nota">
              COMPATIBILITÀ NON VERIFICABILE oppure capacità/dimensioni
              insufficienti: nessun abbinamento VRV automatico disponibile per
              questa selezione. Non vengono create unità con dati stimati.
            </p>
          )}
          {preview && outdoor && (
            <>
              <p className="nota">VRV/VRF · Unità esterna {outdoor.model}</p>
              <dl className={styles.facts}>
                <div>
                  <dt>Raffrescamento esterno</dt>
                  <dd>{formatNumber(outdoor.coolingW / 1000)} kW</dd>
                </div>
                <div>
                  <dt>Riscaldamento esterno</dt>
                  <dd>{formatNumber(outdoor.heatingW / 1000)} kW</dd>
                </div>
                <div>
                  <dt>Rapporto di connessione</dt>
                  <dd>{formatNumber(ratio ?? 0, 0)}%</dd>
                </div>
                <div>
                  <dt>Capacità collegata</dt>
                  <dd>
                    {connected === null
                      ? "Non disponibile"
                      : `${formatNumber(connected / 1000)} kW`}
                  </dd>
                </div>
              </dl>
            </>
          )}
          <button
            className="bottone chiara"
            disabled={!preview}
            ref={saveButtonRef}
            hidden={!!saveButtonRef}
            style={saveButtonRef ? { display: "none" } : undefined}
            onClick={() =>
              (onPlace ?? commit)((project) =>
                applyVrvSystem(
                  project,
                  roomIds,
                  existing?.id ?? null,
                  preview?.outdoor.id,
                  installationId,
                ),
              )
            }
          >
            {existing ? "Aggiorna VRV/VRF" : "Configura VRV/VRF"}
          </button>
          {existing && !saveButtonRef && (
            <button
              className="bottone piccolo pericolo"
              onClick={() => {
                if (
                  window.confirm(
                    "Rimuovere il sistema VRV/VRF e le sue unità interne?",
                  )
                )
                  commit((project) => removeHvacSystem(project, existing.id));
              }}
            >
              Rimuovi sistema VRV/VRF
            </button>
          )}
          {preview && (
            <details>
              <summary>Dettagli tecnici e calcolo</summary>
              <p className="nota">
                Capacità per ambiente = capacità nominale pubblicata dell’unità
                interna. La somma delle capacità collegate è confrontata con il
                rapporto di connessione dichiarato dall’unità esterna; non viene
                dichiarata una capacità simultanea a carico parziale.
              </p>
              {preview.assignments.map((assignment) => (
                <p className="nota" key={assignment.roomId}>
                  {
                    project.rooms.find((item) => item.id === assignment.roomId)
                      ?.name
                  }{" "}
                  · {assignment.indoor.model} ·{" "}
                  {formatNumber(assignment.coolingW / 1000)} kW freddo ·{" "}
                  {formatNumber(assignment.heatingW / 1000)} kW caldo
                </p>
              ))}
              <p className="nota">
                Rapporto di connessione ammesso {outdoor?.minConnectionRatio}–
                {outdoor?.maxConnectionRatio}%. Unità interne a parete FXAA-A;
                cassette e canalizzate VRV non sono ancora selezionabili.
              </p>
              <a
                className="fonte-catalogo"
                href={outdoor?.sourceMetadata.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Catalogo ufficiale · pagina {outdoor?.sourceMetadata.page}
              </a>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}
