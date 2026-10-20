"use client";
import type { Project } from "@/schemas/project";
import { LengthInput } from "../LengthInput";
import {
  vrvCatalogAtVersion,
  vrvIndoorAtVersion,
  vrvOutdoorAtVersion,
} from "@/domain/catalogs/vrv";
import { splitCenterElevationM } from "@/domain/air-conditioning/elevation";
import { useProjectStore } from "@/stores/project-store";
import { movePlacedDevice } from "@/domain/geometry/move-device";
import {
  positionAlongRoomWall,
  roomWallSpan,
} from "@/domain/geometry/placement";
import { formatNumber, numberFromForm } from "@/utils/format";
import { ArrowsOutCardinal, Info } from "@phosphor-icons/react";
import Image from "next/image";

export function VrvProperties({
  project,
  id,
}: {
  project: Project;
  id: string;
}) {
  const { commit } = useProjectStore(),
    system = project.hvacSystems.find(
      (item) =>
        item.type === "vrv" &&
        item.indoorUnits.some((unit) => unit.id === id),
    ),
    unit = system?.indoorUnits.find((item) => item.id === id);
  if (!unit || !system) return null;
  const room = project.rooms.find((item) => item.id === unit.roomId),
    model = vrvIndoorAtVersion(unit.productId, unit.catalogVersion),
    outdoor = vrvOutdoorAtVersion(system.productId, system.catalogVersion),
    catalog = vrvCatalogAtVersion(system.catalogVersion);
  if (!room) return null;
  const connected =
    system.indoorUnits.reduce((sum, placed) => {
      const indoor = catalog?.indoorUnits.find(
        (item) => item.id === placed.productId,
      );
      return sum + (indoor?.nominalCoolingW ?? 0);
    }, 0) ?? 0;
  const ratio = outdoor ? (connected / outdoor.coolingW) * 100 : null;
  return (
    <div className="corpo-proprieta">
      <h3>{model?.model ?? unit.productId}</h3>
      {model && (
        <>
          <h4>{model.family}</h4>
          <Image
            src={model.productPhoto.localPath}
            alt={model.productPhoto.caption}
            width={420}
            height={210}
            unoptimized
            className="foto-serie"
          />
          <p className="nota">{model.features.join(" · ")}</p>
        </>
      )}
      <p>
        {room.name} · {system.manufacturer} · VRV/VRF
      </p>
      <p className="riepilogo-apparecchio">
        Capacità nominale:{" "}
        {model ? `${formatNumber(model.nominalCoolingW / 1000)} kW freddo · ` : ""}
        {model ? `${formatNumber(model.nominalHeatingW / 1000)} kW caldo` : "non disponibile"}
      </p>
      <p className="nota">
        Esterno {outdoor?.model ?? "non verificabile"} · rapporto di
        connessione {ratio === null ? "non disponibile" : `${formatNumber(ratio, 0)}%`}
        <br />
        Ingombro {unit.widthMm}×{unit.heightMm}×{unit.depthMm} mm. Quota centro{" "}
        {formatNumber(splitCenterElevationM(room, unit))} m
      </p>
      <details className="azione-inspector">
        <summary>
          <ArrowsOutCardinal size={20} aria-hidden="true" />
          <span>
            Posizione<small>Scegli parete e distanza</small>
          </span>
        </summary>
        <p className="nota">
          Trascina l’unità interna VRV in pianta oppure inserisci la posizione
          esatta. La compatibilità viene verificata sul nuovo ambiente.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget),
              wall = project.walls.find((item) => item.id === data.get("wall"));
            if (!wall) return;
            const span = roomWallSpan(room, wall);
            if (!span) return;
            const target = positionAlongRoomWall(
              room,
              wall,
              numberFromForm(data.get("offset")),
              unit.depthMm / 1000,
            );
            commit((project) => movePlacedDevice(project, id, target));
          }}
        >
          <label className="campo">
            <span>Parete unità interna</span>
            <select name="wall" defaultValue={unit.wallId ?? ""}>
              {project.walls
                .filter((wall) => room.wallIds.includes(wall.id))
                .map((wall, index) => (
                  <option key={wall.id} value={wall.id}>
                    Parete {index + 1}
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
            Sposta unità interna
          </button>
        </form>
      </details>
      <details className="azione-inspector dettagli-inspector">
        <summary>
          <Info size={19} aria-hidden="true" />
          <span>
            Dettagli tecnici<small>Unità esterna e fonte ufficiale</small>
          </span>
        </summary>
        <p className="nota">
          Unità esterna {outdoor?.model ?? "non verificabile"}
          <br />
          Catalogo {unit.catalogVersion}
          <br />
          Sommità a 0,10 m sotto il soffitto: scelta iniziale di disegno.
          Verificare le distanze nel manuale del modello.
        </p>
        {outdoor && (
          <a
            className="fonte-catalogo"
            href={outdoor.sourceMetadata.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Fonte ufficiale unità esterna · pagina{" "}
            {outdoor.sourceMetadata.page}
          </a>
        )}
      </details>
    </div>
  );
}
