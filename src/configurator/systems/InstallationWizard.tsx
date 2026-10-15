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
  const machines = project.hvacSystems.filter((system) =>
    system.roomIds.some((id) => rooms.some((room) => room.id === id)) ||
    system.indoorUnits.some((unit) => rooms.some((room) => room.floorId === unit.floorId)),
  );
  return (
    <section aria-label="Impianti del progetto">
      <p>
        Ogni macchina è un impianto. Inserisci gli apparecchi sulla pianta e
        cliccali per configurarli.
      </p>
      <button
        className="bottone pieno"
        disabled={!rooms.length}
        onClick={() => {
          useProjectStore.getState().setView("2d");
          useProjectStore.setState({
            planPlacementTool: "machine",
            tool: "select",
            selection: [],
          });
        }}
      >
        Inserisci macchina sulla pianta
      </button>
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
              .join(" · ") || "Collega le bocchette: gli ambienti serviti si aggiornano automaticamente."}
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
      {!machines.length && <p className="nota">Nessuna macchina inserita.</p>}
    </section>
  );
}
