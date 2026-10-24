"use client";
import type { Project } from "@/schemas/project";
import { applyWallThicknessPreservingInterior } from "@/domain/geometry/wall-thickness";
import { useProjectStore } from "@/stores/project-store";
import { numberFromForm } from "@/utils/format";
import { LengthInput } from "./LengthInput";

export function ProjectSettings({ project }: { project: Project }) {
  const { commit } = useProjectStore();
  return (
    <main className="pagina archivio impostazioni-progetto">
      <h2>Impostazioni progetto</h2>
      <p className="nota">
        Altezza e spessori predefiniti per i nuovi elementi. Le misure degli
        elementi già disegnati si modificano dalle loro proprietà, oppure in un
        solo comando con «Applica spessori a tutti i muri».
      </p>
      <form
        key={JSON.stringify(project.projectSettings)}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          const settings = {
            ...project.projectSettings,
            defaultHeightM: numberFromForm(data.get("height")),
            externalWallThicknessM: numberFromForm(data.get("external")),
            internalWallThicknessM: numberFromForm(data.get("internal")),
            coefficientWm3: numberFromForm(data.get("coefficientWm3")),
          };
          if (
            submitter instanceof HTMLButtonElement &&
            ["walls", "external-walls"].includes(submitter.value)
          ) {
            commit((p) =>
              applyWallThicknessPreservingInterior(
                { ...p, projectSettings: settings },
                settings,
                submitter.value === "external-walls" ? "ESTERNO" : undefined,
              ),
            );
            return;
          }
          commit((p) => ({ ...p, projectSettings: settings }));
        }}
      >
        <div className="filtri-progetto">
          <label className="campo">
            <span id="settings-coefficient-label">
              Coefficiente termico (W/m³)
            </span>
            <input
              name="coefficientWm3"
              type="number"
              min="0"
              step="any"
              required
              defaultValue={project.projectSettings.coefficientWm3}
              aria-labelledby="settings-coefficient-label"
              aria-describedby="settings-coefficient-help"
            />
            <small id="settings-coefficient-help">
              Ricalcola il fabbisogno di tutti gli ambienti. Gli apparecchi già
              scelti restano nel progetto.
            </small>
          </label>
          <LengthInput
            label="Altezza predefinita"
            name="height"
            defaultValue={project.projectSettings.defaultHeightM}
            min={0.1}
            max={30}
            required
          />
          <LengthInput
            label="Spessore muri esterni"
            name="external"
            baseUnit="m"
            defaultValue={project.projectSettings.externalWallThicknessM}
            min={0.01}
            max={2}
            required
          />
          <LengthInput
            label="Spessore muri interni"
            name="internal"
            baseUnit="m"
            defaultValue={project.projectSettings.internalWallThicknessM}
            min={0.01}
            max={2}
            required
          />
        </div>
        <p className="nota">
          «Applica spessori a tutti i muri» aggiorna anche i muri già disegnati
          mantenendo le quote interne: i muri perimetrali crescono verso
          l’esterno, quelli interni allontanano gli ambienti quanto serve a
          conservarne le misure nette.
        </p>
        <div className="azioni-progetto">
          <button className="bottone pieno">Applica impostazioni</button>
          <button
            className="bottone chiara"
            value="walls"
            disabled={!project.walls.length}
          >
            Applica spessori a tutti i muri
          </button>
          <button
            className="bottone chiara"
            value="external-walls"
            disabled={!project.walls.some((wall) => wall.type === "ESTERNO")}
          >
            Applica spessore ai soli muri esterni
          </button>
        </div>
      </form>
      <h3>Gestione piani</h3>
      <p className="nota">
        L’ordine viene usato nella navigazione e nel dossier. Le quote verticali
        dei piani restano quelle impostate.
      </p>
      {project.floors.map((floor, index) => (
        <form
          className="gestione-piano"
          key={`${floor.id}-${floor.name}`}
          onSubmit={(event) => {
            event.preventDefault();
            const name = String(
              new FormData(event.currentTarget).get("name"),
            ).trim();
            commit((p) => ({
              ...p,
              floors: p.floors.map((item) =>
                item.id === floor.id ? { ...item, name } : item,
              ),
            }));
          }}
        >
          <label className="campo">
            <span>Nome piano</span>
            <input
              name="name"
              aria-label={`Nome piano ${index + 1}`}
              defaultValue={floor.name}
              maxLength={100}
              required
            />
          </label>
          <button className="bottone piccolo">Rinomina piano</button>
          {[-1, 1].map((direction) => (
            <button
              key={direction}
              type="button"
              className="bottone piccolo"
              disabled={
                index + direction < 0 ||
                index + direction >= project.floors.length
              }
              aria-label={`${direction < 0 ? "Sposta prima" : "Sposta dopo"} ${floor.name}`}
              onClick={() =>
                commit((p) => {
                  const floors = [...p.floors];
                  const current = floors.findIndex(
                    (item) => item.id === floor.id,
                  );
                  const next = current + direction;
                  if (current < 0 || next < 0 || next >= floors.length)
                    return p;
                  [floors[current], floors[next]] = [
                    floors[next],
                    floors[current],
                  ];
                  return {
                    ...p,
                    floors,
                    rooms: [...p.rooms].toSorted(
                      (a, b) =>
                        floors.findIndex((item) => item.id === a.floorId) -
                        floors.findIndex((item) => item.id === b.floorId),
                    ),
                  };
                })
              }
            >
              {direction < 0 ? "Sposta prima" : "Sposta dopo"}
            </button>
          ))}
        </form>
      ))}
    </main>
  );
}
