"use client";
import { useState } from "react";
import type { Project, Room } from "@/schemas/project";
import { createInstallation, installationLabels } from "@/domain/installations";
import { useProjectStore } from "@/stores/project-store";
import { RoomSystems } from "./RoomSystems";

export function InstallationWizard({
  project,
  rooms,
}: {
  project: Project;
  rooms: Room[];
}) {
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [activeId, setActiveId] = useState<string | null>(null);
  const { commit } = useProjectStore();
  const installations = project.installations.filter((item) =>
    rooms.some((room) => item.roomIds.includes(room.id)),
  );
  const active = project.installations.find((item) => item.id === activeId);
  const activeRoom = project.rooms.find(
    (room) => room.id === active?.roomIds[0],
  );
  return (
    <section aria-label="Impianti del progetto">
      <p>
        Aggiungi e configura un impianto per volta. Ogni impianto ha tipo e
        stanze propri; nella vista complessiva li vedrai tutti insieme.
      </p>
      {installations.map((item) => (
        <div className="formula" key={item.id}>
          <strong>
            {item.name} · {installationLabels[item.type]}
          </strong>
          <p className="nota">
            {project.rooms
              .filter((room) => item.roomIds.includes(room.id))
              .map((room) => room.name)
              .join(" · ")}
          </p>
          <button
            type="button"
            className="bottone piccolo"
            onClick={() => setActiveId(item.id)}
          >
            Configura {item.name}
          </button>
        </div>
      ))}
      {!installations.length && (
        <p className="nota">Nessun impianto. Aggiungi il primo per iniziare.</p>
      )}
      <label className="campo">
        <span>Stanza iniziale del nuovo impianto</span>
        <select
          aria-label="Stanza iniziale del nuovo impianto"
          value={roomId}
          onChange={(event) => setRoomId(event.target.value)}
        >
          {rooms
            .filter((room) => !room.conditioningExclusion)
            .map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
        </select>
      </label>
      <button
        type="button"
        className="bottone chiara"
        disabled={
          !rooms.some(
            (room) => room.id === roomId && !room.conditioningExclusion,
          )
        }
        onClick={() => {
          commit((p) => createInstallation(p, "radiator", roomId));
          const added = useProjectStore
            .getState()
            .project?.installations.at(-1);
          if (added) setActiveId(added.id);
        }}
      >
        Aggiungi impianto
      </button>
      {active && activeRoom && (
        <RoomSystems
          key={active.id}
          project={project}
          room={activeRoom}
          installationId={active.id}
          initialOpen
          onClosed={() => setActiveId(null)}
        />
      )}
    </section>
  );
}
