"use client";
import type { Project, Room } from "@/schemas/project";
import { hvacProductAtVersion } from "@/domain/catalogs/hvac";
import { ductedRoomAllocation, removeHvacSystem } from "@/domain/ducted/apply";
import { distributeAirflow } from "@/domain/ducted/calculate";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber } from "@/utils/format";
import { RoomAirTerminals } from "./RoomAirTerminals";
import { SupplyPlenumPanel } from "./SupplyPlenumPanel";
import { maximumAirflowOption } from "@/domain/catalogs/hvac-airflow";
import { DuctedMachinePicker } from "./DuctedMachinePicker";
import styles from "./DuctedPanel.module.css";

export function DuctedPanel({
  project,
  room,
  installationId,
}: {
  project: Project;
  room: Room;
  installationId?: string;
}) {
  const allocation = ductedRoomAllocation(project, room.id, installationId);
  const savedSystem = project.hvacSystems.find(
    (s) =>
      s.type === "ducted" &&
      s.roomIds.includes(room.id) &&
      (!installationId || s.installationId === installationId),
  );
  const machine = savedSystem
    ? hvacProductAtVersion(savedSystem.productId, savedSystem.catalogVersion)
    : null;
  const { commit } = useProjectStore();
  const model = savedSystem?.genericMachine?.model ?? machine?.indoorModel;

  return (
    <section className={styles.panel} aria-label="Sistema canalizzato">
      <div className={styles.machine}>
        <div>
          <h3>{model ?? "Scegli la macchina canalizzata"}</h3>
          <p>
            {savedSystem
              ? `${savedSystem.manufacturer} · ${savedSystem.name || "Sistema canalizzato"}`
              : "La portata della macchina determina le bocchette da installare."}
          </p>
          {savedSystem && (
            <dl className={styles.facts}>
              <div>
                <dt>Portata macchina</dt>
                <dd>
                  {formatNumber(
                    allocation?.system.airflowM3h ??
                      savedSystem.genericMachine?.maxAirflowM3h ??
                      0,
                  )}{" "}
                  m³/h
                </dd>
              </div>
              <div>
                <dt>Ambienti serviti</dt>
                <dd>
                  {project.rooms
                    .filter((item) => savedSystem.roomIds.includes(item.id))
                    .map((item) => item.name)
                    .join(" · ")}
                </dd>
              </div>
              {machine && (
                <div>
                  <dt>Potenza freddo / caldo</dt>
                  <dd>
                    {formatNumber(machine.coolingCapacityW / 1000)} /{" "}
                    {formatNumber((machine.heatingCapacityW ?? 0) / 1000)} kW
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
        <DuctedMachinePicker
          project={project}
          room={room}
          installationId={installationId}
        />
      </div>
      {room.geometryStatus === "unresolved" && (
        <p role="status" className="avviso attenzione">
          Richiudere il contorno prima di dimensionare l’impianto. Apparecchi e
          configurazione salvati sono conservati.
        </p>
      )}
      {savedSystem && (
        <>
          <div className={styles.workspace}>
            <RoomAirTerminals
              key={`terminals-${savedSystem.id}`}
              project={project}
              room={room}
              installationId={installationId}
            />
            <SupplyPlenumPanel
              key={`plenum-${savedSystem.id}`}
              project={project}
              systemId={savedSystem.id}
            />
          </div>
          <div className={styles.footer}>
            {machine && allocation && (
              <details>
                <summary>Dati macchina e ripartizione della portata</summary>
                <p className="nota">
                  Abbinamento: {machine.outdoorModel}
                  <br />
                  Pressione statica{" "}
                  {machine.staticPressurePa ?? "Non disponibile"} Pa · Velocità{" "}
                  {maximumAirflowOption(machine)?.option.label} · massima
                  <br />
                  Carico totale {formatNumber(allocation.totalLoadW / 1000)} kW
                  · Quota stanza {formatNumber(allocation.share * 100, 2)}%
                  <br />
                  Portata stanza {formatNumber(allocation.airflowM3h, 1)} m³/h
                </p>
                {distributeAirflow(
                  project.rooms.filter(
                    (r) =>
                      savedSystem.roomIds.includes(r.id) &&
                      !r.conditioningExclusion,
                  ),
                  allocation.system.airflowM3h!,
                ).map((r) => (
                  <p className="nota" key={r.roomId}>
                    {project.rooms.find((item) => item.id === r.roomId)?.name}:{" "}
                    {formatNumber(r.airflowM3h, 1)} m³/h
                  </p>
                ))}
                <p className="nota">{machine.technicalNotes}</p>
                <a
                  href={machine.sourceMetadata.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="fonte-catalogo"
                >
                  Scheda ufficiale produttore
                </a>
              </details>
            )}
            <button
              className="bottone piccolo pericolo"
              onClick={() => {
                if (
                  window.confirm(
                    `Rimuovere ${savedSystem.name || savedSystem.manufacturer} e i suoi terminali?`,
                  )
                )
                  commit((p) => removeHvacSystem(p, savedSystem.id));
              }}
            >
              Rimuovi questo impianto
            </button>
          </div>
        </>
      )}
    </section>
  );
}
