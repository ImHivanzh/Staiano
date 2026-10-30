"use client";
import { useState } from "react";
import type { Project } from "@/schemas/project";
import { PlenumSketch, type PlenumPortSide } from "./SectionSketches";
import { useProjectStore } from "@/stores/project-store";
import { numberFromForm } from "@/utils/format";
import { removeSelection } from "@/domain/geometry/selection";
import { deviceCodes } from "@/services/export/device-codes";
import { plenumConnectionSide } from "@/domain/ducted/attached-plenums";
import { placedPlenumGeometry } from "@/domain/ducted/placement";

export function PlenumProperties({
  project,
  id,
}: {
  project: Project;
  id: string;
}) {
  const plenum = project.plenums.find((p) => p.id === id)!;
  const { commit } = useProjectStore();
  const codes = deviceCodes(project);
  const terminal = project.airTerminals.find(
    (t) => t.id === plenum.attachmentId,
  );
  const machineAttached =
    !!plenum.attachmentId &&
    project.hvacSystems.some((s) =>
      s.indoorUnits.some((u) => u.id === plenum.attachmentId),
    );
  // Lo stacco è un dato del corpo: se manca, si parte dalla scheda di catalogo.
  // I valori storici senza geometria propria ricadono sul lato posteriore.
  const portCount = Math.max(1, plenum.portCount ?? 1);
  const connectionPositions = Array.from({ length: portCount }, (_, i) => {
    const side = plenumConnectionSide(project, plenum, i);
    return side === "top" ? "upper" : side === "bottom" ? "lower" : side;
  }) as PlenumPortSide[];
  // Lato rivolto alla macchina: vettore plenum→macchina nel riferimento del plenum.
  const machine = project.hvacSystems
    .find((s) => s.id === plenum.systemId)
    ?.indoorUnits.at(0);
  const machineSide = (() => {
    if (!machine) return undefined;
    const vx = machine.position.x - plenum.position.x;
    const vy = machine.position.y - plenum.position.y;
    const right =
      vx * Math.cos(plenum.rotation) + vy * Math.sin(plenum.rotation);
    const front =
      -vx * Math.sin(plenum.rotation) + vy * Math.cos(plenum.rotation);
    if (Math.hypot(right, front) < 0.05) return undefined;
    if (Math.abs(front) >= Math.abs(right)) return front > 0 ? "front" : "rear";
    return right > 0 ? "right" : "left";
  })();
  // Anteprima dello schema mentre si cambiano le direzioni, prima di applicare.
  const [draft, setDraft] = useState<{ id: string; sides: PlenumPortSide[] }>();
  const sketchSides = draft?.id === id ? draft.sides : connectionPositions;
  return (
    <div className="corpo-proprieta">
      <h3>Plenum {plenum.use === "return" ? "di ripresa" : "di mandata"}</h3>
      <p>
        {terminal
          ? `Collegato alla bocchetta ${codes.get(terminal.id) ?? "elemento"}. Agganciato: segue la bocchetta quando la sposti o la ruoti.`
          : machineAttached
            ? `Collegato alla macchina ${codes.get(plenum.attachmentId!) ?? "elemento"}. Elemento autonomo: spostalo e ruotalo in pianta o in 3D.`
            : "Plenum libero: usa Collega e seleziona una bocchetta o una macchina."}
      </p>
      <p className="nota">
        Modificare quote o facce degli stacchi dichiara un plenum su misura. Una
        connessione diversa dalla fonte OEM richiede una quotazione separata.
      </p>
      <PlenumSketch
        positions={sketchSides}
        size={{ widthMm: plenum.widthMm, depthMm: plenum.depthMm }}
        machineSide={machineSide}
      />
      <form
        key={JSON.stringify(plenum)}
        onChange={(event) => {
          const data = new FormData(event.currentTarget);
          const count = Math.max(1, Number(data.get("ports")) || 1);
          setDraft({
            id,
            sides: Array.from(
              { length: Math.min(count, 24) },
              (_, i) =>
                (data.get(`port-position-${i}`) ??
                  connectionPositions[i] ??
                  "rear") as PlenumPortSide,
            ),
          });
        }}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const nextUse = terminal
            ? plenum.use
            : (String(data.get("use") ?? plenum.use) as "supply" | "return");
          if (!terminal && nextUse !== plenum.use) {
            const system = project.hvacSystems.find(
              (item) => item.id === plenum.systemId,
            );
            const conflict = project.plenums.some(
              (item) =>
                item.id !== id &&
                item.systemId === plenum.systemId &&
                item.use === nextUse &&
                (item.attachmentId === undefined ||
                  item.attachmentId === null ||
                  system?.indoorUnits.some(
                    (unit) => unit.id === item.attachmentId,
                  )),
            );
            if (conflict) {
              useProjectStore
                .getState()
                .setError(
                  `La macchina ha già il plenum di ${nextUse === "supply" ? "mandata" : "ripresa"}: massimo due plenums per macchina.`,
                );
              return;
            }
          }
          const nextPortCount = Math.max(1, numberFromForm(data.get("ports")));
          const positions = Array.from(
            { length: nextPortCount },
            (_, i) =>
              String(
                data.get(`port-position-${i}`) ??
                  connectionPositions[i] ??
                  "rear",
              ) as
                | "lateral"
                | "upper"
                | "lower"
                | "rear"
                | "front"
                | "left"
                | "right"
                | "custom",
          );
          commit((p) => ({
            ...p,
            plenums: p.plenums.map((pl) =>
              pl.id === id
                ? {
                    ...pl,
                    use: nextUse,
                    model: String(data.get("model")),
                    widthMm: numberFromForm(data.get("width")),
                    heightMm: numberFromForm(data.get("height")),
                    depthMm: numberFromForm(data.get("depth")),
                    portCount: nextPortCount,
                    portDiameterMm: numberFromForm(data.get("diameter")),
                    material: data.get("material") as
                      "insulated" | "galvanized",
                    shape: String(data.get("shape")) as
                      "rectangular" | "trapezoidal",
                    connectionNote: String(
                      data.get("connection-note") ?? pl.connectionNote ?? "",
                    ),
                    connectionPosition: positions[0],
                    connectionPositions: positions,
                    status: "manual",
                  }
                : pl,
            ),
          }));
        }}
      >
        <fieldset disabled={plenum.locked}>
          {plenum.attachmentId !== undefined &&
            !placedPlenumGeometry(project, plenum) && (
              <>
                {connectionPositions.map((position, i) => (
                  <label className="campo" key={i}>
                    <span>
                      {portCount > 1 ? `Stacco ${i + 1}` : "Direzione stacchi"}
                    </span>
                    <select name={`port-position-${i}`} defaultValue={position}>
                      <option value="rear">Dietro · orizzontali</option>
                      <option value="front">Davanti</option>
                      <option value="upper">Sopra · verso l’alto</option>
                      <option value="lower">Sotto · verso il basso</option>
                      <option value="left">Sinistra</option>
                      <option value="right">Destra</option>
                    </select>
                  </label>
                ))}
                <small>
                  Ogni stacco può arrivare da un lato diverso. Dato del plenum,
                  non della bocchetta: non modifica le quote dichiarate.
                </small>
                <label className="campo">
                  <span>Nota stacchi</span>
                  <input
                    name="connection-note"
                    maxLength={200}
                    defaultValue={plenum.connectionNote ?? ""}
                  />
                </label>
              </>
            )}
          {!terminal && (
            <label className="campo">
              <span>Lato impianto</span>
              <select name="use" defaultValue={plenum.use}>
                <option value="supply">Mandata</option>
                <option value="return">Ripresa</option>
              </select>
              <small>
                Massimo due plenums per macchina: mandata e, se serve, ripresa.
                Il secondo collegamento prende il lato libero.
              </small>
            </label>
          )}
          <label className="campo">
            <span>Modello</span>
            <input name="model" maxLength={100} defaultValue={plenum.model} />
          </label>
          {(
            [
              ["width", "Larghezza (mm)", plenum.widthMm],
              ["height", "Altezza (mm)", plenum.heightMm],
              ["depth", "Profondità (mm)", plenum.depthMm],
              ["ports", "Numero stacchi", plenum.portCount ?? 1],
              [
                "diameter",
                "Diametro stacchi (mm)",
                plenum.portDiameterMm ?? 160,
              ],
            ] as const
          ).map(([name, label, value]) => (
            <label className="campo" key={name}>
              <span>{label}</span>
              <input
                name={name}
                type="number"
                min="1"
                max={name === "ports" ? 24 : name === "diameter" ? 2000 : 10000}
                step="1"
                defaultValue={value}
                readOnly={
                  machineAttached && (name === "width" || name === "height")
                }
                required
              />
            </label>
          ))}
          <label className="campo">
            <span>Materiale</span>
            <select
              name="material"
              defaultValue={plenum.material ?? "insulated"}
            >
              <option value="insulated">Isolato</option>
              <option value="galvanized">Lamiera zincata</option>
            </select>
          </label>
          <label className="campo">
            <span>Forma</span>
            <select name="shape" defaultValue={plenum.shape ?? "rectangular"}>
              <option value="rectangular">Rettangolare</option>
              <option value="trapezoidal">Trapezoidale</option>
            </select>
          </label>
          <button className="bottone chiara">Applica plenum</button>
        </fieldset>
      </form>
      <button
        className="bottone pericolo"
        disabled={plenum.locked}
        onClick={() =>
          commit((p) => removeSelection(p, [{ kind: "device", id }]))
        }
      >
        Elimina plenum
      </button>
    </div>
  );
}
