"use client";
import type { Project, Room } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";

export function RoomSystems({ room }: { project: Project; room: Room }) {
  if (room.conditioningExclusion)
    return (
      <p className="nota">
        Ambiente non climatizzato: {room.conditioningExclusion.reason}.
      </p>
    );
  return (
    <section aria-label="Apparecchi della stanza">
      <p className="nota">
        Inserisci gli apparecchi sulla pianta. Ogni macchina crea il proprio
        impianto.
      </p>
      <button
        className="bottone chiara"
        onClick={() => {
          useProjectStore.getState().setView("2d");
          useProjectStore.getState().setFloor(room.floorId);
          useProjectStore.getState().select({ kind: "room", id: room.id });
        }}
      >
        Lavora sulla pianta
      </button>
    </section>
  );
}
