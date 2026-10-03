"use client";
import { useState } from "react";
import type { Project, Room } from "@/schemas/project";
import { hvacCatalog, hvacProductAtVersion } from "@/domain/catalogs/hvac";
import {
  applyDuctedSystem,
  ductedRoomAllocation,
  removeHvacSystem,
} from "@/domain/ducted/apply";
import { distributeAirflow } from "@/domain/ducted/calculate";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber } from "@/utils/format";
import { RoomAirTerminals } from "./RoomAirTerminals";
export function DuctedPanel({
  project,
  room,
}: {
  project: Project;
  room: Room;
}) {
  const allocation = ductedRoomAllocation(project, room.id),
    { commit } = useProjectStore();
  const brands = [
    ...new Set(
      hvacCatalog.products
        .filter((p) => p.kind === "ducted")
        .map((p) => p.manufacturer),
    ),
  ];
  const [manufacturer, setManufacturer] = useState(
    allocation?.system.manufacturer ?? brands[0],
  );
  const [servedIds, setServedIds] = useState(
    allocation?.system.roomIds ?? [room.id],
  );
  const machine = allocation
    ? hvacProductAtVersion(
        allocation.system.productId,
        allocation.system.catalogVersion,
      )
    : null;
  return (
    <section className="pannello-canalizzato">
      <h3>Sistema canalizzato</h3>
      {room.geometryStatus === "unresolved" && (
        <p role="status" className="nota">
          Richiudere il contorno prima di dimensionare l’impianto. Apparecchi e
          configurazione salvati sono conservati.
        </p>
      )}
      <p className="nota">
        Seleziona la marca e gli ambienti serviti. Macchina scelta dal
        fabbisogno totale.
      </p>
      <label className="campo">
        <span>Marca canalizzato</span>
        <select
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
        >
          {brands.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Ambienti serviti</legend>
        {project.rooms
          .filter((r) => r.floorId === room.floorId)
          .map((r) => (
            <label className="ambiente-servito" key={r.id}>
              <input
                type="checkbox"
                disabled={r.geometryStatus === "unresolved"}
                checked={servedIds.includes(r.id)}
                onChange={(e) =>
                  setServedIds(
                    e.target.checked
                      ? [...servedIds, r.id]
                      : servedIds.filter((id) => id !== r.id),
                  )
                }
              />
              {r.name} · {formatNumber(r.designLoadW / 1000)} kW
            </label>
          ))}
      </fieldset>
      <button
        className="bottone chiara"
        disabled={
          room.geometryStatus === "unresolved" ||
          servedIds.some(
            (id) =>
              project.rooms.find((r) => r.id === id)?.geometryStatus ===
              "unresolved",
          )
        }
        onClick={() =>
          commit((p) =>
            applyDuctedSystem(
              p,
              servedIds,
              manufacturer,
              allocation?.system.id ?? null,
            ),
          )
        }
      >
        {allocation ? "Aggiorna sistema canalizzato" : "Configura canalizzato"}
      </button>
      {project.hvacSystems
        .filter((system) => system.roomIds.includes(room.id))
        .map((system) => (
          <button
            key={system.id}
            className="bottone piccolo pericolo"
            onClick={() => {
              if (
                window.confirm(
                  `Rimuovere il sistema ${system.manufacturer} e i suoi terminali?`,
                )
              )
                commit((p) => removeHvacSystem(p, system.id));
            }}
          >
            Rimuovi sistema {system.manufacturer}
          </button>
        ))}
      {machine && allocation && (
        <div className="risultato-canalizzato">
          <h3>{machine.indoorModel}</h3>
          <p className="nota">
            Abbinamento: {machine.outdoorModel}
            <br />
            Raffreddamento {formatNumber(machine.coolingCapacityW / 1000)} kW ·
            Riscaldamento {formatNumber((machine.heatingCapacityW ?? 0) / 1000)}{" "}
            kW
            <br />
            Portata macchina {formatNumber(
              allocation.system.airflowM3h!,
              1,
            )}{" "}
            m³/h · Velocità{" "}
            {machine.airflowOptions[machine.defaultAirflowIndex!].label}
            <br />
            Pressione statica {machine.staticPressurePa ?? "Non disponibile"} Pa
          </p>
          <details>
            <summary>Come è stato calcolato?</summary>
            <p className="formula">
              Portata macchina: {formatNumber(allocation.system.airflowM3h!, 1)}{" "}
              m³/h
              <br />
              Carico totale: {formatNumber(allocation.totalLoadW / 1000)} kW
              <br />
              Carico stanza: {formatNumber(room.designLoadW / 1000)} kW
              <br />
              Quota: {formatNumber(allocation.share * 100, 2)}%<br />
              Portata stanza: {formatNumber(allocation.airflowM3h, 1)} m³/h
            </p>
            {distributeAirflow(
              project.rooms.filter((r) =>
                allocation.system.roomIds.includes(r.id),
              ),
              allocation.system.airflowM3h!,
            ).map((r) => (
              <p className="nota" key={r.roomId}>
                {project.rooms.find((room) => room.id === r.roomId)?.name}:{" "}
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
          <RoomAirTerminals
            key={`${room.id}-${allocation.system.productId}`}
            project={project}
            room={room}
          />
        </div>
      )}
    </section>
  );
}
