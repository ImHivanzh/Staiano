"use client";
import { FullscreenSection } from "../FullscreenDialog";
import { useRef } from "react";
import { ArrowLeft, ArrowRight, Check } from "@phosphor-icons/react";
import { useProjectStore } from "@/stores/project-store";
import { validateProject } from "@/domain/validation";
import { updateRoom } from "@/domain/project";
import { InstallationWizard } from "@/configurator/systems/InstallationWizard";
import { SupplyPlenumPanel } from "@/configurator/systems/SupplyPlenumPanel";
import { WallOpenings } from "@/configurator/properties/WallOpenings";
import { wallMeasuredLength } from "@/domain/geometry/dimensions";
import { formatNumber } from "@/utils/format";
import { LengthInput } from "../LengthInput";

// Keep the saved step IDs so existing projects resume in the matching phase.
const PHASES = [
  { name: "Planimetria", title: "Parti dalla planimetria", steps: [0] },
  {
    name: "Misure",
    title: "Controlla misure e muri",
    steps: [1, 2, 3, 4, 5, 6],
  },
  { name: "Stanze", title: "Completa le stanze", steps: [7] },
  { name: "Impianti", title: "Scegli gli impianti", steps: [8, 9] },
  { name: "Verifica", title: "Rivedi il progetto", steps: [10] },
];

