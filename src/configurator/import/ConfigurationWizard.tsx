"use client";
import { useProjectStore } from "@/stores/project-store";
import { validateProject } from "@/domain/validation";
import { updateRoom } from "@/domain/project";
import { RoomSystems } from "@/configurator/systems/RoomSystems";
import { SupplyPlenumPanel } from "@/configurator/systems/SupplyPlenumPanel";
import { WallOpenings } from "@/configurator/properties/WallOpenings";
import {
  wallMeasuredLength,
  DIMENSION_MODE_LABEL,
} from "@/domain/geometry/dimensions";
import { formatNumber } from "@/utils/format";

export const CONFIGURATION_STEPS = [
  "Analisi planimetria",
  "Riconoscimento scala",
  "Riconoscimento muri",
  "Riconoscimento stanze",
  "Porte e aperture",
  "Verifica quote",
  "Correzione manuale",
  "Caratteristiche stanze",
  "Configurazione impianto",
  "Macchina, plenum e bocchette",
  "Verifica finale",
] as const;

/** Non-modal: the editor stays available throughout the persistent workflow. */
export function ConfigurationWizard() {
  const { project, activeFloorId, commit, select, setTool } = useProjectStore();
  const floor = project?.floors.find((f) => f.id === activeFloorId);
  const wizard = floor?.configurationWizard;
  if (!project || !floor || !wizard) return null;
  const setStep = (step: number, confirm = false, status = wizard.status) =>
    commit((p) => ({
      ...p,
      floors: p.floors.map((f) =>
        f.id === activeFloorId
          ? {
              ...f,
              configurationWizard: {
                step,
                status,
                confirmedSteps: confirm
                  ? [...new Set([...wizard.confirmedSteps, wizard.step])]
                  : wizard.confirmedSteps,
              },
            }
          : f,
      ),
    }));
  if (wizard.status !== "active")
    return (
      <div className="percorso-ripresa">
        <button
          className="bottone piccolo tenue"
          onClick={() => setStep(wizard.step, false, "active")}
        >
          {wizard.status === "complete"
            ? "Rivedi configurazione guidata"
            : "Riprendi configurazione guidata"}
        </button>
      </div>
    );
  const rooms = project.rooms.filter((r) => r.floorId === activeFloorId);
  const walls = project.walls.filter((w) => w.floorId === activeFloorId);
  const issues = validateProject(project).filter((c) => c.status !== "valid");
  return (
    <section className="percorso-guidato" aria-label="Configurazione guidata">
      <header>
        <strong>
          Passo {wizard.step + 1}/11 · {CONFIGURATION_STEPS[wizard.step]}
        </strong>
        <button
          className="bottone piccolo tenue"
          onClick={() => setStep(wizard.step, false, "paused")}
        >
          Continua liberamente nell’editor
        </button>
      </header>
      <nav aria-label="Passi configurazione">
        <select
          aria-label="Passo configurazione"
          value={wizard.step}
          onChange={(e) => setStep(Number(e.target.value))}
        >
          {CONFIGURATION_STEPS.map((name, i) => (
            <option key={name} value={i}>
              {i + 1}. {name}
              {wizard.confirmedSteps.includes(i) ? " · confermato" : ""}
            </option>
          ))}
        </select>
      </nav>
      <div className="contenuto-percorso">
        {wizard.step === 0 && (
          <>
            <p>
              {floor.importAnalysis?.wallCandidates ?? 0} candidati;{" "}
              {floor.importAnalysis?.wallsAutoCreated ?? 0} muri automatici;{" "}
              {floor.importAnalysis?.wallsConfirmedByOperator ?? 0} confermati.{" "}
              {rooms.length} stanze attuali.
            </p>
            {floor.importAnalysis?.notes.map((n) => (
              <p className="nota" key={n}>
                {n}
              </p>
            ))}
          </>
        )}
        {wizard.step === 1 && (
          <>
            <p>
              Scala{" "}
              {floor.scaleVerified
                ? "verificata dall’operatore"
                : "da verificare"}
              .{" "}
              {floor.background &&
                `${formatNumber(floor.background.metersPerPixel, 6)} m/pixel.`}
            </p>
            {floor.background && (
              <button
                className="bottone piccolo"
                onClick={() => setTool("calibrate")}
              >
                Ricalibra su due punti nell’editor
              </button>
            )}
          </>
        )}
        {(wizard.step === 2 || wizard.step === 5) && (
          <>
            <p>
              Quote {DIMENSION_MODE_LABEL.internal}. Clicca una parete per
              modificare spessore, estremi e aperture.
            </p>
            <div className="azioni">
              {walls.map((wall, i) => (
                <button
                  className="bottone piccolo tenue"
                  key={wall.id}
                  onClick={() => select({ kind: "wall", id: wall.id })}
                >
                  Parete {i + 1}:{" "}
                  {formatNumber(wallMeasuredLength(project, wall))} m ·{" "}
                  {formatNumber(wall.thickness * 1000, 0)} mm
                  {wall.recognition
                    ? ` · ${Math.round(wall.recognition.confidence * 100)}% euristico / ${wall.recognition.origin === "calculated" ? "automatico" : "verificato"}`
                    : " · manuale"}
                </button>
              ))}
            </div>
          </>
        )}
        {wizard.step === 3 && (
          <>
            <p>
              {rooms.length} stanze. Verifica contorni e nomi; i contorni aperti
              conservano i dati precedenti.
            </p>
            <div className="azioni">
              {rooms.map((r) => (
                <button
                  key={r.id}
                  className="bottone piccolo"
                  onClick={() => select({ kind: "room", id: r.id })}
                >
                  {r.name} · {formatNumber(r.netAreaM2)} m² ·{" "}
                  {r.geometryStatus === "closed" ? "chiusa" : "da correggere"}
                </button>
              ))}
            </div>
          </>
        )}
        {wizard.step === 4 && (
          <>
            <p>
              {
                project.openings.filter((o) => o.floorId === activeFloorId)
                  .length
              }{" "}
              aperture create; {floor.importAnalysis?.openingsDetected ?? 0}{" "}
              possibili aperture suggerite. Tipo e quote verticali richiedono
              verifica.
            </p>
            {floor.importAnalysis?.openingCandidates?.map((o, i) => (
              <p key={i} className="nota">
                Apertura candidata {i + 1}: ({formatNumber(o.start.x)},{" "}
                {formatNumber(o.start.y)}) → ({formatNumber(o.end.x)},{" "}
                {formatNumber(o.end.y)}). {o.reason}
              </p>
            ))}
            {walls.map((w, i) => (
              <details key={w.id}>
                <summary>Parete {i + 1}: verifica / aggiungi aperture</summary>
                <WallOpenings project={project} wall={w} />
              </details>
            ))}
          </>
        )}
        {wizard.step === 6 && (
          <>
            <p>
              Muri e stanze restano modificabili. Aggiungi segmenti, modifica
              estremi/angolo, dividi o unisci dalle proprietà.
            </p>
            <button className="bottone piccolo" onClick={() => setTool("wall")}>
              Disegna muri
            </button>
            <button
              className="bottone piccolo tenue"
              onClick={() => setTool("select")}
            >
              Seleziona e correggi
            </button>
          </>
        )}
        {wizard.step === 7 &&
          rooms.map((r) => (
            <div key={r.id} className="caratteristiche-stanza">
              <strong>{r.name}</strong>
              <label>
                Destinazione d’uso
                <input
                  aria-label={`Uso ${r.name}`}
                  defaultValue={r.usage}
                  maxLength={100}
                  onBlur={(e) => {
                    if (e.target.value !== r.usage)
                      commit((p) => ({
                        ...p,
                        rooms: p.rooms.map((v) =>
                          v.id === r.id ? { ...v, usage: e.target.value } : v,
                        ),
                      }));
                  }}
                />
              </label>
              <label>
                Altezza (m)
                <input
                  aria-label={`Altezza ${r.name}`}
                  type="number"
                  min={0.1}
                  max={30}
                  step={0.01}
                  defaultValue={r.heightM}
                  onBlur={(e) => {
                    const heightM = Number(e.target.value);
                    if (heightM !== r.heightM)
                      commit((p) => updateRoom(p, r.id, { heightM }));
                  }}
                />
              </label>
            </div>
          ))}
        {wizard.step === 8 &&
          rooms.map((r) => (
            <details key={r.id}>
              <summary>{r.name}: scegli impianto</summary>
              <RoomSystems room={r} project={project} />
            </details>
          ))}
        {wizard.step === 9 && (
          <>
            <p>
              Inserisci le singole bocchette dalle proprietà stanza o dagli
              strumenti 3D. Lunghezze e posizioni sono scelte dall’operatore.
              Seleziona gli oggetti per spostarli e modificarli.
            </p>
            {project.hvacSystems
              .filter(
                (s) =>
                  s.type === "ducted" &&
                  rooms.some((r) => s.roomIds.includes(r.id)),
              )
              .map((s) => (
                <details key={s.id}>
                  <summary>
                    {s.name || s.genericMachine?.model || s.productId}: plenum
                    dedicato
                  </summary>
                  <SupplyPlenumPanel project={project} systemId={s.id} />
                </details>
              ))}
          </>
        )}
        {wizard.step === 10 && (
          <>
            <p>
              La conferma finale registra la revisione dell’operatore. Gli
              avvisi restano nel progetto e nel dossier.
            </p>
            <ul>
              {issues.map((c, i) => (
                <li key={i}>
                  <strong>
                    {c.status === "invalid" ? "ERRORE" : "WARNING"}
                  </strong>
                  : {c.message}
                </li>
              ))}
            </ul>
            {!issues.length && (
              <p>Nessuna anomalia rilevata dai controlli disponibili.</p>
            )}
          </>
        )}
      </div>
      <footer>
        <button
          className="bottone piccolo tenue"
          disabled={wizard.step === 0}
          onClick={() => setStep(wizard.step - 1)}
        >
          Indietro
        </button>
        <button
          className="bottone piccolo"
          onClick={() =>
            setStep(
              Math.min(10, wizard.step + 1),
              true,
              wizard.step === 10 ? "complete" : "active",
            )
          }
        >
          {wizard.step === 10
            ? "Conferma revisione e termina"
            : "Conferma verifica e avanti"}
        </button>
      </footer>
    </section>
  );
}
