"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { deviceCodes } from "@/services/export/device-codes";
import Image from "next/image";
import {
  ArrowCounterClockwise,
  ArrowClockwise,
  Cursor,
  Hand,
  LineSegment,
  Ruler,
  Square,
  Trash,
  Copy,
  FloppyDisk,
  DownloadSimple,
  UploadSimple,
  Plus,
  Cube,
  SquaresFour,
  CheckCircle,
  WarningCircle,
  FolderOpen,
  X,
  HouseLine,
  Columns,
  Wind,
  Snowflake,
} from "@phosphor-icons/react";
import { useProjectStore, type Tool } from "@/stores/project-store";
import {
  addRectangle,
  createProject,
  duplicateProject,
  newId,
} from "@/domain/project";
import { validateProject } from "@/domain/validation";
import {
  duplicateSelection,
  removeSelection,
} from "@/domain/geometry/selection";
import { exportProject } from "@/services/project/format";
import { importProjectFile } from "@/services/import/project-file";
import {
  configureProjectSession,
  flushSave,
  repository,
  saveCurrent,
} from "@/services/project/session";
import { applyPlanImport } from "@/domain/geometry/import-plan";
import type { ImportedPlan } from "@/services/import/plan-types";
import { formatNumber, numberFromForm } from "@/utils/format";
import { Editor2D } from "./editor2d/Editor2D";
import { Properties } from "./properties/Properties";
import { ConfigurationWizard } from "./import/ConfigurationWizard";
import { PillarDialog } from "./PillarDialog";
import type { Project } from "@/schemas/project";
import { CatalogAdmin } from "./systems/CatalogAdmin";
import { EcoclimaBill } from "./systems/EcoclimaBill";

const Viewer3D = dynamic(() => import("./viewer3d/Viewer3D"), {
  ssr: false,
  loading: () => <div className="vuoto">Caricamento modello 3D…</div>,
});
const PlanImportWizard = dynamic(
  () =>
    import("./import/PlanImportWizard").then(
      (module) => module.PlanImportWizard,
    ),
  { ssr: false },
);
const tools: {
  id: Tool;
  label: string;
  shortcut: string;
  icon: typeof Cursor;
}[] = [
  { id: "select", label: "Seleziona", shortcut: "V", icon: Cursor },
  { id: "wall", label: "Disegna muro", shortcut: "W", icon: LineSegment },
  { id: "measure", label: "Misura", shortcut: "M", icon: Ruler },
  { id: "pan", label: "Sposta vista", shortcut: "H", icon: Hand },
];

