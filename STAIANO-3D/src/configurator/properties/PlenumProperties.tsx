"use client";
import type { Project } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { numberFromForm } from "@/utils/format";
import { removeSelection } from "@/domain/geometry/selection";
import { deviceCodes } from "@/services/export/device-codes";
import { resolveTerminalAccessorySpecification } from "@/domain/air-terminals/commercial-bom";

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
  const connectionPosition =
    plenum.connectionPosition ??
    (terminal
      ? resolveTerminalAccessorySpecification(terminal)?.plenum
          ?.connectionPosition
      : undefined) ??
    "lateral";
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
      <form
        key={JSON.stringify(plenum)}
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
                    portCount: numberFromForm(data.get("ports")),
                    portDiameterMm: numberFromForm(data.get("diameter")),
                    material: data.get("material") as
                      "insulated" | "galvanized",
                    shape: String(data.get("shape")) as
                      "rectangular" | "trapezoidal",
                    connectionNote: String(
                      data.get("connection-note") ?? pl.connectionNote ?? "",
                    ),
                    ...(data.get("port-position")
                      ? {
                          connectionPosition: String(
                            data.get("port-position"),
                          ) as
                            "lateral" | "upper" | "lower" | "rear" | "custom",
                        }
                      : {}),
                    status: "manual",
                  }
                : pl,
            ),
          }));
        }}
      >
        <fieldset disabled={plenum.locked}>
          {!machineAttached && plenum.attachmentId !== undefined && (
            <>
              <label className="campo">
                <span>Direzione stacchi reali</span>
                <select name="port-position" defaultValue={connectionPosition}>
                  <option value="lateral">Orizzontali dietro il plenum</option>
                  <option value="upper">Superiori, verso l’alto</option>
                  <option value="lower">Inferiori · su richiesta</option>
                  <option value="rear">Posteriori · su richiesta</option>
                  <option value="custom">Personalizzati · su richiesta</option>
                </select>
                <small>
                  Dato del plenum, non della bocchetta: non modifica le quote
                  dichiarate.
                </small>
              </label>
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
