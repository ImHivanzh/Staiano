"use client";
import type { Project } from "@/schemas/project";
import {
  splitIndoorAtVersion,
  splitCombinationAtVersion,
} from "@/domain/catalogs/splits";
import { splitCenterElevationM } from "@/domain/air-conditioning/elevation";
import { useProjectStore } from "@/stores/project-store";
import { movePlacedDevice } from "@/domain/geometry/move-device";
import {
  positionAlongRoomWall,
  roomWallSpan,
} from "@/domain/geometry/placement";
import { formatNumber, numberFromForm } from "@/utils/format";
export function SplitProperties({
  project,
  id,
}: {
  project: Project;
  id: string;
}) {
  const { commit } = useProjectStore(),
    system = project.hvacSystems.find((s) =>
      s.indoorUnits.some((u) => u.id === id),
    ),
    unit = system?.indoorUnits.find((u) => u.id === id);
  if (!unit || !system) return null;
  const room = project.rooms.find((r) => r.id === unit.roomId),
    model = splitIndoorAtVersion(unit.productId, unit.catalogVersion),
    combination = splitCombinationAtVersion(
      system.productId,
      system.catalogVersion,
    );
  if (!room) return null;
  const slot = system.indoorUnits.findIndex((u) => u.id === id);
  return (
    <div className="corpo-proprieta">
      <h3>{model?.model ?? unit.productId}</h3>
      <p>
        {room.name} · {system.manufacturer}
      </p>
      <p className="nota">
        Combinazione {combination?.outdoorModel ?? "non verificabile"}
        <br />
        Capacità simultanea:{" "}
        {combination?.indoorCoolingW[slot] === null
          ? "non disponibile"
          : formatNumber((combination?.indoorCoolingW[slot] ?? 0) / 1000)}{" "}
        kW freddo ·{" "}
        {combination?.indoorHeatingW[slot] === null
          ? "non disponibile"
          : formatNumber((combination?.indoorHeatingW[slot] ?? 0) / 1000)}{" "}
        kW caldo
      </p>
      <p className="nota">
        Ingombro {unit.widthMm}×{unit.heightMm}×{unit.depthMm} mm.
        <br />
        Quota centro {formatNumber(splitCenterElevationM(room, unit))} m:
        sommità a0,10m sotto soffitto (scelta iniziale di disegno).
      </p>
      <p className="nota">
        Trascina lungo una parete o verso un altro ambiente. Snap e rotazione
        seguono la parete; la combinazione viene rivalidata sul nuovo
        fabbisogno.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget),
            wall = project.walls.find((w) => w.id === data.get("wall"));
          if (!wall) return;
          const span = roomWallSpan(room, wall);
          if (!span) return;
          const target = positionAlongRoomWall(
            room,
            wall,
            numberFromForm(data.get("offset")),
            unit.depthMm / 1000,
          );
          commit((p) => movePlacedDevice(p, id, target));
        }}
      >
        <label className="campo">
          <span>Parete split</span>
          <select name="wall" defaultValue={unit.wallId ?? ""}>
            {project.walls
              .filter((w) => room.wallIds.includes(w.id))
              .map((w, i) => (
                <option key={w.id} value={w.id}>
                  Parete{i + 1}
                </option>
              ))}
          </select>
        </label>
        <label className="campo">
          <span>Distanza centro dall&apos;inizio (m)</span>
          <input
            type="number"
            name="offset"
            min="0"
            step="0.01"
            defaultValue="1"
          />
        </label>
        <button className="bottone chiara" type="submit">
          Sposta split
        </button>
      </form>
      {model && (
        <a
          className="fonte-catalogo"
          href={model.sourceMetadata.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Fonte ufficiale unità interna
        </a>
      )}
    </div>
  );
}
