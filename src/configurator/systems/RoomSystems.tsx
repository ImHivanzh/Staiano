"use client";
import { useState } from "react";
import type { Project, Room } from "@/schemas/project";
import { RadiatorPanel } from "./RadiatorPanel";
import { DuctedPanel } from "./DuctedPanel";
import { SplitPanel } from "./SplitPanel";
import { FanCoilPanel } from "./FanCoilPanel";
import { HydronicPanel } from "./HydronicPanel";
import { Columns, Wind, Snowflake } from "@phosphor-icons/react";
export function RoomSystems({
  project,
  room,
}: {
  project: Project;
  room: Room;
}) {
  const [mode, setMode] = useState<"radiator" | "ducted" | "split" | "fanCoil">(
    room.systemType === "none" ? "radiator" : room.systemType,
  );
  return (
    <section className="sistemi-stanza">
      <div
        className="scelta-impianto"
        role="group"
        aria-label="Impianto da configurare"
      >
        <button
          type="button"
          aria-pressed={mode === "radiator"}
          onClick={() => setMode("radiator")}
        >
          <Columns size={23} aria-hidden="true" />
          Radiatori
        </button>
        <button
          type="button"
          aria-pressed={mode === "ducted"}
          onClick={() => setMode("ducted")}
        >
          <Wind size={23} aria-hidden="true" />
          Canalizzato
        </button>
        <button
          type="button"
          aria-pressed={mode === "fanCoil"}
          onClick={() => setMode("fanCoil")}
        >
          <Wind size={23} aria-hidden="true" />
          Ventilconvettori
        </button>
        <button
          type="button"
          aria-pressed={mode === "split"}
          onClick={() => setMode("split")}
        >
          <Snowflake size={23} aria-hidden="true" />
          Split
        </button>
      </div>
      {mode === "radiator" ? (
        <RadiatorPanel project={project} room={room} />
      ) : mode === "ducted" ? (
        <DuctedPanel project={project} room={room} />
      ) : mode === "fanCoil" ? (
        <>
          <FanCoilPanel project={project} room={room} />
          <details>
            <summary>Impianto idronico · pompa di calore</summary>
            <HydronicPanel project={project} floorId={room.floorId} />
          </details>
        </>
      ) : (
        <SplitPanel project={project} room={room} />
      )}
    </section>
  );
}