/** Non-modal: the editor stays available throughout the persistent workflow. */
export function ConfigurationWizard({
  onImportPlan,
  onDrawRoom,
}: {
  onImportPlan: () => void;
  onDrawRoom: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const { project, activeFloorId, commit, select, setTool } = useProjectStore();
  const floor = project?.floors.find((f) => f.id === activeFloorId);
  const wizard = floor?.configurationWizard;
  if (!project || !floor || !wizard) return null;
  const phaseIndex = PHASES.findIndex((phase) =>
    phase.steps.includes(wizard.step),
  );
  const phase = PHASES[phaseIndex];
  const setStep = (step: number, confirm = false, status = wizard.status) => {
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
                  ? [...new Set([...wizard.confirmedSteps, ...phase.steps])]
                  : wizard.confirmedSteps,
              },
            }
          : f,
      ),
    }));
    requestAnimationFrame(() => heading.current?.focus());
  };
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
  const errors = issues.filter((c) => c.status === "invalid").length;
  const ductedSystems = project.hvacSystems.filter(
    (s) => s.type === "ducted" && rooms.some((r) => s.roomIds.includes(r.id)),
  );
  return (
    <section className="percorso-guidato" aria-label="Configurazione guidata">
      <header>
        <strong>Configurazione guidata</strong>
        <button
          className="bottone piccolo tenue"
          aria-label="Continua liberamente nell’editor"
          onClick={() => setStep(wizard.step, false, "paused")}
        >
          Pausa
        </button>
      </header>
      <nav aria-label="Fasi configurazione">
        <ol className="fasi-percorso">
          {PHASES.map((item, index) => {
            const confirmed = item.steps.every((step) =>
              wizard.confirmedSteps.includes(step),
            );
            return (
              <li key={item.name}>
                <button
                  aria-label={`${index + 1}. ${item.name}${confirmed ? ", confermata" : ""}`}
                  aria-current={index === phaseIndex ? "step" : undefined}
                  onClick={() => setStep(item.steps[0])}
                >
                  <span className="numero-fase" aria-hidden="true">
                    {confirmed ? <Check size={16} weight="bold" /> : index + 1}
                  </span>
                  <span>{item.name}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="contenuto-percorso" key={phaseIndex}>
        <h2 ref={heading} tabIndex={-1}>
          {phase.title}
        </h2>
        <p className="avanzamento-percorso">
          Passo {phaseIndex + 1} di {PHASES.length}
        </p>
        {phaseIndex === 0 && (
          <>
            <p>Carica una pianta oppure crea le stanze con le loro misure.</p>
            <div className="scelta-partenza">
              <button className="bottone" onClick={onImportPlan}>
                Importa planimetria
              </button>
              <button className="bottone tenue" onClick={onDrawRoom}>
                Disegna una stanza
              </button>
            </div>
            {walls.length > 0 && (
              <p className="nota">
                Nel piano: {walls.length} muri e {rooms.length} stanze. Puoi
                continuare con le misure.
              </p>
            )}
            {floor.importAnalysis && (
              <details>
                <summary>Dettagli del riconoscimento</summary>
                <p className="nota">
                  {floor.importAnalysis.wallCandidates} muri candidati;{" "}
                  {floor.importAnalysis.wallsAutoCreated} creati
                  automaticamente;{" "}
                  {floor.importAnalysis.wallsConfirmedByOperator} confermati.
                </p>
                {floor.importAnalysis.notes.map((note) => (
                  <p className="nota" key={note}>
                    {note}
                  </p>
                ))}
              </details>
            )}
          </>
        )}
        {phaseIndex === 1 && (
          <>
            <p>
              Confronta una misura della pianta con quella reale. Poi controlla
              i contorni nell’editor.
            </p>
            <p className="stato-percorso">
              {floor.scaleVerified
                ? "Scala verificata"
                : floor.background
                  ? "Scala da verificare"
                  : "Disegno in metri: controlla le quote dei muri."}
            </p>
            {floor.background && (
              <button className="bottone" onClick={() => setTool("calibrate")}>
                Verifica scala su due punti
              </button>
            )}
            <details>
              <summary>Muri e quote interne · {walls.length}</summary>
              <p className="nota">
                Seleziona un muro per modificarne lunghezza e spessore nelle
                proprietà.
              </p>
              <div className="elenco-percorso">
                {walls.map((wall, i) => (
                  <button
                    className="bottone tenue"
                    key={wall.id}
                    onClick={() => select({ kind: "wall", id: wall.id })}
                  >
                    <span>Parete {i + 1}</span>
                    <span>
                      {formatNumber(wallMeasuredLength(project, wall))} m ·{" "}
                      {formatNumber(wall.thickness * 1000, 0)} mm
                    </span>
                  </button>
                ))}
              </div>
              {!walls.length && (
                <p className="nota">
                  Nessun muro. Importa una pianta o disegna nell’editor.
                </p>
              )}
            </details>
            <details>
              <summary>
                Porte e finestre ·{" "}
                {
                  project.openings.filter((o) => o.floorId === activeFloorId)
                    .length
                }
              </summary>
              <p className="nota">
                Apri una parete per aggiungere o verificare le aperture.
              </p>
              {floor.importAnalysis?.openingCandidates?.length ? (
                <details>
                  <summary>
                    Aperture suggerite ·{" "}
                    {floor.importAnalysis.openingCandidates.length}
                  </summary>
                  {floor.importAnalysis.openingCandidates.map((o, i) => (
                    <p key={i} className="nota">
                      Apertura {i + 1}: ({formatNumber(o.start.x)},{" "}
                      {formatNumber(o.start.y)}) — ({formatNumber(o.end.x)},{" "}
                      {formatNumber(o.end.y)}). {o.reason}
                    </p>
                  ))}
                </details>
              ) : null}
              {walls.map((wall, i) => (
                <details key={wall.id}>
                  <summary>Parete {i + 1}</summary>
                  <WallOpenings project={project} wall={wall} />
                </details>
              ))}
              {!walls.length && (
                <p className="nota">
                  Crea prima i muri per inserire porte e finestre.
                </p>
              )}
            </details>
            <details>
              <summary>Correggi il disegno</summary>
              <p className="nota">
                Disegna i muri mancanti oppure seleziona un elemento per
                correggerlo nelle proprietà.
              </p>
              <div className="azioni">
                <button
                  className="bottone piccolo"
                  onClick={() => setTool("wall")}
                >
                  Disegna muri
                </button>
                <button
                  className="bottone piccolo tenue"
                  onClick={() => setTool("select")}
                >
                  Seleziona e correggi
                </button>
              </div>
            </details>
          </>
        )}
        {phaseIndex === 2 && (
          <>
            <p>Controlla nome, contorno e altezza di ogni stanza.</p>
            {rooms.map((room) => (
              <div key={room.id} className="caratteristiche-stanza">
                <div className="riepilogo-stanza-percorso">
                  <strong>{room.name}</strong>
                  <span>
                    {formatNumber(room.netAreaM2)} m² ·{" "}
                    {room.geometryStatus === "closed"
                      ? "Contorno chiuso"
                      : "Contorno da correggere"}
                  </span>
                </div>
                <LengthInput
                  key={room.heightM}
                  label={`Altezza ${room.name}`}
                  aria-label={`Altezza ${room.name}`}
                  min={0.1}
                  max={30}
                  defaultValue={room.heightM}
                  onValueBlur={(heightM) => {
                    if (heightM !== room.heightM)
                      commit((p) => updateRoom(p, room.id, { heightM }));
                  }}
                />
                <button
                  className="bottone piccolo tenue"
                  onClick={() => select({ kind: "room", id: room.id })}
                >
                  Modifica {room.name}
                </button>
              </div>
            ))}
            {!rooms.length && (
              <>
                <p className="nota">
                  Nessuna stanza nel piano. Crea una stanza o chiudi un contorno
                  con i muri.
                </p>
                <button className="bottone" onClick={onDrawRoom}>
                  Disegna una stanza
                </button>
              </>
            )}
          </>
        )}
        {phaseIndex === 3 && (
          <>
            <InstallationWizard project={project} rooms={rooms} />
            {ductedSystems.length > 0 && (
              <details>
                <summary>Plenum e bocchette</summary>
                <p className="nota">
                  Aggiungi le bocchette dalle proprietà della stanza o dagli
                  strumenti 3D. Scegli lunghezze e posizioni, poi configura il
                  plenum.
                </p>
                {ductedSystems.map((system) => (
                  <details key={system.id}>
                    <summary>
                      {system.name ||
                        system.genericMachine?.model ||
                        system.productId}
                      : plenum dedicato
                    </summary>
                    <FullscreenSection title="Configura plenum">
                      <SupplyPlenumPanel
                        project={project}
                        systemId={system.id}
                      />
                    </FullscreenSection>
                  </details>
                ))}
              </details>
            )}
          </>
        )}
        {phaseIndex === 4 && (
          <>
            <p>
              Rivedi i controlli prima di concludere. Gli avvisi restano
              disponibili nella sezione Controlli e nel dossier.
            </p>
            {issues.length ? (
              <details open>
                <summary>
                  {errors} errori · {issues.length - errors} avvisi
                </summary>
                <ul className="controlli-percorso">
                  {issues.map((issue, i) => (
                    <li key={i}>
                      <strong>
                        {issue.status === "invalid" ? "Errore" : "Avviso"}
                      </strong>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : (
              <p className="stato-percorso">
                Nessuna anomalia rilevata dai controlli disponibili.
              </p>
            )}
            <p className="nota">
              Concludere registra la tua revisione, anche in presenza di avvisi.
            </p>
          </>
        )}
      </div>
      <footer>
        <button
          className="bottone tenue"
          disabled={phaseIndex === 0}
          onClick={() => setStep(PHASES[phaseIndex - 1].steps[0])}
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Indietro
        </button>
        <button
          className="bottone pieno"
          onClick={() =>
            setStep(
              PHASES[Math.min(PHASES.length - 1, phaseIndex + 1)].steps[0],
              true,
              phaseIndex === 4 ? "complete" : "active",
            )
          }
        >
          {phaseIndex === 4 ? "Concludi configurazione" : "Conferma e continua"}
          {phaseIndex === 4 ? (
            <Check aria-hidden="true" size={16} />
          ) : (
            <ArrowRight aria-hidden="true" size={16} />
          )}
        </button>
      </footer>
    </section>
  );
}
