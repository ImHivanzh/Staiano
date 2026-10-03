"use client";
import { useState } from "react";
import type { Project, Room } from "@/schemas/project";
import { RadiatorPanel } from "./RadiatorPanel";
import { DuctedPanel } from "./DuctedPanel";
import { SplitPanel } from "./SplitPanel";
export function RoomSystems({
  project,
  room,
}: {
  project: Project;
  room: Room;
}) {
  const [mode, setMode] = useState<"radiator" | "ducted" | "split">(
    room.systemType === "none" ? "radiator" : room.systemType,
  );
  return (
    <section className="sistemi-stanza">
      <label className="campo">
        <span>Impianto da configurare</span>
        <select
          aria-label="Impianto da configurare"
          value={mode}
          onChange={(e) =>
            setMode(e.target.value as "radiator" | "ducted" | "split")
          }
        >
          <option value="radiator">Radiatori</option>
          <option value="ducted">Canalizzato</option>
          <option value="split">Climatizzatori split</option>
        </select>
      </label>
      {mode === "radiator" ? (
        <RadiatorPanel project={project} room={room} />
      ) : mode === "ducted" ? (
        <DuctedPanel project={project} room={room} />
      ) : (
        <SplitPanel project={project} room={room} />
      )}
    </section>
  );
}
