"use client";
import { LengthInput } from "../LengthInput";
import Image from "next/image";
import type { Project } from "@/schemas/project";
import {
  fanCoilCatalogAtVersion,
  fanCoilProductAtVersion,
  compatibleFanCoilControls,
  controllerBoardFor,
  isConcealedFanCoil,
  isRecessedFanCoil,
} from "@/domain/catalogs/fan-coils";
import { updateFanCoil } from "@/domain/fan-coils/apply";
import { fanCoilCeilingRange } from "@/domain/fan-coils/placement";
import {
  ensureFanCoilAirSystem,
  fanCoilAirSystem,
  removeFanCoilAirSystem,
  setFanCoilAirDischarge,
} from "@/domain/fan-coils/air";
import { MachinePlenumDetails } from "../systems/MachinePlenumDetails";
import { DuctPanel } from "../systems/DuctPanel";
import {
  positionAlongRoomWall,
  positionRecessedAlongRoomWall,
  roomWallSpan,
} from "@/domain/geometry/placement";
import { distance, projection } from "@/domain/geometry/primitives";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber, numberFromForm } from "@/utils/format";

const formatElevation = (value: number) =>
  value.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  });

export function FanCoilProperties({
  project,
  id,
}: {
  project: Project;
  id: string;
}) {
  const { commit } = useProjectStore();
  const unit = project.fanCoils?.find((u) => u.id === id);
  if (!unit) return null;
  const room = project.rooms.find((r) => r.id === unit.roomId);
  if (!room) return null;
  const model = fanCoilProductAtVersion(unit.productId, unit.catalogVersion);
  const catalog = fanCoilCatalogAtVersion(unit.catalogVersion);
  const recessed = isRecessedFanCoil(model);
  const wallFitsRecess = (wall: (typeof project.walls)[number]) =>
    wall.thickness +
      (wall.drywall?.roomId === room.id ? (wall.drywall.offsetM ?? 0) : 0) +
      1e-6 >=
    unit.depthMm / 1000 - 0.002;
  const ceilingRange = model
    ? fanCoilCeilingRange(
        project,
        room,
        {
          ...unit,
          family: model.family,
          features: model.features,
          ceilingInstallation: model.ceilingInstallation,
        },
        unit.position,
        unit.rotation,
        unit.mounting,
      )
    : null;
  const datumOffset = unit.mounting === "wall" ? unit.heightMm / 2000 : 0;
  const point = model?.operatingPoints[unit.operatingPointIndex];
  const airSystem = fanCoilAirSystem(project, id);
  const airVents = project.airTerminals.filter(
    (terminal) => terminal.systemId === airSystem?.id,
  );
  const discharge = airSystem?.genericMachine?.dischargeConnection;
  const controls =
    model && catalog ? compatibleFanCoilControls(model, catalog) : [];
  const controller = controls.find((c) => c.id === unit.controllerId);
  const currentWall = project.walls.find((w) => w.id === unit.wallId);
  const currentSpan = currentWall && roomWallSpan(room, currentWall);
  const currentOffset = currentSpan
    ? distance(
        currentSpan.start,
        projection(unit.position, currentSpan.start, currentSpan.end),
      )
    : 1;
  return (
    <div className="corpo-proprieta">
      <h3>{model?.model ?? unit.productId}</h3>
      <p>
        {room.name} ·{" "}
        {model?.manufacturer ?? "Catalogo originale non disponibile"}
      </p>
      {model?.productPhoto && (
        <Image
          unoptimized
          src={model.productPhoto.localPath}
          alt={model.productPhoto.caption}
          width={400}
          height={170}
          style={{ width: "100%", height: 150, objectFit: "contain" }}
        />
      )}
      <p className="riepilogo-apparecchio">
        {point
          ? `${formatNumber(point.coolingW / 1000)} kW freddo · ${formatNumber(point.heatingW / 1000)} kW caldo`
          : "Capacità non verificabile"}
        <br />
        {point?.noiseDbA == null
          ? "Rumore non pubblicato / non verificabile"
          : `${formatNumber(point.noiseDbA)} dB(A) alla velocità selezionata`}
      </p>
      <label className="campo">
        <span>Velocità / punto di funzionamento</span>
        <select
          disabled={!model || unit.locked}
          value={unit.operatingPointIndex}
          onChange={(e) =>
            commit((p) =>
              updateFanCoil(p, id, {
                operatingPointIndex: Number(e.target.value),
              }),
            )
          }
        >
          {model?.operatingPoints.map((op, i) => (
            <option key={i} value={i}>
              {op.label} · {formatNumber(op.coolingW / 1000)} /{" "}
              {formatNumber(op.heatingW / 1000)} kW
            </option>
          ))}
        </select>
      </label>
      <label className="campo">
        <span>Montaggio</span>
        <select
          disabled={!model || unit.locked}
          value={unit.mounting}
          onChange={(e) =>
            commit((p) =>
              updateFanCoil(p, id, {
                mounting: e.target.value as "wall" | "ceiling",
              }),
            )
          }
        >
          {model?.mountings.map((m) => (
            <option key={m} value={m}>
              {m === "wall" ? "Parete" : "Soffitto"}
            </option>
          ))}
        </select>
      </label>
      <details className="azione-inspector">
        <summary>Posizione · misure interne</summary>
        <p className="nota">
          Ingombro {unit.widthMm}×{unit.heightMm}×{unit.depthMm} mm. Quota{" "}
          {unit.mounting === "wall" ? "centro" : "faccia inferiore"}{" "}
          {formatNumber(unit.elevationM)} m dal pavimento.
        </p>
        {recessed && unit.mounting === "wall" && (
          <p className="nota" data-testid="fan-coil-recess-note">
            Modello ad incasso: il corpo resta nella parete e la faccia
            anteriore è a filo. Serve una parete o controparete di almeno{" "}
            {unit.depthMm} mm; la posizione non sporge nella stanza.
          </p>
        )}
        <form
          key={`${unit.id}-${unit.mounting}-${unit.position.x}-${unit.position.y}-${unit.elevationM}`}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            if (unit.mounting === "wall") {
              const wall = project.walls.find((w) => w.id === data.get("wall"));
              const span = wall && roomWallSpan(room, wall);
              if (!wall || !span) return;
              const position = recessed
                ? positionRecessedAlongRoomWall(
                    room,
                    wall,
                    numberFromForm(data.get("offset")),
                    unit.depthMm / 1000,
                  )
                : positionAlongRoomWall(
                    room,
                    wall,
                    numberFromForm(data.get("offset")),
                    unit.depthMm / 1000,
                  );
              commit((p) =>
                updateFanCoil(p, id, {
                  position,
                  wallId: wall.id,
                  rotation: Math.atan2(
                    span.end.y - span.start.y,
                    span.end.x - span.start.x,
                  ),
                  elevationM: numberFromForm(data.get("elevation")),
                }),
              );
            } else
              commit((p) =>
                updateFanCoil(p, id, {
                  position: {
                    x: numberFromForm(data.get("x")),
                    y: numberFromForm(data.get("y")),
                  },
                  elevationM: numberFromForm(data.get("elevation")),
                }),
              );
          }}
        >
          <fieldset disabled={unit.locked}>
            <legend>Posizione ventilconvettore</legend>
            {unit.mounting === "wall" ? (
              <>
                <label className="campo">
                  <span>Parete</span>
                  <select name="wall" defaultValue={unit.wallId ?? ""}>
                    {project.walls
                      .filter(
                        (w) =>
                          room.wallIds.includes(w.id) &&
                          roomWallSpan(room, w) &&
                          (!recessed || wallFitsRecess(w)),
                      )
                      .map((w, i) => (
                        <option key={w.id} value={w.id}>
                          Parete {i + 1}
                        </option>
                      ))}
                  </select>
                </label>
                <LengthInput
                  label="Distanza centro dall’inizio interno"
                  baseUnit="m"
                  name="offset"
                  min="0"
                  defaultValue={currentOffset}
                  required
                />
              </>
            ) : (
              <>
                <LengthInput
                  label="Posizione X"
                  baseUnit="m"
                  name="x"
                  defaultValue={unit.position.x}
                  required
                />
                <LengthInput
                  label="Posizione Y"
                  baseUnit="m"
                  name="y"
                  defaultValue={unit.position.y}
                  required
                />
              </>
            )}
            <label className="campo">
              <span>
                Quota {unit.mounting === "wall" ? "centro" : "faccia inferiore"}{" "}
                dal pavimento (m)
              </span>
              <input
                type="number"
                name="elevation"
                min="0.01"
                max={Math.max(room.heightM, room.roof?.ridgeHeightM ?? 0)}
                step="any"
                defaultValue={unit.elevationM}
                required
              />
            </label>
            {ceilingRange && (
              <p className="nota" data-testid="fan-coil-elevation-ranges">
                Quote {unit.mounting === "wall" ? "centro" : "faccia inferiore"}{" "}
                consentite:{" "}
                {ceilingRange.ranges
                  .map(
                    (zone) =>
                      `${formatElevation(zone.minM + datumOffset)}–${formatElevation(zone.maxM + datumOffset)} m (${zone.reference === "below" ? "sotto soffitto" : zone.reference === "band" ? "vuoto fascia" : "vuoto superiore"})`,
                  )
                  .join("; ")}
              </p>
            )}
            {unit.mounting === "ceiling" && (
              <>
                <p className="nota">
                  {recessed
                    ? "Modello ad incasso: la posa a soffitto è ammessa solo dentro un controsoffitto o un vuoto tecnico; non viene appeso a vista. Verifica pannelli e accessori del modello."
                    : isConcealedFanCoil(model)
                      ? "Modello senza mobile: il corpo può stare nel vuoto tecnico o sotto il soffitto, secondo la quota scelta. Verifica pannelli e accessori del modello."
                      : "Posa a vista: tutto il corpo resta sotto il soffitto."}{" "}
                  {model?.ceilingInstallation?.note}
                </p>
                <button
                  type="button"
                  className="bottone chiara"
                  disabled={!ceilingRange}
                  onClick={() => {
                    if (ceilingRange)
                      commit((p) =>
                        updateFanCoil(p, id, {
                          elevationM: ceilingRange.defaultM,
                        }),
                      );
                  }}
                >
                  Allinea al soffitto
                </button>
              </>
            )}
            <button type="submit" className="bottone chiara">
              Aggiorna posizione
            </button>
          </fieldset>
        </form>
      </details>
      <details className="azione-inspector">
        <summary>Distribuzione aeraulica · plenum e canali</summary>
        {!point?.airflowM3h ? (
          <p role="status" className="nota">
            Il punto di funzionamento scelto non dichiara la portata d’aria:
            scegli un’altra velocità per alimentare canali e bocchette.
          </p>
        ) : !airSystem ? (
          <>
            <p className="nota">
              Questo ventilconvettore è canalizzabile: può alimentare plenum,
              canali e bocchette. La portata è quella del punto scelto (
              {formatNumber(point.airflowM3h)} m³/h); prevalenza utile, motore e
              accessori di canalizzazione vanno verificati sulla scheda Aermec.
            </p>
            <button
              type="button"
              className="bottone chiara"
              onClick={() =>
                commit((p) => ensureFanCoilAirSystem(p, id).project)
              }
            >
              Aggiungi distribuzione aeraulica
            </button>
          </>
        ) : (
          <>
            <p className="nota">
              {airVents.length}{" "}
              {airVents.length === 1
                ? "bocchetta collegata"
                : "bocchette collegate"}
              {" · "}
              portata {formatNumber(airSystem.airflowM3h ?? 0)} m³/h ·{" "}
              {formatNumber((airSystem.capacityW ?? 0) / 1000)} kW freddo. Usa
              Collega per associare altre bocchette.
            </p>
            <form
              key={`${airSystem.id}-${discharge?.connectionWidthMm ?? ""}-${discharge?.connectionHeightMm ?? ""}`}
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                commit((p) =>
                  setFanCoilAirDischarge(p, id, {
                    connectionWidthMm: numberFromForm(data.get("widthMm")),
                    connectionHeightMm: numberFromForm(data.get("heightMm")),
                  }),
                );
              }}
            >
              <fieldset disabled={unit.locked}>
                <legend>Attacco di mandata dichiarato</legend>
                <p className="nota">
                  Quote dell’attacco di mandata della macchina, come pubblicate
                  nella scheda del costruttore: servono per quotare il plenum.
                  Nessuna misura viene dedotta dal solo ingombro.
                </p>
                <LengthInput
                  label="Larghezza attacco"
                  baseUnit="mm"
                  name="widthMm"
                  min="1"
                  defaultValue={discharge?.connectionWidthMm ?? ""}
                  required
                />
                <LengthInput
                  label="Altezza attacco"
                  baseUnit="mm"
                  name="heightMm"
                  min="1"
                  defaultValue={discharge?.connectionHeightMm ?? ""}
                  required
                />
                <button type="submit" className="bottone piccolo">
                  Salva attacco di mandata
                </button>
              </fieldset>
            </form>
            <MachinePlenumDetails
              key={airSystem.id}
              project={project}
              systemId={airSystem.id}
            />
            <DuctPanel project={project} systemId={airSystem.id} />
            <button
              type="button"
              className="bottone piccolo pericolo"
              onClick={() => {
                if (
                  !window.confirm(
                    "Rimuovere la distribuzione aeraulica? Plenum e canali vengono eliminati; le bocchette restano in pianta da collegare.",
                  )
                )
                  return;
                commit((p) => removeFanCoilAirSystem(p, id));
              }}
            >
              Rimuovi distribuzione aeraulica
            </button>
          </>
        )}
      </details>
      {controls.length > 0 && (
        <details className="azione-inspector">
          <summary>Comando originale M7</summary>
          <label className="campo">
            <span>Comando</span>
            <select
              disabled={unit.locked}
              value={unit.controllerId ?? ""}
              onChange={(e) =>
                commit((p) =>
                  updateFanCoil(p, id, {
                    controllerId: e.target.value || null,
                  }),
                )
              }
            >
              <option value="">Da definire</option>
              {controls.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.series} {c.model}
                </option>
              ))}
            </select>
          </label>
          {controller && model && (
            <>
              {controller.productPhoto && (
                <Image
                  unoptimized
                  src={controller.productPhoto.localPath}
                  alt={controller.productPhoto.caption}
                  width={240}
                  height={120}
                  style={{ width: "100%", height: 100, objectFit: "contain" }}
                />
              )}
              <p className="nota">
                {controller.features.join(" · ")}
                <br />
                Scheda richiesta {controllerBoardFor(model, controller)} ·{" "}
                {model.pipes} tubi.
              </p>
              <a
                href={controller.sourceMetadata.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Manuale originale comandi
              </a>
            </>
          )}
        </details>
      )}
      <details className="azione-inspector">
        <summary>Condizioni e fonte ufficiale</summary>
        <p className="nota">
          {model?.features.join(" · ")}
          <br />
          Freddo: {point?.coolingConditions ?? "non verificabile"}
          <br />
          Caldo: {point?.heatingConditions ?? "non verificabile"}
          <br />
          Rumore: {point?.noiseConditions ?? "non verificabile"}
          <br />
          {model?.dimensionNote}
          <br />
          Catalogo {unit.catalogVersion}
        </p>
        {model && (
          <a
            className="fonte-catalogo"
            href={model.sourceMetadata.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Scheda originale {model.manufacturer}
          </a>
        )}
      </details>
    </div>
  );
}
