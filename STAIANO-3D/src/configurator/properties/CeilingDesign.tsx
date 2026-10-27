"use client";
import { useState } from "react";
import type { CeilingBand, Project, Room } from "@/schemas/project";
import { ceilingBandSchema } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { updateRoom } from "@/domain/project";
import { roomWallSpan } from "@/domain/geometry/placement";
import { validateCeilingBand } from "@/domain/geometry/ceilings";
import { numberFromForm } from "@/utils/format";
import { LengthInput } from "../LengthInput";

export function CeilingDesign({
  project,
  room,
}: {
  project: Project;
  room: Room;
}) {
  const { commit } = useProjectStore();
  const walls = project.walls.filter((w) => room.wallIds.includes(w.id));
  const saveBand = (data: FormData, existing?: CeilingBand) =>
    commit((p) => {
      const band = ceilingBandSchema.parse({
        id: existing?.id ?? crypto.randomUUID(),
        name: String(data.get("name")),
        wallId: String(data.get("wall")),
        offsetM: numberFromForm(data.get("offset")),
        lengthM: numberFromForm(data.get("length")),
        depthM: numberFromForm(data.get("depth")),
        elevationM: numberFromForm(data.get("height")),
      });
      const current = p.rooms.find((r) => r.id === room.id)!;
      validateCeilingBand(p, current, band);
      return updateRoom(p, room.id, {
        ceilingBands: [
          ...(current.ceilingBands ?? []).filter((b) => b.id !== band.id),
          band,
        ],
      });
    });
  const fields = (band?: CeilingBand) => (
    <>
      <label className="campo">
        <span>Nome fascia</span>
        <input
          name="name"
          maxLength={100}
          defaultValue={
            band?.name ?? `Fascia ${(room.ceilingBands?.length ?? 0) + 1}`
          }
          required
        />
      </label>
      <label className="campo">
        <span>Parete di riferimento</span>
        <select name="wall" defaultValue={band?.wallId ?? walls[0]?.id}>
          {walls.map((wall, i) => (
            <option key={wall.id} value={wall.id}>
              Parete {i + 1} · {roomWallSpan(room, wall)?.lengthM.toFixed(2)} m
            </option>
          ))}
        </select>
      </label>
      {(
        [
          ["offset", "Distanza dall’inizio parete (m)", band?.offsetM ?? 0, 0],
          [
            "length",
            "Lunghezza fascia (m)",
            band?.lengthM ??
              Math.min(3, roomWallSpan(room, walls[0])?.lengthM ?? 3),
            0.05,
          ],
          [
            "depth",
            "Larghezza fascia verso la stanza (m)",
            band?.depthM ?? 0.8,
            0.05,
          ],
          [
            "height",
            "Quota inferiore fascia (m)",
            band?.elevationM ?? (room.ceilingHeightM ?? room.heightM) - 0.4,
            0.1,
          ],
        ] as const
      ).map(([name, label, value, min]) => (
        <label className="campo" key={name}>
          <span>{label}</span>
          <input
            name={name}
            type="number"
            min={min}
            max={name === "height" ? 30 : 1000}
            step="0.01"
            defaultValue={value}
            required
          />
        </label>
      ))}
    </>
  );
  return (
    <details className="azione-inspector" data-testid="ceiling-design">
      <summary>Controsoffitto a livelli e tetto</summary>
      <p className="nota">
        Fasce ribassate lungo le pareti: servono per nascondere canali e plenum.
        La parte centrale segue la quota del controsoffitto della stanza.
      </p>
      {(room.ceilingBands ?? []).map((band) => (
        <details key={band.id}>
          <summary>
            {band.name} · quota {band.elevationM.toFixed(2)} m
          </summary>
          <form
            key={JSON.stringify(band)}
            onSubmit={(e) => {
              e.preventDefault();
              saveBand(new FormData(e.currentTarget), band);
            }}
          >
            {fields(band)}
            <button className="bottone piccolo">Aggiorna fascia</button>
          </form>
          <button
            className="bottone piccolo pericolo"
            onClick={() =>
              commit((p) => {
                const next = updateRoom(p, room.id, {
                  ceilingBands: room.ceilingBands?.filter(
                    (b) => b.id !== band.id,
                  ),
                });
                return {
                  ...next,
                  airTerminals: next.airTerminals.map((t) =>
                    t.ceilingBandId === band.id
                      ? {
                          ...t,
                          ceilingBandId: undefined,
                          ceilingEdge: undefined,
                        }
                      : t,
                  ),
                };
              })
            }
          >
            Elimina fascia
          </button>
        </details>
      ))}
      <details>
        <summary>Aggiungi fascia ribassata</summary>
        <form
          key={`${room.id}-${room.ceilingBands?.length ?? 0}`}
          onSubmit={(e) => {
            e.preventDefault();
            saveBand(new FormData(e.currentTarget));
          }}
        >
          {fields()}
          <button className="bottone chiara">Aggiungi fascia</button>
        </form>
      </details>
      <RoofForm room={room} walls={walls} />
    </details>
  );
}

function RoofForm({ room, walls }: { room: Room; walls: Project["walls"] }) {
  const { commit } = useProjectStore();
  const [pitched, setPitched] = useState(!!room.roof);
  return (
    <form
      key={JSON.stringify(room.roof)}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        commit((p) =>
          updateRoom(p, room.id, {
            roof: data.get("pitched")
              ? {
                  ridgeWallId: String(data.get("ridgeWall")),
                  ridgeHeightM: numberFromForm(data.get("ridge")),
                }
              : undefined,
          }),
        );
      }}
    >
      <label className="campo">
        <span>
          <input
            name="pitched"
            type="checkbox"
            checked={pitched}
            onChange={(e) => setPitched(e.target.checked)}
          />{" "}
          Tetto a due falde
        </span>
      </label>
      <fieldset disabled={!pitched}>
        <p className="nota">
          La gronda è all’altezza della stanza; il colmo corre parallelo alla
          parete scelta.
        </p>
        <label className="campo">
          <span>Colmo parallelo a</span>
          <select
            name="ridgeWall"
            defaultValue={room.roof?.ridgeWallId ?? walls[0]?.id}
          >
            {walls.map((wall, i) => (
              <option key={wall.id} value={wall.id}>
                Parete {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Quota colmo (m)</span>
          <input
            name="ridge"
            type="number"
            min={room.heightM + 0.01}
            max="30"
            step="0.01"
            defaultValue={room.roof?.ridgeHeightM ?? room.heightM + 1}
            required
          />
        </label>
      </fieldset>
      <button className="bottone chiara">Applica tetto</button>
    </form>
  );
}

/** La quota si inserisce solo quando il controsoffitto è attivo. */
export function CeilingToggle({
  enabled,
  defaultHeightM,
}: {
  enabled: boolean;
  defaultHeightM: number;
}) {
  const [on, setOn] = useState(enabled);
  return (
    <>
      <label className="campo">
        <span>Controsoffitto</span>
        <input
          type="checkbox"
          name="ceiling"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
        />
      </label>
      <LengthInput
        label="Quota controsoffitto"
        aria-label="Quota controsoffitto"
        name="ceilingHeight"
        min={0.1}
        max={30}
        step={0.01}
        defaultValue={defaultHeightM}
        disabled={!on}
      />
    </>
  );
}
