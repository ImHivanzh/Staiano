"use client";
import type { Project, Room } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";

/** Catalogs and older entry points share the same plan workflow. */
export function DuctedPanel({
  room,
  onOpened,
}: {
  project: Project;
  room: Room;
  installationId?: string;
  onOpened?: () => void;
}) {
  return (
    <section aria-label="Sistema canalizzato">
      <p>
        Inserisci macchina e bocchette sulla planimetria 2D. Clicca gli elementi
        con Collega, poi clicca la macchina per configurarla e infine configura
        le bocchette.
      </p>
      <button
        className="bottone pieno"
        onClick={() => {
          useProjectStore.getState().setView("2d");
          useProjectStore.getState().setFloor(room.floorId);
          useProjectStore.setState({
            planPlacementTool: "machine",
            tool: "select",
            selection: [],
          });
          onOpened?.();
        }}
      >
        Configura sulla pianta principale
      </button>
    </section>
  );
}
