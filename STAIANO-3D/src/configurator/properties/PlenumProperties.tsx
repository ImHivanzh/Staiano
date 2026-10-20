"use client";
import type { Project } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { numberFromForm } from "@/utils/format";
import { removeSelection } from "@/domain/geometry/selection";
import { deviceCodes } from "@/services/export/device-codes";

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
  const machineAttached =
    !!plenum.attachmentId &&
    project.hvacSystems.some((s) =>
      s.indoorUnits.some((u) => u.id === plenum.attachmentId),
    );
  return (
    <div className="corpo-proprieta">
      <h3>Plenum {plenum.use === "return" ? "di ripresa" : "di mandata"}</h3>
      <p>
        {plenum.attachmentId
          ? `Collegato a ${codes.get(plenum.attachmentId) ?? "elemento"}. Posizione e orientamento seguono l’elemento.`
          : "Usa Collega e seleziona una bocchetta di mandata o una macchina di ripresa."}
      </p>
      <form
        key={JSON.stringify(plenum)}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          commit((p) => ({
            ...p,
            plenums: p.plenums.map((pl) =>
              pl.id === id
                ? {
                    ...pl,
                    model: String(data.get("model")),
                    widthMm: numberFromForm(data.get("width")),
                    heightMm: numberFromForm(data.get("height")),
                    depthMm: numberFromForm(data.get("depth")),
                    portCount: numberFromForm(data.get("ports")),
                    portDiameterMm: numberFromForm(data.get("diameter")),
                    material: data.get("material") as
                      "insulated" | "galvanized",
                    status: "manual",
                  }
                : pl,
            ),
          }));
        }}
      >
        <fieldset disabled={plenum.locked}>
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