export function Configurator() {
  const router = useRouter();
  const s = useProjectStore(),
    p = s.project;
  const [page, setPage] = useState<
      "editor" | "projects" | "checks" | "catalogs"
    >("editor"),
    [projects, setProjects] = useState<Project[]>([]);
  const [rectangleOpen, setRectangleOpen] = useState(false),
    [ready, setReady] = useState(false),
    [newDialog, setNewDialog] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [includeRenders, setIncludeRenders] = useState(true);
  const [dossierVariant, setDossierVariant] = useState<"complete" | "summary">(
    "complete",
  );
  const [billOpen, setBillOpen] = useState(false);
  const [pdfProgress, setPdfProgress] = useState("");
  const pdfController = useRef<AbortController | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [planFile, setPlanFile] = useState<File | undefined>(undefined);
  const [userName, setUserName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null),
    rasterInput = useRef<HTMLInputElement>(null),
    started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        if (response.status === 401) {
          router.replace("/accedi");
          return;
        }
        if (!response.ok)
          throw new Error(
            "Sessione utente non disponibile. Ricaricare l’applicazione.",
          );
        const identity = (await response.json()) as {
          username: string;
          displayName: string;
          mustChangePassword: boolean;
        };
        if (identity.mustChangePassword) {
          router.replace("/accedi");
          return;
        }
        configureProjectSession(identity.username);
        setUserName(identity.displayName);
        const id = await repository.lastActiveId();
        if (id) {
          const saved = await repository.get(id);
          if (saved) useProjectStore.getState().load(saved);
        }
      } catch (e) {
        useProjectStore
          .getState()
          .setError(
            e instanceof Error ? e.message : "Archivio locale non disponibile.",
          );
      } finally {
        setReady(true);
      }
    })();
  }, [router]);
  useEffect(() => {
    const unsub = useProjectStore.subscribe((state, previous) => {
      if (!state.dirty || state.revision === previous.revision) return;
      // Queue every committed snapshot. A reload cannot skip the previous version.
      void saveCurrent().catch(() => {});
    });
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (useProjectStore.getState().dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      unsub();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.matches("input,select,textarea") ||
          e.target.isContentEditable)
      )
        return;
      const store = useProjectStore.getState();
      if (e.key === "Escape") {
        store.setTool("select");
        store.select(null);
        setRectangleOpen(false);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) store.redo();
          else store.undo();
        } else if (e.key.toLowerCase() === "y") {
          e.preventDefault();
          store.redo();
        } else if (e.key.toLowerCase() === "s") {
          e.preventDefault();
          void saveCurrent().catch(() => {});
        } else if (e.key.toLowerCase() === "c") {
          e.preventDefault();
          copySelection();
        }
        return;
      }
      const tool = tools.find(
        (t) => t.shortcut.toLowerCase() === e.key.toLowerCase(),
      );
      if (tool) store.setTool(tool.id);
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelection();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  function copySelection() {
    const store = useProjectStore.getState();
    store.commit((project) => duplicateSelection(project, store.selection));
  }
  function deleteSelection() {
    const store = useProjectStore.getState();
    if (
      !store.selection.length ||
      !window.confirm(
        "Eliminare la selezione? Eliminare una stanza rimuove i suoi apparecchi; aprire un contorno conserva i dispositivi. Ctrl+Z annulla.",
      )
    )
      return;
    store.commit((project) => removeSelection(project, store.selection));
  }
  async function newProject(
    mode: "manual" | "import",
    name = "Nuovo progetto",
  ) {
    try {
      await flushSave();
      const next = createProject(name);
      await repository.save(next);
      await repository.setActiveId(next.id);
      s.load(next);
      setPage("editor");
      setNewDialog(false);
      if (mode === "manual") setRectangleOpen(true);
      else {
        setPlanFile(undefined);
        setPlanOpen(true);
      }
    } catch (e) {
      s.setError(
        e instanceof Error ? e.message : "Creazione progetto fallita.",
      );
    }
  }
  async function showProjects() {
    try {
      await flushSave();
      setProjects(await repository.list());
      setPage("projects");
    } catch (e) {
      s.setError(e instanceof Error ? e.message : "Archivio non disponibile.");
    }
  }
  async function importFile(file: File) {
    try {
      const incoming = await importProjectFile(file);
      await flushSave();
      const existing = await repository.get(incoming.id);
      const imported = existing
        ? duplicateProject(incoming, `${incoming.name} — importato`)
        : incoming;
      await repository.save(imported);
      await repository.setActiveId(imported.id);
      s.load(imported);
      setPage("editor");
    } catch (e) {
      s.setError(e instanceof Error ? e.message : "Importazione fallita.");
    }
  }
  async function saveAs() {
    if (!p) return;
    const name = window.prompt("Salva con nome", p.name);
    if (!name?.trim()) return;
    try {
      await flushSave();
      const copy = duplicateProject(p, name.trim());
      await repository.save(copy);
      await repository.setActiveId(copy.id);
      s.load(copy);
    } catch {
      s.setError("Salvataggio con nome fallito.");
    }
  }
  function importRaster(file: File) {
    setPlanFile(file);
    setPlanOpen(true);
  }
  function acceptPlan(plan: ImportedPlan) {
    const state = useProjectStore.getState();
    if (!state.project) return;
    if (
      plan.background &&
      state.project.floors.find((f) => f.id === state.activeFloorId)
        ?.background &&
      !window.confirm(
        "Sostituire lo sfondo del piano? La geometria resta conservata.",
      )
    )
      return;
    state.commit((project) =>
      applyPlanImport(project, state.activeFloorId, plan),
    );
    if (!useProjectStore.getState().error) {
      setPlanOpen(false);
      setPlanFile(undefined);
      setPage("editor");
      state.setTool("select");
    }
  }
  const checks = p ? validateProject(p) : [],
    errors = checks.filter((c) => c.status === "invalid"),
    warnings = checks.filter((c) => c.status === "warning");
  const floor = p?.floors.find((f) => f.id === s.activeFloorId),
    rooms = p?.rooms.filter((r) => r.floorId === s.activeFloorId) ?? [];
  return (
    <div className={`app hvac-app ${s.presentation ? "modo-cliente" : ""}`}>
      <input
        ref={fileInput}
        type="file"
        accept=".hvacproj"
        hidden
        data-testid="project-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importFile(file);
          e.target.value = "";
        }}
      />
      <input
        ref={rasterInput}
        type="file"
        accept=".dxf,.pdf,.dwg,image/png,image/jpeg,image/webp"
        hidden
        data-testid="raster-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importRaster(file);
          e.target.value = "";
        }}
      />
      <aside className="barra-lato">
        <div className="marchio">
          <span className="bollo">
            <Image
              src="/logo.svg"
              alt="Staiano"
              width={44}
              height={36}
              unoptimized
            />
          </span>
          <span>
            Staiano HVAC<small>Configuratore tecnico</small>
          </span>
        </div>
        <div className="gruppo-voci">Progettazione</div>
        <nav className="voci">
          <button
            className={`voce-nav ${page === "editor" ? "attiva" : ""}`}
            onClick={() => setPage("editor")}
          >
            <HouseLine /> Planimetria
          </button>
          <button
            className={`voce-nav ${page === "projects" ? "attiva" : ""}`}
            onClick={() => void showProjects()}
          >
            <FolderOpen /> Progetti locali
          </button>
          <button
            className={`voce-nav ${page === "checks" ? "attiva" : ""}`}
            onClick={() => setPage("checks")}
            disabled={!p}
          >
            <CheckCircle /> Controlli{" "}
            {p && (
              <span className="conta">{errors.length + warnings.length}</span>
            )}
          </button>
          <button
            className={`voce-nav ${page === "catalogs" ? "attiva" : ""}`}
            onClick={() => setPage("catalogs")}
          >
            <SquaresFour />
            Cataloghi tecnici
          </button>
        </nav>
        {p && (
          <div className="navigazione-piano">
            <div className="gruppo-voci">Piani e ambienti</div>
            <select
              aria-label="Piano attivo"
              value={s.activeFloorId}
              onChange={(e) => s.setFloor(e.target.value)}
            >
              {p.floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button
              className="aggiungi-piano"
              onClick={() => {
                const name = window.prompt(
                  "Nome nuovo piano",
                  `Piano ${p.floors.length}`,
                );
                if (name?.trim()) {
                  const id = newId();
                  s.commit((p) => ({
                    ...p,
                    floors: [
                      ...p.floors,
                      {
                        id,
                        name: name.trim(),
                        elevationM: p.floors.length * 3,
                        scaleVerified: true,
                        background: null,
                        importAnalysis: null,
                      },
                    ],
                  }));
                  s.setFloor(id);
                }
              }}
            >
              <Plus /> Aggiungi piano
            </button>
            <div className="stanze-nav">
              {rooms.map((r) => (
                <button
                  key={r.id}
                  className={`stanza-nav ${s.selection.some((v) => v.id === r.id) ? "attiva" : ""}`}
                  onClick={(e) => {
                    s.select({ kind: "room", id: r.id }, e.shiftKey);
                    setPage("editor");
                  }}
                >
                  <span className="nome-ambiente-nav">
                    {r.systemType === "radiator" ? (
                      <Columns size={17} aria-hidden="true" />
                    ) : r.systemType === "ducted" ? (
                      <Wind size={17} aria-hidden="true" />
                    ) : r.systemType === "split" ? (
                      <Snowflake size={17} aria-hidden="true" />
                    ) : (
                      <HouseLine size={17} aria-hidden="true" />
                    )}
                    {r.name}
                  </span>
                  <small>{formatNumber(r.netAreaM2)} m²</small>
                </button>
              ))}
              {!rooms.length && (
                <p className="nessuna-stanza">
                  Nessun ambiente. Crea una stanza o chiudi un contorno.
                </p>
              )}
            </div>
          </div>
        )}
        <div className="piede-lato">
          <span className="locale-indicatore">Archivio sul dispositivo</span>
          <small>Utenti autorizzati · Archivio locale</small>
        </div>
      </aside>
      <div className="contenuto contenuto-hvac">
        <header className="testata testata-hvac">
          <div>
            <span className="occhiello">
              Termoidraulica Staiano{userName ? ` · ${userName}` : ""}
            </span>
            <h1>{p?.name ?? "Progetta il tuo impianto"}</h1>
          </div>
          <div className="azioni-testata">
            <form action="/api/auth/logout" method="post">
              <button className="bottone tenue piccolo" type="submit">
                Esci
              </button>
            </form>
            <span
              className={`stato-salvataggio ${s.saveStatus === "error" ? "errore" : ""}`}
              role="status"
              data-testid="save-status"
            >
              {!p
                ? "Locale"
                : s.saveStatus === "saved"
                  ? "Salvato"
                  : s.saveStatus === "saving"
                    ? "Salvataggio…"
                    : s.saveStatus === "error"
                      ? "Non salvato"
                      : "Caricamento…"}
            </span>
            <button className="bottone" onClick={() => setNewDialog(true)}>
              <Plus />
              Nuovo
            </button>
            {p && (
              <>
                <button
                  className="bottone solo-icona"
                  title="Salva · Ctrl+S"
                  aria-label="Salva progetto"
                  onClick={() => void saveCurrent().catch(() => {})}
                >
                  <FloppyDisk />
                </button>
                <button
                  className="bottone"
                  onClick={() => {
                    try {
                      exportProject(p);
                    } catch {
                      s.setError(
                        "Esportazione non riuscita. Verificare il progetto.",
                      );
                    }
                  }}
                >
                  <DownloadSimple />
                  Esporta
                </button>
              </>
            )}
            <button
              className="bottone"
              onClick={() => fileInput.current?.click()}
            >
              <UploadSimple />
              Apri progetto
            </button>
          </div>
        </header>
        {p && (
          <div className="comandi-progetto">
            <label className="opzione-render-pdf">
              Documento{" "}
              <select
                aria-label="Tipo dossier"
                value={dossierVariant}
                disabled={pdfBusy}
                onChange={(e) =>
                  setDossierVariant(e.target.value as "complete" | "summary")
                }
              >
                <option value="complete">Dossier completo</option>
                <option value="summary">Dossier sintetico</option>
              </select>
            </label>
            <button
              className="bottone tenue piccolo"
              disabled={pdfBusy}
              onClick={() => {
                setPdfBusy(true);
                setPdfProgress("Preparazione documento");
                const controller = new AbortController();
                pdfController.current = controller;
                void import("@/services/pdf/download")
                  .then(({ downloadDossier }) =>
                    downloadDossier(p, {
                      includeRenders,
                      variant: dossierVariant,
                      floorId: s.activeFloorId,
                      roomId: s.selection.find((v) => v.kind === "room")?.id,
                      signal: controller.signal,
                      onProgress: setPdfProgress,
                    }),
                  )
                  .catch((error) => {
                    if (!(
                      error instanceof DOMException &&
                      error.name === "AbortError"
                    ))
                      s.setError(
                        error instanceof Error
                          ? error.message
                          : "PDF non generato. Verificare il progetto e riprovare.",
                      );
                  })
                  .finally(() => {
                    setPdfBusy(false);
                    pdfController.current = null;
                    setPdfProgress("");
                  });
              }}
            >
              <DownloadSimple /> {pdfBusy ? "Generazione PDF…" : "Dossier PDF"}
            </button>
            <label className="opzione-render-pdf">
              <input
                type="checkbox"
                checked={includeRenders}
                disabled={pdfBusy}
                onChange={(e) => setIncludeRenders(e.target.checked)}
              />
              Includi render 3D
            </label>
            <button
              className="bottone tenue piccolo"
              onClick={() => setBillOpen(true)}
            >
              Listino materiali
            </button>
            {pdfBusy && (
              <>
                <span role="status" className="nota">
                  {pdfProgress}
                </span>
                <button
                  className="bottone piccolo tenue"
                  onClick={() => pdfController.current?.abort()}
                >
                  Annulla documento
                </button>
              </>
            )}
            <button
              className="bottone tenue piccolo"
              onClick={() => void saveAs()}
            >
              Salva con nome
            </button>
            <button
              className="bottone tenue piccolo"
              onClick={() => {
                const name = window.prompt("Nome progetto", p.name);
                if (name?.trim())
                  s.commit((p) => ({ ...p, name: name.trim() }));
              }}
            >
              Rinomina progetto
            </button>
          </div>
        )}
        {billOpen && p && (
          <div
            className="sfondo-listino"
            role="dialog"
            aria-modal="true"
            aria-label="Listino materiali Ecoclima"
          >
            <div className="documento-listino">
              <button
                className="bottone piccolo tenue"
                aria-label="Chiudi listino"
                onClick={() => setBillOpen(false)}
              >
                Chiudi
              </button>
              <EcoclimaBill project={p} />
            </div>
          </div>
        )}
        {s.error && (
          <div className="avviso grave errore-app" role="alert">
            <WarningCircle />
            <span>{s.error}</span>
            <button
              aria-label="Chiudi errore"
              className="bottone tenue piccolo"
              onClick={() => s.setError(null)}
            >
              <X />
            </button>
          </div>
        )}
        {!ready ? (
          <div className="vuoto">Apertura archivio locale…</div>
        ) : page === "catalogs" ? (
          <CatalogAdmin />
        ) : !p ? (
          <main className="inizio">
            <span className="etichetta tinta">HVAC · 2D / 3D</span>
            <h2>
              Da misure reali
              <br />a un progetto chiaro.
            </h2>
            <p>
              Costruisci la planimetria, definisci gli ambienti e verifica il
              fabbisogno. Tutto resta sul tuo dispositivo.
            </p>
            <div className="scelte-inizio">
              <button onClick={() => void newProject("manual")}>
                <Square size={32} />
                <strong>Disegna manualmente</strong>
                <span>Parti da zero. Muri, quote esatte e stanze.</span>
              </button>
              <button onClick={() => void newProject("import")}>
                <UploadSimple size={32} />
                <strong>Importa planimetria</strong>
                <span>DXF, PDF o immagini: verifica scala e geometrie.</span>
              </button>
            </div>
            <p className="nota">
              Altezza suggerita 2,70 m. Modificabile per ogni stanza.
            </p>
          </main>
        ) : page === "projects" ? (
          <main className="pagina archivio">
            <div className="titolo-archivio">
              <h2>Progetti sul dispositivo</h2>
              <button
                className="bottone chiara"
                onClick={() => setNewDialog(true)}
              >
                <Plus />
                Nuovo progetto
              </button>
            </div>
            {projects.length === 0 ? (
              <div className="vuoto">Nessun progetto salvato.</div>
            ) : (
              <div className="elenco">
                {projects.map((item) => (
                  <div className="voce progetto-voce" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <p className="nota">
                        {item.rooms.length} ambienti · {item.floors.length}{" "}
                        piani ·{" "}
                        {new Date(item.updatedAt).toLocaleString("it-IT")}
                      </p>
                    </div>
                    <div className="azioni-progetto">
                      <button
                        className="bottone"
                        onClick={() => {
                          void (async () => {
                            try {
                              await flushSave();
                              const loaded = await repository.get(item.id);
                              if (loaded) {
                                s.load(loaded);
                                await repository.setActiveId(loaded.id);
                                setPage("editor");
                              }
                            } catch {
                              s.setError("Impossibile aprire il progetto.");
                            }
                          })();
                        }}
                      >
                        Apri
                      </button>
                      <button
                        className="bottone"
                        onClick={() => {
                          void (async () => {
                            const name = window.prompt(
                              "Nome della copia",
                              `${item.name} — copia`,
                            );
                            if (!name?.trim()) return;
                            try {
                              await flushSave();
                              const copy = duplicateProject(item, name.trim());
                              await repository.save(copy);
                              setProjects(await repository.list());
                            } catch {
                              s.setError("Duplicazione fallita.");
                            }
                          })();
                        }}
                      >
                        <Copy />
                        Duplica
                      </button>
                      <button
                        className="bottone"
                        onClick={() => {
                          void (async () => {
                            try {
                              const previous = await repository.previous(
                                item.id,
                              );
                              if (!previous) {
                                s.setError(
                                  "Nessun autosave precedente disponibile.",
                                );
                                return;
                              }
                              if (
                                window.confirm(
                                  `Recuperare lo snapshot precedente di ${item.name}?`,
                                )
                              ) {
                                await flushSave();
                                s.load(previous);
                                s.commit((p) => p);
                                setPage("editor");
                              }
                            } catch {
                              s.setError("Recupero autosave fallito.");
                            }
                          })();
                        }}
                      >
                        Recupera autosave
                      </button>
                      <button
                        className="bottone pericolo"
                        aria-label={`Elimina ${item.name}`}
                        onClick={() => {
                          void (async () => {
                            if (
                              !window.confirm(
                                `Eliminare ${item.name} dall'archivio locale? Esportare prima se necessario.`,
                              )
                            )
                              return;
                            try {
                              await flushSave();
                              await repository.delete(item.id);
                              if (
                                useProjectStore.getState().project?.id ===
                                item.id
                              )
                                useProjectStore.setState({
                                  project: null,
                                  selection: [],
                                  dirty: false,
                                });
                              setProjects(await repository.list());
                            } catch {
                              s.setError("Eliminazione progetto fallita.");
                            }
                          })();
                        }}
                      >
                        <Trash />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        ) : page === "checks" ? (
          <main className="pagina controlli">
            <h2>Controllo progetto</h2>
            <p className="nota">
              Controlli separati per geometria, scala e fabbisogno. Dati
              impianti saranno verificati dopo la selezione dei prodotti.
            </p>
            <div className="elenco lista-controlli">
              {checks.map((c, i) => (
                <div
                  key={`${c.code}-${i}`}
                  className={`voce controllo ${c.status}`}
                >
                  <span>
                    {c.status === "valid" ? <CheckCircle /> : <WarningCircle />}
                  </span>
                  <div>
                    <strong>{c.message}</strong>
                    <small>
                      {c.status === "valid"
                        ? "Valido"
                        : c.status === "warning"
                          ? "Attenzione"
                          : "Errore"}{" "}
                      · {c.code}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </main>
        ) : (
          <main className="configuratore">
            <ConfigurationWizard />
            <div className="barra-strumenti">
              <div className="strumenti-disegno">
                <select
                  aria-label="Elemento nel progetto"
                  value={
                    s.selection[0]?.kind === "device" ? s.selection[0].id : ""
                  }
                  onChange={(e) =>
                    s.select(
                      e.target.value
                        ? { kind: "device", id: e.target.value }
                        : null,
                    )
                  }
                >
                  <option value="">Seleziona apparecchio</option>
                  {[
                    ...p.radiators,
                    ...p.airTerminals,
                    ...(p.fanCoils ?? []),
                    ...p.plenums,
                    ...(p.pillars ?? []),
                    ...p.hvacSystems.flatMap((system) => system.indoorUnits),
                    ...(p.hydronicSystems?.map(
                      (system) => system.outdoorUnit,
                    ) ?? []),
                  ]
                    .filter((o) => o.floorId === s.activeFloorId)
                    .map((o) => (
                      <option value={o.id} key={o.id}>
                        {deviceCodes(p).get(o.id)} ·{" "}
                        {"family" in o
                          ? String(o.family)
                          : "model" in o
                            ? String(o.model ?? "Plenum")
                            : "productId" in o
                              ? String(o.productId)
                              : "Oggetto"}
                      </option>
                    ))}
                </select>
                <button
                  className="bottone piccolo tenue"
                  onClick={() =>
                    useProjectStore.setState({ pillarDialog: true })
                  }
                >
                  Aggiungi pilastro
                </button>
                {s.view === "2d" &&
                  tools.map((t) => (
                    <button
                      key={t.id}
                      className={`bottone piccolo ${s.tool === t.id ? "chiara" : "tenue"}`}
                      title={`${t.label} · ${t.shortcut}`}
                      aria-label={t.label}
                      aria-pressed={s.tool === t.id}
                      onClick={() => s.setTool(t.id)}
                    >
                      <t.icon />
                      <span>{t.label}</span>
                    </button>
                  ))}
                <button
                  className="bottone piccolo"
                  onClick={() => setRectangleOpen(true)}
                >
                  <Square />
                  {s.view === "3d" ? "Aggiungi stanza" : "Stanza rettangolare"}
                </button>
              </div>
              <div className="strumenti-cronologia">
                <button
                  className="bottone piccolo tenue"
                  aria-label="Annulla"
                  title="Annulla · Ctrl+Z"
                  disabled={!s.past.length}
                  onClick={s.undo}
                >
                  <ArrowCounterClockwise />
                </button>
                <button
                  className="bottone piccolo tenue"
                  aria-label="Ripeti"
                  title="Ripeti · Ctrl+Y"
                  disabled={!s.future.length}
                  onClick={s.redo}
                >
                  <ArrowClockwise />
                </button>
                <button
                  className="bottone piccolo tenue"
                  aria-label="Copia selezione"
                  disabled={!s.selection.length}
                  onClick={copySelection}
                >
                  <Copy />
                </button>
                <button
                  className="bottone piccolo pericolo"
                  aria-label="Elimina selezione"
                  disabled={!s.selection.length}
                  onClick={deleteSelection}
                >
                  <Trash />
                </button>
              </div>
            </div>
            <div className="barra-vista">
              <div className="titolo-vista">
                <strong>{floor?.name}</strong>
                <span>
                  {s.view === "3d"
                    ? "Ambienti e impianti"
                    : "Planimetria in metri"}
                </span>
              </div>
              <div className="opzioni-vista">
                {s.view === "2d" && (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={s.showGrid}
                        onChange={(e) =>
                          useProjectStore.setState({
                            showGrid: e.target.checked,
                          })
                        }
                      />
                      Griglia
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={s.snap.enabled}
                        onChange={(e) =>
                          useProjectStore.setState({
                            snap: { ...s.snap, enabled: e.target.checked },
                          })
                        }
                      />
                      Snap
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={s.snap.angle45}
                        onChange={(e) =>
                          useProjectStore.setState({
                            snap: { ...s.snap, angle45: e.target.checked },
                          })
                        }
                      />
                      45°
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={s.showDimensions}
                        onChange={(e) =>
                          useProjectStore.setState({
                            showDimensions: e.target.checked,
                          })
                        }
                      />
                      Quote
                    </label>
                  </>
                )}
                <button
                  className="bottone piccolo tenue"
                  onClick={() => {
                    setPlanFile(undefined);
                    setPlanOpen(true);
                  }}
                >
                  Importa planimetria
                </button>
                {floor?.background && (
                  <button
                    className="bottone piccolo tenue"
                    onClick={() => s.setTool("calibrate")}
                  >
                    Ricalibra
                  </button>
                )}
                <div className="selettore-vista">
                  <button
                    aria-pressed={s.view === "2d"}
                    className={s.view === "2d" ? "attivo" : ""}
                    onClick={() => s.setView("2d")}
                  >
                    <SquaresFour />
                    2D
                  </button>
                  <button
                    aria-pressed={s.view === "3d"}
                    className={s.view === "3d" ? "attivo" : ""}
                    onClick={() => s.setView("3d")}
                  >
                    <Cube />
                    3D
                  </button>
                </div>
              </div>
            </div>
            <div className="spazio-progetto">
              {s.view === "2d" ? (
                <Editor2D key={`${p.id}-${s.activeFloorId}`} />
              ) : (
                <Viewer3D />
              )}
              <Properties />
            </div>
            <footer className="riepilogo-progetto">
              <div>
                <strong>{p.rooms.length}</strong> ambienti <span>·</span>{" "}
                <strong>
                  {formatNumber(
                    p.rooms
                      .filter((r) => r.geometryStatus === "closed")
                      .reduce((n, r) => n + r.netAreaM2, 0),
                  )}
                </strong>{" "}
                m² netti <span>·</span>{" "}
                <strong>
                  {formatNumber(
                    p.rooms
                      .filter((r) => r.geometryStatus === "closed")
                      .reduce((n, r) => n + r.designLoadW, 0) / 1000,
                  )}
                </strong>{" "}
                kW
                {p.rooms.some((r) => r.geometryStatus === "unresolved") && (
                  <span className="nota">
                    {" "}
                    · Totali dei soli ambienti chiusi
                  </span>
                )}
              </div>
              <button
                onClick={() => setPage("checks")}
                className={`esito-controlli ${errors.length ? "invalid" : warnings.length ? "warning" : "valid"}`}
              >
                {errors.length ? <WarningCircle /> : <CheckCircle />}
                {errors.length
                  ? `${errors.length} errori`
                  : warnings.length
                    ? `${warnings.length} avvisi`
                    : "Geometria verificata"}
              </button>
            </footer>
          </main>
        )}
      </div>
      {rectangleOpen && p && (
        <div className="sfondo-dialogo">
          <section
            className="dialogo"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rectangle-title"
          >
            <div className="testata-dialogo">
              <div>
                <span className="occhiello">Creazione manuale</span>
                <h2 id="rectangle-title">Crea stanza rettangolare</h2>
              </div>
              <button
                aria-label="Chiudi stanza rettangolare"
                className="bottone tenue"
                onClick={() => setRectangleOpen(false)}
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                const previousRooms = p.rooms.length;
                s.commit((p) =>
                  addRectangle(p, s.activeFloorId, {
                    width: numberFromForm(data.get("width")),
                    length: numberFromForm(data.get("length")),
                    height: numberFromForm(data.get("height")),
                    name: String(data.get("name")),
                  }),
                );
                const updated = useProjectStore.getState().project;
                if (updated && updated.rooms.length > previousRooms) {
                  const room = updated.rooms.at(-1);
                  if (room) s.select({ kind: "room", id: room.id });
                  setRectangleOpen(false);
                }
              }}
            >
              <label className="campo">
                <span>Nome ambiente</span>
                <input
                  name="name"
                  defaultValue="Soggiorno"
                  maxLength={100}
                  autoFocus
                />
              </label>
              <div className="griglia-misure">
                <label className="campo">
                  <span>Larghezza netta (m)</span>
                  <input
                    name="width"
                    type="number"
                    defaultValue="4.20"
                    step="0.01"
                    min="0.1"
                    max="100"
                    required
                  />
                </label>
                <label className="campo">
                  <span>Lunghezza netta (m)</span>
                  <input
                    name="length"
                    type="number"
                    defaultValue="3.80"
                    step="0.01"
                    min="0.1"
                    max="100"
                    required
                  />
                </label>
              </div>
              <label className="campo">
                <span>Altezza (m)</span>
                <input
                  name="height"
                  type="number"
                  defaultValue={p.projectSettings.defaultHeightM}
                  step="0.01"
                  min="0.1"
                  max="30"
                  required
                />
              </label>
              <p className="nota">
                2,70 m è un valore suggerito. Inserisci l&apos;altezza reale.
              </p>
              <p className="avviso">
                Le misure sono interne. Il sistema genera quattro muri esterni
                da {p.projectSettings.externalWallThicknessM * 1000} mm.
              </p>
              {s.error && <p className="errore">{s.error}</p>}
              <div className="azioni">
                <button
                  type="button"
                  className="bottone"
                  onClick={() => setRectangleOpen(false)}
                >
                  Annulla
                </button>
                <button type="submit" className="bottone pieno">
                  Crea stanza
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {planOpen && (
        <PlanImportWizard
          initialFile={planFile}
          onClose={() => {
            setPlanOpen(false);
            setPlanFile(undefined);
          }}
          onImport={acceptPlan}
        />
      )}
      {s.view === "2d" && <PillarDialog />}
      {newDialog && (
        <div className="sfondo-dialogo">
          <section
            className="dialogo"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-title"
          >
            <div className="testata-dialogo">
              <h2 id="new-title">Nuovo progetto</h2>
              <button
                aria-label="Chiudi nuovo progetto"
                className="bottone tenue"
                onClick={() => setNewDialog(false)}
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                const mode =
                  (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                    "value",
                  ) === "import"
                    ? "import"
                    : "manual";
                void newProject(mode, String(data.get("name")));
              }}
            >
              <label className="campo">
                <span>Nome progetto</span>
                <input
                  name="name"
                  defaultValue="Nuovo progetto"
                  required
                  maxLength={150}
                  autoFocus
                />
              </label>
              <div className="azioni">
                <button className="bottone pieno" type="submit" value="manual">
                  Disegna manualmente
                </button>
                <button className="bottone" type="submit" value="import">
                  Importa planimetria
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
