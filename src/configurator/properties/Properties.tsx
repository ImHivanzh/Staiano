"use client";
import { useProjectStore } from "@/stores/project-store";
import {
  addAdjacentRoom,
  mergeRooms,
  recomputeProject,
  resizeRectangularRoom,
  resizeWall,
  updateRoom,
} from "@/domain/project";
import { bounds, distance } from "@/domain/geometry/primitives";
import { formatNumber, numberFromForm } from "@/utils/format";
import { RoomSystems } from "@/configurator/systems/RoomSystems";
import { DeviceProperties } from "./DeviceProperties";
import { WallOpenings } from "./WallOpenings";
import { followWallTransforms } from "@/domain/geometry/follow-walls";
import {
  CursorClick,
  GearSix,
  Ruler,
  Info,
  PlusSquare,
} from "@phosphor-icons/react";
import "./inspector.css";
import {
  wallMeasuredLength,
  roomRectSides,
} from "@/domain/geometry/dimensions";
import {
  setWallEndpoints,
  splitWall,
  mergeWallSegments,
} from "@/domain/geometry/wall-commands";

export function Properties() {
  const { project: p, selection, commit, setError } = useProjectStore();
  if (!p) return null;
  const rooms = selection
    .filter((s) => s.kind === "room")
    .map((s) => p.rooms.find((r) => r.id === s.id))
    .filter((r) => !!r);
  const walls = selection
    .filter((s) => s.kind === "wall")
    .map((s) => p.walls.find((w) => w.id === s.id))
    .filter((w) => !!w);
  const r = rooms[0],
    w = walls[0];
  const deviceId = selection.find((s) => s.kind === "device")?.id;
  const selectedObject = [
    ...p.walls,
    ...p.radiators,
    ...(p.fanCoils ?? []),
    ...(p.hydronicSystems?.map((s) => s.outdoorUnit) ?? []),
    ...p.airTerminals,
    ...p.plenums,
    ...(p.pillars ?? []),
    ...p.hvacSystems.flatMap((s) => s.indoorUnits),
  ].find((o) => o.id === (deviceId ?? w?.id));
  return (
    <aside className="proprieta">
      <div className="titolo-pannello">
        <span className="occhiello">
          {r
            ? "Stanza selezionata"
            : w
              ? "Parete selezionata"
              : deviceId
                ? "Apparecchio selezionato"
                : "Il tuo progetto"}
        </span>
        <h2>
          {selection.length > 1
            ? `${selection.length} elementi selezionati`
            : r
              ? r.name
              : w
                ? "Parete"
                : deviceId
                  ? "Apparecchio"
                  : "Seleziona un elemento"}
        </h2>
      </div>
      {deviceId && <DeviceProperties project={p} id={deviceId} />}
      {selectedObject && (
        <label className="campo">
          <span>
            <input
              type="checkbox"
              checked={selectedObject.locked}
              onChange={(e) => {
                const locked = e.target.checked;
                commit((p) => ({
                  ...p,
                  walls: p.walls.map((o) =>
                    o.id === selectedObject.id ? { ...o, locked } : o,
                  ),
                  radiators: p.radiators.map((o) =>
                    o.id === selectedObject.id ? { ...o, locked } : o,
                  ),
                  fanCoils: p.fanCoils?.map((o) =>
                    o.id === selectedObject.id ? { ...o, locked } : o,
                  ),
                  hydronicSystems: p.hydronicSystems?.map((s) => ({
                    ...s,
                    outdoorUnit:
                      s.outdoorUnit.id === selectedObject.id
                        ? { ...s.outdoorUnit, locked }
                        : s.outdoorUnit,
                  })),
                  airTerminals: p.airTerminals.map((o) =>
                    o.id === selectedObject.id ? { ...o, locked } : o,
                  ),
                  plenums: p.plenums.map((o) =>
                    o.id === selectedObject.id ? { ...o, locked } : o,
                  ),
                  pillars: p.pillars?.map((o) =>
                    o.id === selectedObject.id ? { ...o, locked } : o,
                  ),
                  hvacSystems: p.hvacSystems.map((s) => ({
                    ...s,
                    indoorUnits: s.indoorUnits.map((o) =>
                      o.id === selectedObject.id ? { ...o, locked } : o,
                    ),
                  })),
                }));
              }}
            />{" "}
            Blocca elemento
          </span>
        </label>
      )}
      {!r && !w && !deviceId && (
        <div className="pannello-vuoto guida-inspector">
          <CursorClick size={32} aria-hidden="true" />
          <h3>Parti da una stanza</h3>
          <p className="nota">
            Clicca una stanza nella pianta o nel 3D. Qui trovi solo gli
            strumenti per l’elemento selezionato.
          </p>
          <ol>
            <li>
              <strong>Seleziona</strong>
              <span>Stanza, parete o apparecchio</span>
            </li>
            <li>
              <strong>Configura</strong>
              <span>Scegli l’impianto e vedi il risultato</span>
            </li>
            <li>
              <strong>Esporta</strong>
              <span>Documento finale con viste del progetto</span>
            </li>
          </ol>
        </div>
      )}
      {r && (
        <div
          key={`${r.id}-${r.heightM}-${r.netAreaM2}`}
          className="corpo-proprieta"
        >
          {r.geometryStatus === "unresolved" && (
            <p role="status" className="nota">
              Contorno da richiudere. Superficie, volume e fabbisogno mostrano
              l’ultima geometria chiusa; apparecchi conservati. Correggere i
              muri prima di dimensionare.
            </p>
          )}
          <dl className="dati-stanza">
            <div>
              <dt>Superficie netta</dt>
              <dd data-testid="room-area">
                {formatNumber(r.netAreaM2)} <small>m²</small>
              </dd>
            </div>
            <div>
              <dt>Altezza</dt>
              <dd>
                {formatNumber(r.heightM)} <small>m</small>
              </dd>
            </div>
            <div className="carico">
              <dt>Fabbisogno</dt>
              <dd data-testid="room-load">
                {formatNumber(r.designLoadW / 1000)} <small>kW</small>
              </dd>
            </div>
          </dl>
          <p className="nota nota-fabbisogno">
            Il fabbisogno serve a scegliere la potenza dell’impianto.
          </p>
          <p className="impianto-attuale">
            <GearSix size={17} aria-hidden="true" />
            {r.systemType === "none"
              ? "Impianto da configurare"
              : r.systemType === "radiator"
                ? `${p.radiators.filter((d) => d.roomId === r.id).length} radiatori nella stanza`
                : p.hvacSystems.find(
                    (s) => s.type === r.systemType && s.roomIds.includes(r.id),
                  )?.name ||
                  (r.systemType === "ducted"
                    ? "Impianto canalizzato"
                    : "Climatizzazione split")}
          </p>
          <details className="azione-inspector">
            <summary>
              <Ruler size={20} aria-hidden="true" />
              <span>
                Modifica stanza<small>Misure e nome</small>
              </span>
            </summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                commit((p) =>
                  updateRoom(p, r.id, {
                    name: String(data.get("name")),
                    heightM: numberFromForm(data.get("height")),
                  }),
                );
              }}
            >
              <label className="campo">
                <span>Nome stanza</span>
                <input
                  name="name"
                  defaultValue={r.name}
                  maxLength={100}
                  aria-label="Nome stanza"
                />
              </label>
              <label className="campo">
                <span>Altezza stanza (m)</span>
                <input
                  name="height"
                  type="number"
                  min="0.1"
                  max="30"
                  step="0.01"
                  defaultValue={r.heightM}
                  required
                  aria-label="Altezza stanza"
                />
              </label>
              <button className="bottone chiara" type="submit">
                Applica proprietà
              </button>
            </form>
            {roomRectSides(r) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  commit((p) =>
                    resizeRectangularRoom(
                      p,
                      r.id,
                      numberFromForm(data.get("width")),
                      numberFromForm(data.get("length")),
                    ),
                  );
                }}
              >
                <h3>Quote nette stanza</h3>
                <p className="nota">Modifica anche i muri collegati.</p>
                <label className="campo">
                  <span>Larghezza netta (m)</span>
                  <input
                    name="width"
                    type="number"
                    min="0.1"
                    max="100"
                    step="0.01"
                    defaultValue={(
                      bounds(r.polygon).maxX - bounds(r.polygon).minX
                    ).toFixed(3)}
                    required
                  />
                </label>
                <label className="campo">
                  <span>Lunghezza netta (m)</span>
                  <input
                    name="length"
                    type="number"
                    min="0.1"
                    max="100"
                    step="0.01"
                    defaultValue={(
                      bounds(r.polygon).maxY - bounds(r.polygon).minY
                    ).toFixed(3)}
                    required
                  />
                </label>
                <button className="bottone" type="submit">
                  Aggiorna quote nette
                </button>
              </form>
            )}
            {rooms.length === 2 && (
              <button
                className="bottone"
                onClick={() => {
                  let height: number | undefined;
                  if (rooms[0].heightM !== rooms[1].heightM) {
                    const entered = window.prompt(
                      `Altezze diverse: ${rooms[0].heightM} m e ${rooms[1].heightM} m. Altezza del nuovo ambiente (m):`,
                      String(rooms[0].heightM),
                    );
                    if (entered === null) return;
                    height = numberFromForm(entered);
                  }
                  if (
                    window.confirm(
                      "Eliminare la parete condivisa e unire le due stanze? Operazione annullabile.",
                    )
                  )
                    commit((p) =>
                      mergeRooms(p, rooms[0].id, rooms[1].id, height),
                    );
                }}
              >
                Unisci le due stanze
              </button>
            )}
          </details>
          <details className="azione-inspector">
            <summary>
              <GearSix size={20} aria-hidden="true" />
              <span>
                Configura impianto<small>Radiatori, canalizzato o split</small>
              </span>
            </summary>
            <RoomSystems key={r.id} room={r} project={p} />
          </details>
          <details className="azione-inspector dettagli-inspector">
            <summary>
              <Info size={19} aria-hidden="true" />
              <span>
                Dettagli tecnici<small>Volume, perimetro e calcolo</small>
              </span>
            </summary>
            <dl className="dati-secondari">
              <div>
                <dt>Volume netto</dt>
                <dd>{formatNumber(r.volumeM3)} m³</dd>
              </div>
              <div>
                <dt>Perimetro netto</dt>
                <dd>{formatNumber(r.perimeterM)} m</dd>
              </div>
            </dl>
            <p className="formula">
              {formatNumber(r.netAreaM2)} m² × {formatNumber(r.heightM)} m<br />
              = {formatNumber(r.volumeM3)} m³
              <br />× 35 W/m³ = {formatNumber(r.designLoadW)} W
            </p>
            <p className="nota">
              Stima convenzionale. Verifica tecnica necessaria prima
              dell&apos;esecuzione.
            </p>
          </details>
        </div>
      )}
      {w && (
        <div
          className="corpo-proprieta"
          key={`${w.id}-${distance(w.start, w.end)}-${w.thickness}`}
        >
          {walls.length === 2 && (
            <button
              className="bottone piccolo"
              onClick={() =>
                commit((p) => mergeWallSegments(p, walls[0].id, walls[1].id))
              }
            >
              Unisci segmenti collineari
            </button>
          )}
          {walls.length === 1 && (
            <details>
              <summary>Estremi, angolo e divisione muro</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  commit((p) =>
                    setWallEndpoints(
                      p,
                      w.id,
                      {
                        x: numberFromForm(d.get("sx")),
                        y: numberFromForm(d.get("sy")),
                      },
                      {
                        x: numberFromForm(d.get("ex")),
                        y: numberFromForm(d.get("ey")),
                      },
                    ),
                  );
                }}
              >
                {[
                  ["sx", "Inizio X (m)", w.start.x],
                  ["sy", "Inizio Y (m)", w.start.y],
                  ["ex", "Fine X (m)", w.end.x],
                  ["ey", "Fine Y (m)", w.end.y],
                ].map(([name, label, value]) => (
                  <label className="campo" key={name}>
                    <span>{label}</span>
                    <input
                      name={String(name)}
                      type="number"
                      step="any"
                      defaultValue={value}
                    />
                  </label>
                ))}
                <button className="bottone piccolo" disabled={w.locked}>
                  Applica estremi e angolo
                </button>
              </form>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  commit((p) =>
                    splitWall(p, w.id, numberFromForm(d.get("offset"))),
                  );
                }}
              >
                <label className="campo">
                  <span>Posizione divisione lungo asse (m)</span>
                  <input
                    name="offset"
                    type="number"
                    step="0.01"
                    defaultValue={distance(w.start, w.end) / 2}
                  />
                </label>
                <button className="bottone piccolo" disabled={w.locked}>
                  Dividi segmento
                </button>
              </form>
            </details>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget),
                thickness = numberFromForm(data.get("thickness")) / 1000,
                type = String(data.get("type")) as "INTERNO" | "ESTERNO";
              commit((p) => {
                const resized =
                  walls.length === 1
                    ? resizeWall(
                        p,
                        w.id,
                        numberFromForm(data.get("length")) +
                          distance(w.start, w.end) -
                          wallMeasuredLength(p, w, "internal"),
                      )
                    : p;
                const ids = new Set(walls.map((w) => w.id));
                return recomputeProject(
                  followWallTransforms(
                    resized,
                    resized.walls.map((v) =>
                      ids.has(v.id) ? { ...v, thickness, type } : v,
                    ),
                  ),
                );
              });
            }}
          >
            {walls.length === 1 && (
              <label className="campo">
                <span>Lunghezza interna utile (m)</span>
                <input
                  type="number"
                  name="length"
                  min="0.05"
                  max="100"
                  step="0.01"
                  defaultValue={wallMeasuredLength(p, w, "internal").toFixed(3)}
                  required
                  aria-label="Lunghezza muro"
                />
              </label>
            )}
            <label className="campo">
              <span>Tipo muro</span>
              <select name="type" defaultValue={w.type}>
                <option value="INTERNO">Interno</option>
                <option value="ESTERNO">Esterno</option>
              </select>
            </label>
            <label className="campo">
              <span>Spessore (mm)</span>
              <input
                type="number"
                name="thickness"
                min="10"
                max="2000"
                step="1"
                defaultValue={w.thickness * 1000}
                required
              />
            </label>
            <p className="nota">
              Quote e superficie stanza riferite alle facce interne dei muri.
            </p>
            <button className="bottone chiara" type="submit">
              Applica parete{walls.length > 1 ? " a tutti" : ""}
            </button>
          </form>
          {walls.length === 1 && (
            <WallOpenings key={w.id} project={p} wall={w} />
          )}
          {walls.length === 1 && (
            <details className="azione-inspector">
              <summary>
                <PlusSquare size={20} aria-hidden="true" />
                <span>
                  Aggiungi stanza adiacente
                  <small>Usa questa parete come lato condiviso</small>
                </span>
              </summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  commit((p) =>
                    addAdjacentRoom(
                      p,
                      w.id,
                      numberFromForm(data.get("depth")),
                      String(data.get("name")),
                      numberFromForm(data.get("height")),
                    ),
                  );
                }}
              >
                <label className="campo">
                  <span>Nome nuovo ambiente</span>
                  <input
                    name="name"
                    defaultValue="Nuovo ambiente"
                    maxLength={100}
                  />
                </label>
                <label className="campo">
                  <span>Profondità netta (m)</span>
                  <input
                    type="number"
                    name="depth"
                    min="0.1"
                    max="30"
                    step="0.01"
                    defaultValue="3"
                    required
                  />
                </label>
                <label className="campo">
                  <span>Altezza (m)</span>
                  <input
                    type="number"
                    name="height"
                    min="0.1"
                    max="30"
                    step="0.01"
                    defaultValue={p.projectSettings.defaultHeightM}
                    required
                  />
                </label>
                <button className="bottone" type="submit">
                  Crea ambiente adiacente
                </button>
              </form>
            </details>
          )}
          <button
            className="bottone tenue"
            onClick={() => {
              useProjectStore.getState().setTool("wall");
              setError(null);
            }}
          >
            Dividi stanza: disegna parete
          </button>
        </div>
      )}
    </aside>
  );
}
