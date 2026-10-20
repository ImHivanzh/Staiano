"use client";
import { LengthInput } from "../LengthInput";
import type { Project } from "@/schemas/project";
import { radiatorProductAtVersion } from "@/domain/catalogs/radiators";
import { useProjectStore } from "@/stores/project-store";
import { movePlacedDevice } from "@/domain/geometry/move-device";
import {
  positionAlongRoomWall,
  roomWallSpan,
} from "@/domain/geometry/placement";
import { formatNumber, numberFromForm } from "@/utils/format";
import { TerminalProperties } from "./TerminalProperties";
import { SplitProperties } from "./SplitProperties";
import { VrvProperties } from "./VrvProperties";
import { ArrowsOutCardinal, Info } from "@phosphor-icons/react";
import { RadiatorFinishes } from "./RadiatorFinishes";
import { StructuralProperties } from "./StructuralProperties";
import { FanCoilProperties } from "./FanCoilProperties";
import { HydronicProperties } from "./HydronicProperties";
import { AirOutdoorProperties } from "./AirOutdoorProperties";
import { configurationBlock } from "@/domain/ducted/plan-connections";
export function DeviceProperties({
  project,
  id,
}: {
  project: Project;
  id: string;
}) {
  const device = project.radiators.find((r) => r.id === id),
    { commit } = useProjectStore();
  const blocked = configurationBlock(project, id);
  if (blocked)
    return (
      <p role="status" className="nota">
        {blocked}
      </p>
    );
  if (project.fanCoils?.some((u) => u.id === id))
    return <FanCoilProperties project={project} id={id} />;
  if (project.hydronicSystems?.some((s) => s.outdoorUnit.id === id))
    return <HydronicProperties project={project} id={id} />;
  if (project.hvacSystems.some((s) => s.outdoorUnit?.id === id))
    return <AirOutdoorProperties project={project} id={id} />;
  if (
    project.plenums.some((pl) => pl.id === id) ||
    project.pillars?.some((c) => c.id === id) ||
    project.hvacSystems.some(
      (s) => s.type === "ducted" && s.indoorUnits.some((u) => u.id === id),
    )
  )
    return <StructuralProperties project={project} id={id} />;
  if (!device)
    return project.hvacSystems.some(
      (s) => s.type === "vrv" && s.indoorUnits.some((u) => u.id === id),
    ) ? (
      <VrvProperties project={project} id={id} />
    ) : project.hvacSystems.some((s) =>
        s.indoorUnits.some((u) => u.id === id),
      ) ? (
      <SplitProperties project={project} id={id} />
    ) : (
      <TerminalProperties project={project} id={id} />
    );
  const room = project.rooms.find((r) => r.id === device.roomId),
    product = radiatorProductAtVersion(device.productId, device.catalogVersion);
  if (!room) return null;
  return (
    <div className="corpo-proprieta">
      <h3>{product?.model ?? device.productId}</h3>
      <p>
        {room.name} ·{" "}
        {product?.construction === "fixed"
          ? "corpo unico"
          : `${device.elements} elementi`}
      </p>
      <p className="riepilogo-apparecchio">
        <strong>{formatNumber(device.outputW / 1000)} kW</strong> a ΔT{" "}
        {device.deltaTK} K
      </p>
      <p className="nota">
        Ingombro {device.widthMm} × {device.heightMm} × {device.depthMm} mm
      </p>
      <RadiatorFinishes device={device} />
      <details className="azione-inspector">
        <summary>
          <ArrowsOutCardinal size={20} aria-hidden="true" />
          <span>
            Posizione<small>Scegli parete e distanza</small>
          </span>
        </summary>
        <p className="nota">
          Trascina il radiatore in pianta oppure inserisci la posizione esatta.
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
          <LengthInput
            label="Distanza centro dall'inizio"
            baseUnit="m"
            name="offset"
            min="0"
            step="0.01"
            defaultValue="1"
          />
          <button className="bottone chiara" type="submit">
            Sposta radiatore
          </button>
        </form>
      </details>
      <details className="azione-inspector dettagli-inspector">
        <summary>
          <Info size={19} aria-hidden="true" />
          <span>
            Dettagli tecnici<small>Modello e fonte ufficiale</small>
          </span>
        </summary>
        <p className="nota">
          {device.manufacturer} · {device.family}
          <br />
          Catalogo {device.catalogVersion}
          <br />
          {device.elements} elementi · {device.outputW} W a ΔT {device.deltaTK}{" "}
          K
        </p>
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
      </details>
    </div>
  );
}
