"use client";
import { LengthInput } from "../LengthInput";
import type { Project } from "@/schemas/project";
import {
  hvacOutdoorDimensions,
  hvacOutdoorLabel,
  moveHvacOutdoorUnit,
} from "@/domain/air-conditioning/outdoor";
import { hydronicOutwardRotation } from "@/domain/hydronic/placement";
import { useProjectStore } from "@/stores/project-store";
import { numberFromForm } from "@/utils/format";

export function AirOutdoorProperties({
  project,
  id,
}: {
  project: Project;
  id: string;
}) {
  const { commit } = useProjectStore();
  const system = project.hvacSystems.find(
    (item) => item.outdoorUnit?.id === id,
  );
  if (!system?.outdoorUnit) return null;
  const unit = system.outdoorUnit;
  const dimensions = hvacOutdoorDimensions(system);
  return (
    <div className="corpo-proprieta">
      <h3>{hvacOutdoorLabel(project, system)}</h3>
      <p>{dimensions?.manufacturer ?? system.manufacturer} · unità esterna</p>
      <p className="nota">
        Ingombro L×H×P {unit.widthMm}×{unit.heightMm}×{unit.depthMm} mm.
        L’intero ingombro deve restare fuori da ambienti e muri.
      </p>
      <details className="azione-inspector" open>
        <summary>Posizione all’esterno delle mura</summary>
        <button
          type="button"
          className="bottone chiara"
          disabled={unit.locked}
          onClick={() =>
            commit((p) =>
              moveHvacOutdoorUnit(p, id, {
                rotation: hydronicOutwardRotation(p, unit),
              }),
            )
          }
        >
          Rivolgi ventilatore all’esterno
        </button>
        <button
          type="button"
          className="bottone chiara"
          disabled={unit.locked}
          onClick={() =>
            commit((p) =>
              moveHvacOutdoorUnit(p, id, {
                rotation: unit.rotation + Math.PI,
              }),
            )
          }
        >
          Inverti verso (180°)
        </button>
        <form
          key={`${unit.position.x}-${unit.position.y}-${unit.rotation}-${unit.elevationM}`}
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            commit((p) =>
              moveHvacOutdoorUnit(p, id, {
                position: {
                  x: numberFromForm(d.get("x")),
                  y: numberFromForm(d.get("y")),
                },
                rotation: (numberFromForm(d.get("rotation")) * Math.PI) / 180,
                elevationM:
                  numberFromForm(d.get("elevation")) + unit.heightMm / 2000,
                mounting: d.get("mounting") as "ground" | "brackets",
              }),
            );
          }}
        >
          <fieldset disabled={unit.locked}>
            <legend>Posa macchina esterna</legend>
            <label className="campo">
              <span>Installazione</span>
              <select name="mounting" defaultValue={unit.mounting ?? "ground"}>
                <option value="ground">A pavimento / su basamento</option>
                <option value="brackets">In alto su staffe a parete</option>
              </select>
            </label>
            <LengthInput
              label="Posizione X"
              baseUnit="m"
              name="x"
              step="0.01"
              defaultValue={unit.position.x}
              required
            />
            <LengthInput
              label="Posizione Y"
              baseUnit="m"
              name="y"
              step="0.01"
              defaultValue={unit.position.y}
              required
            />
            <label className="campo">
              <span>Rotazione (°)</span>
              <input
                type="number"
                name="rotation"
                step="1"
                defaultValue={(unit.rotation * 180) / Math.PI}
                required
              />
            </label>
            <LengthInput
              label="Quota base dal pavimento"
              baseUnit="m"
              name="elevation"
              step="0.01"
              min="0"
              defaultValue={unit.elevationM - unit.heightMm / 2000}
              required
            />
            <button className="bottone chiara" type="submit">
              Aggiorna posizione esterna
            </button>
          </fieldset>
        </form>
      </details>
    </div>
  );
}
