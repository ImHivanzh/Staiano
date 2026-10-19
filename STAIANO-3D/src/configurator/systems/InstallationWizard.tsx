"use client";
import type { Project, Room } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";

export function InstallationWizard({
  project,
  rooms,
}: {
  project: Project;
  rooms: Room[];
}) {
  const machines = project.hvacSystems.filter(
    (system) =>
      system.roomIds.some((id) => rooms.some((room) => room.id === id)) ||
      system.indoorUnits.some((unit) =>
        rooms.some((room) => room.floorId === unit.floorId),
      ),
  );
  const roomIds = new Set(rooms.map((room) => room.id));
  const radiators = project.radiators.filter((device) =>
    roomIds.has(device.roomId),
  );
  const fanCoils = (project.fanCoils ?? []).filter((device) =>
    roomIds.has(device.roomId),
  );
  const roomsWithDevices = rooms.filter(
    (room) =>
      radiators.some((device) => device.roomId === room.id) ||
      fanCoils.some((device) => device.roomId === room.id),
  );
  function place(planPlacementTool: "machine" | "radiator") {
    useProjectStore.getState().setView("2d");
    useProjectStore.setState({
      planPlacementTool,
      tool: "select",
      selection: [],
    });
  }
  return (
    <section aria-label="Impianti del progetto">
      <p>
        Macchine, radiatori e ventilconvettori sono gli impianti del progetto.
        Inseriscili sulla pianta e cliccali per configurarli.
      </p>
      <div className="scelta-partenza">
        <button
          className="bottone pieno"
          disabled={!rooms.length}
          onClick={() => place("machine")}
        >
          Inserisci macchina sulla pianta
        </button>
        <button
          className="bottone"
          disabled={!rooms.length}
          onClick={() => place("radiator")}
        >
          Inserisci radiatore sulla pianta
        </button>
      </div>
      {machines.map((machine) => (
        <div className="formula" key={machine.id}>
          <strong>
            {machine.name ||
              `${machine.manufacturer} · ${machine.type === "ducted" ? "Canalizzato" : "Split"}`}
          </strong>
          <p className="nota">
            {project.rooms
              .filter((room) => machine.roomIds.includes(room.id))
              .map((room) => room.name)
              .join(" · ") ||
              "Collega le bocchette: gli ambienti serviti si aggiornano automaticamente."}
          </p>
          <button
            className="bottone piccolo"
            onClick={() => {
              if (machine.installationId)
                useProjectStore
                  .getState()
                  .openInstallationPlan(machine.installationId);
              const unit = machine.indoorUnits[0];
              if (unit)
                useProjectStore
                  .getState()
                  .select({ kind: "device", id: unit.id });
            }}
          >
            Seleziona macchina
          </button>
        </div>
      ))}
      {roomsWithDevices.map((room) => {
        const roomRadiators = radiators.filter(
          (device) => device.roomId === room.id,
        );
        const roomFanCoils = fanCoils.filter(
          (device) => device.roomId === room.id,
        );
        const outputW = roomRadiators.reduce(
          (sum, device) => sum + device.outputW,
          0,
        );
        return (
          <div className="formula" key={room.id}>
            <strong>{room.name}</strong>
            <p className="nota">
              {roomRadiators.length
                ? `${roomRadiators.length} ${roomRadiators.length === 1 ? "radiatore" : "radiatori"} · ${Math.round(outputW)} W`
                : ""}
              {roomRadiators.length && roomFanCoils.length ? " · " : ""}
              {roomFanCoils.length
                ? `${roomFanCoils.length} ${roomFanCoils.length === 1 ? "ventilconvettore" : "ventilconvettori"}`
                : ""}
            </p>
            <button
              className="bottone piccolo"
              onClick={() => {
                const store = useProjectStore.getState();
                store.setView("2d");
                store.setFloor(room.floorId);
                store.select({ kind: "room", id: room.id });
              }}
            >
              Vai alla stanza
            </button>
          </div>
        );
      })}
      {!machines.length && !roomsWithDevices.length && (
        <p className="nota">Nessun impianto inserito.</p>
      )}
    </section>
  );
}
