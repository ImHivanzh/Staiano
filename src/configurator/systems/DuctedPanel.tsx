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
import { SupplyPlenumPanel } from "./SupplyPlenumPanel";
import { maximumAirflowOption } from "@/domain/catalogs/hvac-airflow";
import { ManualMachineForm } from "./ManualMachineForm";
export function DuctedPanel({
  project,
  room,
}: {
  project: Project;
  room: Room;
}) {
  const allocation = ductedRoomAllocation(project, room.id),
    savedSystem = project.hvacSystems.find(
      (s) => s.type === "ducted" && s.roomIds.includes(room.id),
    ),
    { commit } = useProjectStore();
  const brands = [
    ...new Set(
      hvacCatalog.products
        .filter((p) => p.kind === "ducted")
        .map((p) => p.manufacturer),
    ),
  ];
  const [manufacturer, setManufacturer] = useState(
    savedSystem?.manufacturer ?? brands[0],
  );
  const [servedIds, setServedIds] = useState(savedSystem?.roomIds ?? [room.id]);
  const [systemName, setSystemName] = useState(
    savedSystem?.name ?? `Zona ${room.name}`,
  );
  const machine = allocation
    ? hvacProductAtVersion(
        allocation.system.productId,
        allocation.system.catalogVersion,
      )
    : null;
  if (savedSystem?.genericMachine)
    return (
      <section className="pannello-canalizzato">
        <ManualMachineForm project={project} roomIds={savedSystem.roomIds} />
        <SupplyPlenumPanel project={project} systemId={savedSystem.id} />
        <RoomAirTerminals project={project} room={room} />
      </section>
    );
  return (
    <section className="pannello-canalizzato">
      <h3>Sistema canalizzato</h3>
      <p className="nota">
        Impianto autonomo ·{" "}
        {servedIds
          .map((id) => project.rooms.find((r) => r.id === id)?.name)
          .filter(Boolean)
          .join(", ") || "Nessun ambiente scelto"}
      </p>
      {room.geometryStatus === "unresolved" && (
        <p role="status" className="nota">
          Richiudere il contorno prima di dimensionare l’impianto. Apparecchi e
          configurazione salvati sono conservati.
        </p>
      )}
      <p className="nota">
        La macchina viene scelta dal fabbisogno degli ambienti di questa zona.
      </p>
      <label className="campo">
        <span>Nome impianto</span>
        <input
          aria-label="Nome impianto canalizzato"
          value={systemName}
          maxLength={100}
          onChange={(e) => setSystemName(e.target.value)}
        />
      </label>
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
      <details>
        <summary>Ambienti serviti · {servedIds.length}</summary>
        <fieldset>
          <legend>Ambienti serviti</legend>
          {project.rooms
            .filter((r) => r.floorId === room.floorId)
            .map((r) => {
              const otherSystem = project.hvacSystems.find(
                (s) => s.id !== savedSystem?.id && s.roomIds.includes(r.id),
              );
              return (
                <label className="ambiente-servito" key={r.id}>
                  <input
                    type="checkbox"
                    disabled={
                      r.geometryStatus === "unresolved" || !!otherSystem
                    }
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
                  {otherSystem
                    ? ` · già servita da ${otherSystem.name || otherSystem.manufacturer}`
                    : ""}
                </label>
              );
            })}
        </fieldset>
      </details>
      <button
        className="bottone chiara"
        disabled={
          room.geometryStatus === "unresolved" ||
          !servedIds.length ||
          servedIds.some(
            (id) =>
              project.rooms.find((r) => r.id === id)?.geometryStatus ===
              "unresolved",
          )
        }
        onClick={() =>
          commit((p) => {
            const updated = applyDuctedSystem(
              p,
              servedIds,
              manufacturer,
              savedSystem?.id ?? null,
            );
            const configured = updated.hvacSystems.find(
              (s) =>
                s.type === "ducted" &&
                s.roomIds.some((id) => servedIds.includes(id)),
            );
            return {
              ...updated,
              hvacSystems: updated.hvacSystems.map((s) =>
                s.id === configured?.id
                  ? { ...s, name: systemName.trim() || `Zona ${room.name}` }
                  : s,
              ),
            };
          })
        }
      >
        {savedSystem ? "Aggiorna sistema canalizzato" : "Configura canalizzato"}
      </button>
      {savedSystem && (
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
      )}
      {savedSystem && (
        <SupplyPlenumPanel project={project} systemId={savedSystem.id} />
      )}
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
            m³/h · Velocità {maximumAirflowOption(machine)?.option.label} ·
            massima
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
