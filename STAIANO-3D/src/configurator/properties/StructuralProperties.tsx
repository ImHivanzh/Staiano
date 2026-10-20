"use client";
import { LengthInput } from "../LengthInput";
import type { Project } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { numberFromForm } from "@/utils/format";
import { removeSelection } from "@/domain/geometry/selection";

import { PlenumProperties } from "./PlenumProperties";

export function StructuralProperties({
  project,
  id,
}: {
  project: Project;
  id: string;
}) {
  const { commit } = useProjectStore();
  const plenum = project.plenums.find((pl) => pl.id === id);
  const pillar = project.pillars?.find((c) => c.id === id);
  const system = project.hvacSystems.find(
    (s) => s.type === "ducted" && s.indoorUnits.some((u) => u.id === id),
  );
  const machine = system?.indoorUnits.find((u) => u.id === id);
  const item = plenum ?? pillar ?? machine;
  if (!item) return null;
  if (plenum) return <PlenumProperties project={project} id={id} />;
  return (
    <div className="corpo-proprieta">
      <h3>
        {plenum
          ? "Plenum dedicato"
          : pillar
            ? "Pilastro"
            : "Macchina canalizzata"}
      </h3>
      {system && project.rooms.find((room) => room.id === machine?.roomId) && (
        <button
          className="bottone chiara"
          onClick={() =>
            system.installationId &&
            useProjectStore
              .getState()
              .openInstallationPlan(system.installationId)
          }
        >
          Configura sulla planimetria 2D
        </button>
      )}
      <form
        key={`${id}-${item.position.x}-${item.position.y}-${item.rotation}-${item.widthMm}-${item.heightMm}-${item.depthMm}`}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const patch = {
            position: {
              x: numberFromForm(data.get("x")),
              y: numberFromForm(data.get("y")),
            },
            rotation: (numberFromForm(data.get("rotation")) * Math.PI) / 180,
            widthMm: machine
              ? machine.widthMm
              : numberFromForm(data.get("width")),
            heightMm: machine
              ? machine.heightMm
              : numberFromForm(data.get("height")),
            depthMm: machine
              ? machine.depthMm
              : numberFromForm(data.get("depth")),
          };
          commit((p) => ({
            ...p,
            pillars: p.pillars?.map((c) =>
              c.id === id ? { ...c, ...patch } : c,
            ),
            hvacSystems: p.hvacSystems.map((s) => ({
              ...s,
              indoorUnits: s.indoorUnits.map((u) =>
                u.id === id ? { ...u, ...patch } : u,
              ),
            })),
          }));
        }}
      >
        <fieldset disabled={item.locked}>
          {[
            ["x", "Posizione X (m)", item.position.x],
            ["y", "Posizione Y (m)", item.position.y],
            [
              "rotation",
              "Orientamento (gradi)",
              (item.rotation * 180) / Math.PI,
            ],
            ["width", "Larghezza (mm)", item.widthMm],
            ["height", "Altezza (mm)", item.heightMm],
            ["depth", "Profondità (mm)", item.depthMm],
          ].map(([name, label, value]) =>
            /\((m|mm|cm)\)$/.test(String(label)) ? (
              <LengthInput
                key={name}
                label={String(label).replace(/ \((m|mm|cm)\)$/, "")}
                baseUnit={
                  String(label).endsWith("(mm)")
                    ? "mm"
                    : String(label).endsWith("(cm)")
                      ? "cm"
                      : "m"
                }
                name={String(name)}
                aria-label={String(label)}
                step="any"
                defaultValue={value}
                required
                disabled={
                  !!machine &&
                  ["width", "height", "depth"].includes(String(name))
                }
              />
            ) : (
              <label className="campo" key={name}>
                <span>{label}</span>
                <input
                  type="number"
                  name={String(name)}
                  aria-label={String(label)}
                  step="any"
                  defaultValue={value}
                  required
                  disabled={
                    !!machine &&
                    ["width", "height", "depth"].includes(String(name))
                  }
                />
              </label>
            ),
          )}
          <button className="bottone chiara" type="submit">
            Applica oggetto
          </button>
        </fieldset>
      </form>
      <button
        className="bottone piccolo tenue"
        disabled={item.locked}
        onClick={() =>
          commit((p) => removeSelection(p, [{ kind: "device", id }]))
        }
      >
        Elimina oggetto
      </button>
    </div>
  );
}
