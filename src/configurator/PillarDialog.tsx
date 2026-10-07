"use client";
import { useProjectStore } from "@/stores/project-store";
import { addPillar } from "@/domain/geometry/pillars";
import { numberFromForm } from "@/utils/format";

export function PillarDialog() {
  const { project, selection, activeFloorId, commit, pillarDialog } =
    useProjectStore();
  if (!project || !pillarDialog) return null;
  const room =
    project.rooms.find((r) => r.id === selection[0]?.id) ??
    project.rooms.find((r) => r.floorId === activeFloorId);
  const close = () => useProjectStore.setState({ pillarDialog: false });
  return (
    <div className="sfondo-dialogo">
      <section
        className="dialogo"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pillar-title"
      >
        <div className="testata-dialogo">
          <h2 id="pillar-title">Aggiungi pilastro</h2>
          <button
            className="bottone tenue"
            aria-label="Chiudi pilastro"
            onClick={close}
          >
            ×
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            commit((p) =>
              addPillar(p, activeFloorId, {
                position: {
                  x: numberFromForm(d.get("x")),
                  y: numberFromForm(d.get("y")),
                },
                rotation: (numberFromForm(d.get("rotation")) * Math.PI) / 180,
                widthMm: numberFromForm(d.get("width")),
                depthMm: numberFromForm(d.get("depth")),
                heightMm: numberFromForm(d.get("height")),
              }),
            );
            const state = useProjectStore.getState();
            if (!state.error) {
              const pillar = state.project?.pillars?.at(-1);
              if (pillar) state.select({ kind: "device", id: pillar.id });
              close();
            }
          }}
        >
          {[
            ["width", "Larghezza pilastro (mm)", 300],
            ["depth", "Profondità pilastro (mm)", 300],
            [
              "height",
              "Altezza pilastro (mm)",
              (room?.heightM ?? project.projectSettings.defaultHeightM) * 1000,
            ],
            ["x", "Posizione X pilastro (m)", room?.centroid.x ?? 0],
            ["y", "Posizione Y pilastro (m)", room?.centroid.y ?? 0],
            ["rotation", "Orientamento pilastro (gradi)", 0],
          ].map(([name, label, value]) => (
            <label className="campo" key={name}>
              <span>{label}</span>
              <input
                name={String(name)}
                aria-label={String(label)}
                type="number"
                step="any"
                defaultValue={value}
                required
              />
            </label>
          ))}
          <p className="nota">
            Ingombro reale in 2D e 3D; superficie occupata sottratta alla
            superficie interna utile.
          </p>
          <button className="bottone" type="submit">
            Inserisci pilastro
          </button>
        </form>
      </section>
    </div>
  );
}
