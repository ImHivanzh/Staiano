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
import { ArrowsOutCardinal, Info } from "@phosphor-icons/react";
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
      <p className="riepilogo-apparecchio">
        Capacità simultanea:{" "}
        {combination?.indoorCoolingW[slot] == null
          ? "non disponibile"
          : formatNumber((combination?.indoorCoolingW[slot] ?? 0) / 1000)}{" "}
        kW freddo ·{" "}
        {combination?.indoorHeatingW[slot] == null
          ? "non disponibile"
          : formatNumber((combination?.indoorHeatingW[slot] ?? 0) / 1000)}{" "}
        kW caldo
      </p>
      <p className="nota">
        Ingombro {unit.widthMm}×{unit.heightMm}×{unit.depthMm} mm.
        <br />
        Quota centro {formatNumber(splitCenterElevationM(room, unit))} m
      </p>
      <details className="azione-inspector">
        <summary>
          <ArrowsOutCardinal size={20} aria-hidden="true" />
          <span>
            Posizione<small>Scegli parete e distanza</small>
          </span>
        </summary>
        <p className="nota">
          Trascina lo split in pianta oppure inserisci la posizione esatta. La
          compatibilità viene verificata sul nuovo ambiente.
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
            Sposta split
          </button>
        </form>
      </details>
      <details className="azione-inspector dettagli-inspector">
        <summary>
          <Info size={19} aria-hidden="true" />
          <span>
            Dettagli tecnici<small>Combinazione e fonte ufficiale</small>
          </span>
        </summary>
        <p className="nota">
          Combinazione {combination?.outdoorModel ?? "non verificabile"}
          <br />
          Catalogo {unit.catalogVersion}
          <br />
          Sommità a 0,10 m sotto il soffitto: scelta iniziale di disegno.
          Verificare le distanze nel manuale del modello.
        </p>
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
      </details>
    </div>
  );
}
