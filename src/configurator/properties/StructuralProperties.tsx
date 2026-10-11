"use client";
import { LengthInput } from "../LengthInput";
import type { Project } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { numberFromForm, formatNumber } from "@/utils/format";
import { removeSelection } from "@/domain/geometry/selection";
import { calculateSupplyPlenum } from "@/domain/ducted/plenum";
import { SupplyPlenumPanel } from "@/configurator/systems/SupplyPlenumPanel";
import { DuctedMachinePicker } from "@/configurator/systems/DuctedMachinePicker";
import { FullscreenSection } from "../FullscreenDialog";

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
  const result = plenum
    ? calculateSupplyPlenum(project, plenum.systemId)
    : null;
  return (
    <div className="corpo-proprieta">
      <h3>
        {plenum
          ? "Plenum dedicato"
          : pillar
            ? "Pilastro"
            : "Macchina canalizzata"}
      </h3>
      {system &&
        project.rooms.find((room) => room.id === system.roomIds[0]) && (
          <DuctedMachinePicker
            key={system.id}
            project={project}
            room={project.rooms.find((room) => room.id === system.roomIds[0])!}
          />
        )}
      {plenum && (
        <>
          <p>
            {plenum.model} · {result?.branches.length} attacchi richiesti ·{" "}
            {result?.machineGeometry?.ports.length ?? 0} con diametro verificato
          </p>
          <ol>
            {result?.branches.map((b, i) => (
              <li key={b.id}>
                Attacco {i + 1}:{" "}
                {b.diameterMm === null
                  ? "diametro da verificare"
                  : `Ø ${b.diameterMm} mm`}{" "}
                · {b.roomName} · {formatNumber(b.airflowM3h)} m³/h
              </li>
            ))}
          </ol>
        </>
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
            plenums: p.plenums.map((pl) =>
              pl.id === id
                ? {
                    ...pl,
                    ...patch,
                    status: "manual",
                    elevationM: numberFromForm(data.get("elevation")),
                    model: String(data.get("model")),
                    designSettings: pl.designSettings
                      ? { ...pl.designSettings, faceWidthMm: patch.widthMm }
                      : null,
                  }
                : pl,
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
          {plenum && (
            <>
              <LengthInput
                label="Quota centro plenum"
                baseUnit="m"
                name="elevation"
                step="0.01"
                defaultValue={plenum.elevationM}
                required
              />
              <label className="campo">
                <span>Identificativo / modello plenum</span>
                <input
                  name="model"
                  maxLength={100}
                  defaultValue={plenum.model}
                />
              </label>
            </>
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
      {plenum && (
        <FullscreenSection title="Collegamenti e scheda plenum">
          <SupplyPlenumPanel project={project} systemId={plenum.systemId} />
        </FullscreenSection>
      )}
    </div>
  );
}
