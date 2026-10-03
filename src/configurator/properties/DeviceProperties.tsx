"use client";
import type { Project } from "@/schemas/project";
import { radiatorProducts } from "@/domain/catalogs/radiators";
import { useProjectStore } from "@/stores/project-store";
import { movePlacedDevice } from "@/domain/geometry/move-device";
import {
  positionAlongRoomWall,
  roomWallSpan,
} from "@/domain/geometry/placement";
import { formatNumber, numberFromForm } from "@/utils/format";
import { TerminalProperties } from "./TerminalProperties";
import { SplitProperties } from "./SplitProperties";
export function DeviceProperties({
  project,
  id,
}: {
  project: Project;
  id: string;
}) {
  const device = project.radiators.find((r) => r.id === id),
    { commit } = useProjectStore();
  if (!device)
    return project.hvacSystems.some((s) =>
      s.indoorUnits.some((u) => u.id === id),
    ) ? (
      <SplitProperties project={project} id={id} />
    ) : (
      <TerminalProperties project={project} id={id} />
    );
  const room = project.rooms.find((r) => r.id === device.roomId),
    product = radiatorProducts.find((p) => p.id === device.productId);
  if (!room) return null;
  return (
    <div className="corpo-proprieta">
      <h3>{product?.model ?? device.productId}</h3>
      <p>
        {room.name} · {device.elements} elementi
      </p>
      <p>
        <strong>{formatNumber(device.outputW / 1000)} kW</strong> a ΔT{" "}
        {device.deltaTK} K
      </p>
      <p className="nota">
        Ingombro {device.widthMm} × {device.heightMm} × {device.depthMm} mm
      </p>
      <p className="nota">
        Trascina il radiatore in pianta: snap alla faccia interna della parete e
        stanza aggiornata.
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
            device.depthMm / 1000,
          );
          commit((p) => movePlacedDevice(p, id, target));
        }}
      >
        <label className="campo">
          <span>Parete radiatore</span>
          <select name="wall" defaultValue={device.wallId ?? ""}>
            {project.walls
              .filter((w) => room.wallIds.includes(w.id))
              .map((w, i) => (
                <option key={w.id} value={w.id}>
                  Parete {i + 1}
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
          Sposta radiatore
        </button>
      </form>
      {product && (
        <a
          className="fonte-catalogo"
          href={product.sourceMetadata.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Fonte ufficiale
        </a>
      )}
    </div>
  );
}
