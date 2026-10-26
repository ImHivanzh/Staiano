"use client";
import { useEffect, useRef, useState } from "react";
import { NotificationToast } from "./NotificationToast";
import { FullscreenDialog } from "./FullscreenDialog";
import { terminalPlenum } from "@/domain/ducted/attached-plenums";
import { CustomerViewButton } from "./CustomerViewButton";
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
  BezierCurve,
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
  Users,
  ShieldCheck,
  ArrowRight,
  SidebarSimple,
  MagicWand,
  SignOut,
  PencilSimple,
} from "@phosphor-icons/react";
import {
  useProjectStore,
  type Tool,
  type PlanPlacementTool,
} from "@/stores/project-store";
import {
  addRectangle,
  clearProjectSystems,
  createProject,
  duplicateProject,
  newId,
} from "@/domain/project";
import {
  validateProject,
  projectProgress,
  resolveCheckTarget,
  filterProjectChecks,
  type Check,
  type CheckFilterStatus,
} from "@/domain/validation";
import {
  duplicateSelection,
  removeSelection,
} from "@/domain/geometry/selection";
import { exportProject, downloadFile } from "@/services/project/format";
import { importProjectFile } from "@/services/import/project-file";
import {
  configureProjectSession,
  flushSave,
  repository,
  saveCurrent,
  settlePendingSaves,
} from "@/services/project/session";
import { applyPlanImport } from "@/domain/geometry/import-plan";
import type { ImportedPlan } from "@/services/import/plan-types";
import { formatNumber, numberFromForm } from "@/utils/format";
import { THERMAL_COEFFICIENT_W_M3 } from "@/domain/thermal/calculate";
import { Editor2D } from "./editor2d/Editor2D";
import { GraphicalDuctedConfigurator } from "./systems/GraphicalDuctedConfigurator";
import { Properties, selectionWithProperties } from "./properties/Properties";
import { ConfigurationWizard } from "./import/ConfigurationWizard";
import { PillarDialog } from "./PillarDialog";
import type { Project } from "@/schemas/project";
import { LengthInput } from "./LengthInput";
import { ProjectSharing } from "./ProjectSharing";

const CatalogAdmin = dynamic(() =>
  import("./systems/CatalogAdmin").then((module) => module.CatalogAdmin),
);
const EcoclimaBill = dynamic(() =>
  import("./systems/EcoclimaBill").then((module) => module.EcoclimaBill),
);
const AdminUsers = dynamic(() =>
  import("./AdminUsers").then((module) => module.AdminUsers),
);
const LicensePanel = dynamic(() =>
  import("./LicensePanel").then((module) => module.LicensePanel),
);
const ProjectSettings = dynamic(() =>
  import("./ProjectSettings").then((module) => module.ProjectSettings),
);
const PdfPreview = dynamic(() =>
  import("./PdfPreview").then((module) => module.PdfPreview),
);
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
  { id: "select", label: "Seleziona", shortcut: "Spazio", icon: Cursor },
  { id: "wall", label: "Disegna muro", shortcut: "L", icon: LineSegment },
  { id: "wall-curve", label: "Muro curvo", shortcut: "U", icon: BezierCurve },
  { id: "measure", label: "Misura", shortcut: "T", icon: Ruler },
  { id: "pan", label: "Sposta vista", shortcut: "H", icon: Hand },
];

const equipmentShortcuts: Record<string, PlanPlacementTool> = {
  c: "connect",
  p: "heatPump",
  s: "split",
  n: "vrv",
  b: "point",
  v: "fanCoil",
};

export function Configurator() {
  const router = useRouter();
  const s = useProjectStore(),
    p = s.project;
  const [page, setPage] = useState<
      | "editor"
      | "projects"
      | "checks"
      | "catalogs"
      | "users"
      | "license"
      | "settings"
    >("editor"),
    [projects, setProjects] = useState<Project[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [projectOrder, setProjectOrder] = useState("recent");
  const [checkStatus, setCheckStatus] = useState<CheckFilterStatus>("problems");
  const [checkFloor, setCheckFloor] = useState("");
  const [checkRoom, setCheckRoom] = useState("");
  const [rectangleOpen, setRectangleOpen] = useState(false),
    [ready, setReady] = useState(false),
    [newDialog, setNewDialog] = useState<false | "choose" | "guided">(false);
  const [newCoefficient, setNewCoefficient] = useState(
    String(THERMAL_COEFFICIENT_W_M3),
  );
  const [pdfBusy, setPdfBusy] = useState(false);
  const [skpBusy, setSkpBusy] = useState(false);
  const [sheetsBusy, setSheetsBusy] = useState(false);
  const [sheetsNotice, setSheetsNotice] = useState("");
  const [dossierVariant, setDossierVariant] = useState<"complete" | "summary">(
    "complete",
  );
  const [dossierMonochrome, setDossierMonochrome] = useState(false);
  const [dossierPrices, setDossierPrices] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [flexibleOpen, setFlexibleOpen] = useState(false);
  useEffect(
    () =>
      useProjectStore.subscribe((state, previous) => {
        if (
          (state.tool !== previous.tool ||
            state.planPlacementTool !== previous.planPlacementTool) &&
          (state.tool !== "select" || state.planPlacementTool !== "select")
        )
          setFlexibleOpen(false);
      }),
    [],
  );
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [navigationOpen, setNavigationOpen] = useState(true);
  const revealedCheck = useRef<Check | null>(null);
  const [wizardReturn, setWizardReturn] = useState<{
    projectId: string;
    floorId: string;
  } | null>(null);
  const [pdfProgress, setPdfProgress] = useState("");
  const [pdfPreview, setPdfPreview] = useState<{
    blob: Blob;
    name: string;
  } | null>(null);
  const pdfController = useRef<AbortController | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [planFile, setPlanFile] = useState<File | undefined>(undefined);
  const [userName, setUserName] = useState("");
  const [identity, setIdentity] = useState<{
    username: string;
    role: "admin" | "operator";
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null),
    rasterInput = useRef<HTMLInputElement>(null),
    started = useRef(false);
  const activeProjectId = p?.id;
  useEffect(() => {
    const access = () =>
      useProjectStore.setState({
        readOnly: activeProjectId
          ? repository.isReadOnly(activeProjectId)
          : false,
      });
    access();
    window.addEventListener("shared-project-access", access);
    return () => window.removeEventListener("shared-project-access", access);
  }, [activeProjectId]);
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
          role: "admin" | "operator";
          mustChangePassword: boolean;
        };
        if (identity.mustChangePassword) {
          router.replace("/accedi");
          return;
        }
        configureProjectSession(identity.username);
        setUserName(identity.displayName);
        setIdentity({ username: identity.username, role: identity.role });
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
    const check = revealedCheck.current;
    if (!check || page !== "editor") return;
    const panel = document.getElementById("proprieta-progetto");
    if (!panel) return;
    const kind = useProjectStore.getState().selection[0]?.kind;
    const section = check.code.startsWith("opening")
      ? "Porte e finestre"
      : kind === "device"
        ? "Posizione"
        : check.code === "thermal"
          ? "Dettagli tecnici"
          : ["geometry", "name", "overlap"].includes(check.code)
            ? "Modifica stanza"
            : "Configura impianto";
    panel.querySelectorAll<HTMLDetailsElement>("details").forEach((details) => {
      if (details.querySelector("summary")?.textContent?.includes(section))
        details.open = true;
    });
    panel.focus({ preventScroll: true });
    panel.scrollIntoView({ block: "nearest" });
    revealedCheck.current = null;
  }, [page, s.selection]);
  useEffect(() => {
    const closeMenus = () => {
      document
        .querySelectorAll<HTMLDetailsElement>(
          'details[name="workspace-menus"][open], details[name="viewer-menus"][open]',
        )
        .forEach((menu) => {
          menu.open = false;
        });
    };
    const positionHeaderMenus = () => {
      document
        .querySelectorAll<HTMLDetailsElement>(
          ".azioni-testata .menu-progetto[open]",
        )
        .forEach((menu) => {
          const trigger = menu.querySelector("summary");
          if (trigger)
            menu.style.setProperty(
              "--header-menu-top",
              `${Math.ceil(trigger.getBoundingClientRect().bottom) + 4}px`,
            );
        });
    };
    const outsideMenu = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        !event.target.closest(
          'details[name="workspace-menus"], details[name="viewer-menus"]',
        )
      )
        closeMenus();
    };
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (
        e.key === "Escape" &&
        document.querySelector(
          'details[name="workspace-menus"][open], details[name="viewer-menus"][open]',
        )
      ) {
        closeMenus();
        return;
      }
      if (
        e.target instanceof HTMLElement &&
        (e.target.matches("input,select,textarea") ||
          e.target.isContentEditable)
      )
        return;
      const store = useProjectStore.getState();
      if (
        e.altKey ||
        (e.key !== "Escape" &&
          document.querySelector(
            'dialog[open],[role="dialog"][aria-modal="true"]',
          ))
      )
        return;
      if (e.key === " " && !e.ctrlKey && !e.metaKey) {
        if (
          e.target instanceof Element &&
          e.target.closest("button,summary,a,[role=button]") &&
          !e.target.closest('[role="toolbar"]')
        )
          return;
        e.preventDefault();
        store.setTool("select");
        useProjectStore.setState({ planPlacementTool: "select" });
        return;
      }
      if (e.key === "Escape") {
        store.setTool("select");
        useProjectStore.setState({ planPlacementTool: "select" });
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
      const placement = equipmentShortcuts[e.key.toLowerCase()];
      if (
        placement &&
        store.project?.rooms.some(
          (room) => room.floorId === store.activeFloorId,
        )
      ) {
        e.preventDefault();
        if (placement !== "connect" && store.view === "3d") store.setView("2d");
        store.setTool("select");
        useProjectStore.setState({
          planPlacementTool: placement,
          selection: [],
        });
        return;
      }
      const tool = tools.find(
        (t) => t.shortcut.toLowerCase() === e.key.toLowerCase(),
      );
      if (tool) {
        e.preventDefault();
        store.setTool(tool.id);
      }
      if (e.key.toLowerCase() === "r" && store.view === "2d") {
        e.preventDefault();
        store.setTool("select");
        useProjectStore.setState({ planPlacementTool: "select" });
        setRectangleOpen(true);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (!e.repeat) deleteSelection();
      }
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("pointerdown", outsideMenu);
    window.addEventListener("resize", positionHeaderMenus);
    document.addEventListener("toggle", positionHeaderMenus, true);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("pointerdown", outsideMenu);
      window.removeEventListener("resize", positionHeaderMenus);
      document.removeEventListener("toggle", positionHeaderMenus, true);
    };
  }, []);
  function copySelection() {
    const store = useProjectStore.getState();
    store.commit((project) => duplicateSelection(project, store.selection));
  }
  async function downloadTechnicalSheets() {
    if (!p || sheetsBusy) return;
    setSheetsBusy(true);
    setSheetsNotice("");
    try {
      const response = await fetch("/api/projects/technical-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).message ??
            "Download schede tecniche fallito.",
        );
      const blob = await response.blob();
      downloadFile(
        `${p.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 70)}-schede-tecniche.zip`,
        blob,
      );
      const count = Number(response.headers.get("X-Sheet-Count"));
      const missing = Number(response.headers.get("X-Missing-Sheet-Count"));
      setSheetsNotice(
        `${count} documenti scaricati.${missing ? ` ${missing} apparati senza scheda: vedi l’indice nello ZIP.` : ""}`,
      );
    } catch (error) {
      s.setError(
        error instanceof Error
          ? error.message
          : "Download schede tecniche fallito.",
      );
    } finally {
      setSheetsBusy(false);
    }
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
  function deleteSystems() {
    if (
      !window.confirm(
        "Cancellare l’impianto su tutti i piani? Verranno rimossi apparecchi, plenum, bocchette e collegamenti. Planimetria, muri, stanze, porte e finestre restano invariati. Sbloccare prima gli apparecchi bloccati. Ctrl+Z annulla.",
      )
    )
      return;
    s.commit(clearProjectSystems);
  }
  async function newProject(
    mode: "manual" | "import" | "guided",
    name = "Nuovo progetto",
  ) {
    try {
      await flushSave();
      const next = createProject(name, numberFromForm(newCoefficient));
      if (mode === "guided")
        next.floors[0].configurationWizard = {
          step: 0,
          confirmedSteps: [],
          status: "active",
        };
      await repository.save(next);
      await repository.setActiveId(next.id);
      s.load(next);
      setPage("editor");
      setNewDialog(false);
      if (mode === "manual") setRectangleOpen(true);
      else if (mode === "import") {
        setPlanFile(undefined);
        setPlanOpen(true);
      }
    } catch (e) {
      s.setError(
        e instanceof Error ? e.message : "Creazione progetto fallita.",
      );
    }
  }
  async function startWizard() {
    if (floor?.configurationWizard?.status === "active") {
      s.commit((project) => ({
        ...project,
        floors: project.floors.map((item) =>
          item.id === s.activeFloorId && item.configurationWizard
            ? {
                ...item,
                configurationWizard: {
                  ...item.configurationWizard,
                  status: "paused",
                },
              }
            : item,
        ),
      }));
      return;
    }
    if (!p) {
      setNewDialog("guided");
    } else {
      s.commit((project) => ({
        ...project,
        floors: project.floors.map((item) =>
          item.id === s.activeFloorId
            ? {
                ...item,
                configurationWizard: {
                  ...(item.configurationWizard ?? {
                    step: rooms.length ? 7 : 0,
                    confirmedSteps: [],
                  }),
                  status: "active",
                },
              }
            : item,
        ),
      }));
    }
    setPage("editor");
    setInspectorOpen(true);
  }
  async function showProjects() {
    try {
      await flushSave();
      await refreshProjects();
      setPage("projects");
    } catch (e) {
      s.setError(e instanceof Error ? e.message : "Archivio non disponibile.");
    }
  }
  async function refreshProjects() {
    setProjects(await repository.list());
    setArchiveError(repository.listError);
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
  async function resolveSaveConflict(copy: boolean) {
    const current = useProjectStore.getState().project;
    if (!current) return;
    if (
      !copy &&
      !window.confirm(
        "Caricare la versione nell’archivio e sostituire le modifiche non salvate? Salva prima una copia se vuoi conservarle.",
      )
    )
      return;
    try {
      await settlePendingSaves();
      if (!copy) await repository.setActiveId(current.id);
      const next = copy
        ? duplicateProject(current, `${current.name} — copia locale`)
        : await repository.get(current.id);
      if (!next) {
        s.setError(
          "Il progetto è stato eliminato dall’archivio. Salva una copia delle tue modifiche per conservarle.",
        );
        return;
      }
      if (copy) {
        await repository.save(next);
        await repository.setActiveId(next.id);
      }
      s.load(next);
      setPage("editor");
    } catch (error) {
      s.setError(
        error instanceof Error
          ? error.message
          : "Recupero del progetto fallito. Esporta le tue modifiche per conservarle.",
      );
    }
  }
  async function downloadSkp() {
    if (!p) return;
    setSkpBusy(true);
    try {
      await (
        await import("@/services/render3d/sketchup")
      ).downloadSketchup(p, s.activeFloorId);
    } catch (error) {
      s.setError(
        error instanceof Error
          ? error.message
          : "Esportazione SKP non riuscita.",
      );
    } finally {
      setSkpBusy(false);
    }
  }
  async function createPdf(
    preview: boolean,
    variant: "complete" | "summary" = dossierVariant,
  ) {
    if (!p) return;
    setPdfBusy(true);
    setPdfProgress("Preparazione documento");
    const controller = new AbortController();
    pdfController.current = controller;
    try {
      const { generateDossier, downloadDossier } =
        await import("@/services/pdf/download");
      const options = {
        variant,
        monochrome: dossierMonochrome,
        includePrices: dossierPrices,
        floorId: s.activeFloorId,
        roomId: s.selection.find((item) => item.kind === "room")?.id,
        signal: controller.signal,
        onProgress: setPdfProgress,
      };
      if (preview) {
        const document = await generateDossier(p, options);
        setPdfPreview(document);
      } else await downloadDossier(p, options);
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError"))
        s.setError(
          error instanceof Error
            ? error.message
            : "PDF non generato. Riprovare.",
        );
    } finally {
      setPdfBusy(false);
      pdfController.current = null;
      setPdfProgress("");
    }
  }
  async function createMaterialsPdf() {
    if (!p) return;
    setPdfBusy(true);
    try {
      const { downloadMaterials } = await import("@/services/pdf/download");
      await downloadMaterials(p);
    } catch (error) {
      s.setError(
        error instanceof Error
          ? error.message
          : "Distinta materiali non generata. Riprovare.",
      );
    } finally {
      setPdfBusy(false);
    }
  }
  async function exportMaterialsEasyfatt() {
    if (!p) return;
    setPdfBusy(true);
    try {
      const { materialsEasyfattXlsx } =
        await import("@/services/export/materials-easyfatt");
      const bytes = materialsEasyfattXlsx(structuredClone(p));
      const name =
        p.name.replace(/[^a-zA-Z0-9àèéìòù _-]/g, "").slice(0, 100) ||
        "progetto";
      downloadFile(
        `${name}-materiali-easyfatt.xlsx`,
        new Blob([new Uint8Array(bytes)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
    } catch (error) {
      s.setError(
        error instanceof Error
          ? error.message
          : "Esportazione Easyfatt non riuscita.",
      );
    } finally {
      setPdfBusy(false);
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
      setInspectorOpen(true);
    }
  }
  const checks = p ? validateProject(p) : [],
    errors = checks.filter((c) => c.status === "invalid"),
    warnings = checks.filter((c) => c.status === "warning");
  const progress = p ? projectProgress(p, checks) : null;
  const effectiveCheckFloor = p?.floors.some((item) => item.id === checkFloor)
    ? checkFloor
    : "";
  const checkRooms =
    p?.rooms.filter(
      (room) => !effectiveCheckFloor || room.floorId === effectiveCheckFloor,
    ) ?? [];
  const effectiveCheckRoom = checkRooms.some((room) => room.id === checkRoom)
    ? checkRoom
    : "";
  const visibleChecks = p
    ? filterProjectChecks(p, checks, {
        status: checkStatus,
        floorId: effectiveCheckFloor,
        roomId: effectiveCheckRoom,
      })
    : [];
  const visibleProjects = projects
    .filter((project) =>
      project.name
        .toLocaleLowerCase("it-IT")
        .includes(projectSearch.trim().toLocaleLowerCase("it-IT")),
    )
    .toSorted((a, b) =>
      projectOrder === "name"
        ? a.name.localeCompare(b.name, "it-IT")
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  function showCheck(check: Check) {
    if (!p) return;
    const target = resolveCheckTarget(p, check.entityId);
    if (!target) {
      s.setError(
        "Elemento non più disponibile. Ricalcola i controlli del progetto.",
      );
      return;
    }
    s.setFloor(target.floorId);
    s.select(target.selection);
    s.setTool(
      check.code === "scale" &&
        p.floors.find((f) => f.id === target.floorId)?.background
        ? "calibrate"
        : "select",
    );
    s.setView("2d");
    if (p.ducts?.some((duct) => duct.id === check.entityId))
      setFlexibleOpen(true);
    useProjectStore.setState({ presentation: false, installationPlanId: null });
    setInspectorOpen(true);
    revealedCheck.current = check;
    setPage("editor");
  }
  const floor = p?.floors.find((f) => f.id === s.activeFloorId),
    rooms = p?.rooms.filter((r) => r.floorId === s.activeFloorId) ?? [];
  const ductedSelection =
    s.selection.length > 0 &&
    s.selection.every(
      (item) =>
        item.kind === "device" &&
        (p?.airTerminals.some((terminal) => terminal.id === item.id) ||
          p?.ductedDrafts?.some((draft) => draft.id === item.id) ||
          p?.hydronicSystems?.some(
            (system) => system.outdoorUnit.id === item.id,
          ) ||
          p?.hvacSystems.some(
            (system) =>
              system.type === "ducted" &&
              system.indoorUnits.some((unit) => unit.id === item.id),
          )),
    );
  const propertySelection = p ? selectionWithProperties(p, s.selection) : [];
  const showInspector =
    inspectorOpen &&
    s.view === "2d" &&
    ((propertySelection.length > 0 && !ductedSelection) ||
      floor?.configurationWizard?.status === "active" ||
      wizardReturn?.projectId === p?.id);
  const ActiveDrawingIcon =
    tools.find((tool) => tool.id === s.tool && tool.id !== "select")?.icon ??
    PencilSimple;
  const drawingTools = (
    <details className="menu-progetto" name="workspace-menus">
      <summary
        className="bottone piccolo"
        aria-label="Disegno e misure"
        title={
          s.tool === "select"
            ? "Disegno e misure"
            : `${tools.find((tool) => tool.id === s.tool)?.label ?? "Disegno"} attivo · Disegno e misure`
        }
        data-active={s.tool !== "select"}
      >
        <ActiveDrawingIcon size={20} aria-hidden="true" />
      </summary>
      <div className="strumenti-disegno">
        {(rooms.length
          ? tools.filter((tool) => tool.id !== "select")
          : tools
        ).map((t) => (
          <button
            type="button"
            key={t.id}
            className={`bottone piccolo ${s.tool === t.id ? "chiara" : "tenue"}`}
            title={`${t.label} (${t.shortcut})`}
            aria-label={t.label}
            aria-keyshortcuts={t.id === "select" ? "Space" : t.shortcut}
            aria-pressed={s.tool === t.id}
            onClick={(event) => {
              s.setTool(t.id);
              const menu = event.currentTarget.closest("details");
              if (menu) {
                menu.open = false;
                menu.querySelector("summary")?.focus();
              }
            }}
          >
            <t.icon aria-hidden="true" />
            <span>{t.id === "wall" ? "Muro dritto" : t.label}</span>
            <kbd>{t.shortcut}</kbd>
          </button>
        ))}
        <button
          type="button"
          className="bottone piccolo strumento-stanza"
          aria-label="Stanza rettangolare"
          title="Stanza rettangolare (R)"
          aria-keyshortcuts="R"
          onClick={(event) => {
            const menu = event.currentTarget.closest("details");
            if (menu) menu.open = false;
            setRectangleOpen(true);
          }}
        >
          <Square aria-hidden="true" />
          Stanza rettangolare <kbd>R</kbd>
        </button>
      </div>
    </details>
  );
  return (
    <div
      className={`app hvac-app ${navigationOpen ? "" : "navigazione-compatta"} ${s.presentation ? "modo-cliente" : ""}`}
    >
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
      <aside className="barra-lato" id="navigazione-progetto">
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
        <nav className="voci" aria-label="Navigazione principale">
          <button
            className={`voce-nav ${page === "editor" ? "attiva" : ""}`}
            aria-current={page === "editor" ? "page" : undefined}
            aria-label="Planimetria"
            title="Planimetria"
            onClick={() => setPage("editor")}
          >
            <HouseLine /> Planimetria
          </button>
          <button
            className={`voce-nav ${page === "projects" ? "attiva" : ""}`}
            aria-current={page === "projects" ? "page" : undefined}
            aria-label="Progetti"
            title="Progetti locali e condivisi"
            onClick={() => void showProjects()}
          >
            <FolderOpen /> Progetti
          </button>
          <button
            className={`voce-nav ${page === "checks" ? "attiva" : ""}`}
            aria-current={page === "checks" ? "page" : undefined}
            aria-label="Controlli"
            title="Controlli"
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
            aria-current={page === "catalogs" ? "page" : undefined}
            aria-label="Cataloghi tecnici"
            title="Cataloghi tecnici"
            onClick={() => setPage("catalogs")}
          >
            <SquaresFour />
            Cataloghi tecnici
          </button>
          {identity?.role === "admin" && (
            <button
              className={`voce-nav ${page === "users" ? "attiva" : ""}`}
              aria-current={page === "users" ? "page" : undefined}
              aria-label="Gestione utenti"
              title="Gestione utenti"
              onClick={() => setPage("users")}
            >
              <Users />
              Gestione utenti
            </button>
          )}
          {identity?.role === "admin" && (
            <button
              className={`voce-nav ${page === "license" ? "attiva" : ""}`}
              aria-current={page === "license" ? "page" : undefined}
              aria-label="Licenza"
              title="Licenza"
              onClick={() => setPage("license")}
            >
              <ShieldCheck />
              Licenza
            </button>
          )}
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
                  aria-pressed={s.selection.some((v) => v.id === r.id)}
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
                    ) : r.systemType === "split" || r.systemType === "vrv" ? (
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
          <span className="locale-indicatore">
            {userName || "Staiano HVAC"}
          </span>
          <small>Archivio sul dispositivo</small>
        </div>
      </aside>
      <div className="contenuto contenuto-hvac">
        <header className="testata testata-hvac">
          <button
            className="bottone tenue comando-icona"
            aria-label="Pannello ambienti"
            title="Mostra o nascondi ambienti e navigazione"
            aria-expanded={navigationOpen}
            aria-controls="navigazione-progetto"
            onClick={() => setNavigationOpen((open) => !open)}
          >
            <SidebarSimple aria-hidden="true" />
          </button>
          <div className="titolo-progetto">
            <h1>
              {page === "projects"
                ? "Progetti locali e condivisi"
                : page === "catalogs"
                  ? "Cataloghi tecnici"
                  : page === "checks"
                    ? "Controlli progetto"
                    : page === "users"
                      ? "Gestione utenti"
                      : page === "license"
                        ? "Licenza"
                        : page === "settings"
                          ? "Impostazioni progetto"
                          : (p?.name ?? "Il tuo spazio di progettazione")}
            </h1>
            <p className="sottotitolo-progetto">
              {page === "editor"
                ? "Planimetrie, ambienti e impianti"
                : "Termoidraulica Staiano"}
            </p>
          </div>
          <div className="azioni-testata">
            {p && identity && (
              <ProjectSharing
                key={p.id}
                project={p}
                username={identity.username}
              />
            )}
            {p && page === "editor" && (
              <div
                className="comandi-rapidi"
                role="group"
                aria-label="Comandi rapidi progetto"
              >
                <button
                  className="bottone tenue comando-icona"
                  aria-label="Salva"
                  title="Salva (Ctrl+S)"
                  onClick={() => void saveCurrent().catch(() => {})}
                >
                  <FloppyDisk aria-hidden="true" />
                </button>
                <button
                  className="bottone tenue comando-icona"
                  aria-label="Annulla"
                  title="Annulla (Ctrl+Z)"
                  disabled={!s.past.length || s.readOnly}
                  onClick={s.undo}
                >
                  <ArrowCounterClockwise aria-hidden="true" />
                </button>
                <button
                  className="bottone tenue comando-icona"
                  aria-label="Ripristina"
                  title="Ripristina (Ctrl+Y)"
                  disabled={!s.future.length || s.readOnly}
                  onClick={s.redo}
                >
                  <ArrowClockwise aria-hidden="true" />
                </button>
                <button
                  className="bottone tenue comando-icona"
                  aria-label="Scarica dossier sintetico PDF"
                  title={
                    pdfBusy ? pdfProgress : "Scarica dossier sintetico PDF"
                  }
                  disabled={pdfBusy}
                  aria-busy={pdfBusy}
                  onClick={() => void createPdf(false, "summary")}
                >
                  <DownloadSimple aria-hidden="true" />
                </button>
              </div>
            )}
            <span
              className={`stato-salvataggio ${s.saveStatus === "error" ? "errore" : ""}`}
              role="status"
            >
              <span data-testid="save-status">
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
              {p && s.saveStatus === "saved" && (
                <span>
                  {p && repository.isShared(p.id)
                    ? "sul server condiviso"
                    : "su questo dispositivo"}
                </span>
              )}
            </span>
            <button
              className="bottone pieno avvio-wizard"
              aria-label={
                floor?.configurationWizard?.status === "active"
                  ? "Chiudi wizard"
                  : floor?.configurationWizard?.status === "paused"
                    ? "Riprendi wizard"
                    : floor?.configurationWizard
                      ? "Apri wizard"
                      : "Avvia wizard"
              }
              title={
                floor?.configurationWizard?.status === "active"
                  ? "Chiudi wizard"
                  : "Percorso guidato"
              }
              aria-pressed={floor?.configurationWizard?.status === "active"}
              onClick={() => void startWizard()}
              disabled={!ready}
            >
              <MagicWand aria-hidden="true" />
              {floor?.configurationWizard?.status === "active"
                ? "Chiudi wizard"
                : floor?.configurationWizard?.status === "paused"
                  ? "Riprendi wizard"
                  : floor?.configurationWizard
                    ? "Apri wizard"
                    : "Avvia wizard"}
            </button>
            <button
              className="bottone nuovo-progetto"
              aria-label="Nuovo"
              title="Nuovo progetto"
              onClick={() => setNewDialog("choose")}
            >
              <Plus />
              Nuovo
            </button>
            <details className="menu-progetto" name="workspace-menus">
              <summary className="bottone">
                <FolderOpen aria-hidden="true" /> File
              </summary>
              <div className="comandi-progetto">
                <p className="nota">
                  I progetti restano nel browser di questo dispositivo. Usa
                  Esporta per backup o trasferimento.
                </p>
                {p && (
                  <>
                    <button
                      className="bottone"
                      onClick={(event) => {
                        setPage("settings");
                        event.currentTarget
                          .closest("details")
                          ?.removeAttribute("open");
                      }}
                    >
                      Impostazioni progetto e piani
                    </button>
                    <button
                      className="bottone"
                      title="Salva (Ctrl+S)"
                      aria-label="Salva progetto"
                      onClick={(event) => {
                        void saveCurrent().catch(() => {});
                        event.currentTarget
                          .closest("details")
                          ?.removeAttribute("open");
                      }}
                    >
                      <FloppyDisk />
                      Salva progetto
                    </button>
                    <button
                      className="bottone"
                      onClick={(event) => {
                        try {
                          exportProject(p);
                          event.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
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
                    <button
                      className="bottone"
                      disabled={skpBusy}
                      aria-busy={skpBusy}
                      title="Piano attivo: planimetria importata, muri, apparecchi e canali. Geometrie e colori di base in formato SketchUp."
                      onClick={(event) => {
                        event.currentTarget
                          .closest("details")
                          ?.removeAttribute("open");
                        void downloadSkp();
                      }}
                    >
                      <DownloadSimple />
                      {skpBusy ? "Preparazione SKP…" : "Scarica modello SKP"}
                    </button>
                  </>
                )}
                <button
                  className="bottone"
                  onClick={(event) => {
                    fileInput.current?.click();
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute("open");
                  }}
                >
                  <UploadSimple />
                  Apri progetto
                </button>
                {p && (
                  <>
                    <h2 className="titolo-menu">Documenti</h2>
                    <label className="opzione-render-pdf">
                      Documento{" "}
                      <select
                        aria-label="Tipo dossier"
                        value={dossierVariant}
                        disabled={pdfBusy}
                        onChange={(e) =>
                          setDossierVariant(
                            e.target.value as "complete" | "summary",
                          )
                        }
                      >
                        <option value="complete">Dossier completo</option>
                        <option value="summary">Dossier sintetico</option>
                      </select>
                    </label>
                    <label className="opzione-render-pdf">
                      <input
                        type="checkbox"
                        checked={dossierMonochrome}
                        disabled={pdfBusy}
                        onChange={(e) => setDossierMonochrome(e.target.checked)}
                      />
                      Stampa in bianco e nero
                    </label>
                    <label className="opzione-render-pdf">
                      <input
                        type="checkbox"
                        checked={dossierPrices}
                        disabled={pdfBusy}
                        onChange={(e) => setDossierPrices(e.target.checked)}
                      />
                      Includi prezzi di listino
                    </label>
                    <button
                      className="bottone tenue piccolo"
                      disabled={pdfBusy}
                      onClick={() => void createPdf(false)}
                    >
                      <DownloadSimple />{" "}
                      {pdfBusy ? "Generazione PDF…" : "Dossier PDF"}
                    </button>
                    <button
                      className="bottone tenue piccolo"
                      disabled={pdfBusy}
                      onClick={() => void createMaterialsPdf()}
                    >
                      <DownloadSimple /> Distinta materiali PDF · per stanza
                    </button>
                    <button
                      className="bottone tenue piccolo"
                      disabled={pdfBusy}
                      onClick={() => void exportMaterialsEasyfatt()}
                    >
                      <DownloadSimple /> Materiali per Danea Easyfatt · Excel
                    </button>
                    <p className="nota">
                      Easyfatt: importa le righe nel modello Excel del
                      preventivo. Codici e prezzi non disponibili restano vuoti
                      nel file; consulta il foglio “Da completare”.
                    </p>
                    <button
                      className="bottone tenue piccolo"
                      disabled={pdfBusy}
                      onClick={() => void createPdf(true)}
                    >
                      Anteprima PDF
                    </button>
                    <button
                      className="bottone tenue piccolo"
                      disabled={sheetsBusy}
                      onClick={() => void downloadTechnicalSheets()}
                    >
                      <DownloadSimple />
                      {sheetsBusy
                        ? "Preparazione schede tecniche…"
                        : "Scarica schede tecniche"}
                    </button>
                    {sheetsNotice && (
                      <NotificationToast message={sheetsNotice} tone="info" />
                    )}
                    <p className="nota">
                      Il dossier include sempre il render 3D.
                    </p>
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
                  </>
                )}
                <form action="/api/auth/logout" method="post">
                  <button
                    className="bottone tenue"
                    type="submit"
                    aria-label="Esci"
                    title="Esci"
                  >
                    <SignOut aria-hidden="true" />
                    Esci
                  </button>
                </form>
              </div>
            </details>
          </div>
        </header>
        {billOpen && p && (
          <FullscreenDialog
            open
            title="Listino materiali Ecoclima"
            closeLabel="Chiudi listino"
            onClose={() => setBillOpen(false)}
          >
            <EcoclimaBill project={p} />
          </FullscreenDialog>
        )}
        {(s.error || s.saveConflict) && (
          <NotificationToast
            message={
              s.error ??
              "Conflitto di salvataggio. Conserva una copia delle tue modifiche o carica la versione nell’archivio."
            }
            className="errore-app"
            persistent={s.saveConflict}
            onDismiss={() => s.setError(null)}
          >
            {s.saveConflict && (
              <div className="azioni">
                <button
                  className="bottone piccolo"
                  onClick={() => void resolveSaveConflict(true)}
                >
                  Salva copia delle mie modifiche
                </button>
                <button
                  className="bottone piccolo"
                  onClick={() => void resolveSaveConflict(false)}
                >
                  Carica versione archivio
                </button>
              </div>
            )}
          </NotificationToast>
        )}
        {!ready ? (
          <div className="vuoto">Apertura archivio locale…</div>
        ) : page === "catalogs" ? (
          <CatalogAdmin />
        ) : page === "settings" && p ? (
          <ProjectSettings project={p} />
        ) : page === "users" && identity?.role === "admin" ? (
          <AdminUsers username={identity.username} />
        ) : page === "license" && identity?.role === "admin" ? (
          <LicensePanel />
        ) : !p && page !== "projects" ? (
          <main className="inizio">
            <h2>Da misure reali a un progetto chiaro.</h2>
            <p>
              Costruisci la planimetria, definisci gli ambienti e verifica il
              fabbisogno. I progetti restano locali finché non li condividi.
            </p>
            <label className="campo" style={{ maxWidth: "24rem" }}>
              <span id="start-coefficient-label">
                Coefficiente termico (W/m³)
              </span>
              <input
                type="number"
                min="0"
                step="any"
                required
                value={newCoefficient}
                onChange={(event) => setNewCoefficient(event.target.value)}
                aria-describedby="start-coefficient-help"
                aria-labelledby="start-coefficient-label"
              />
              <small id="start-coefficient-help">
                Fabbisogno = volume netto × coefficiente. Usato per tutti gli
                ambienti.
              </small>
            </label>
            <div className="scelte-inizio">
              <button
                className="inizio-manuale"
                onClick={() => void newProject("manual")}
              >
                <span className="icona-inizio">
                  <Square size={28} aria-hidden="true" />
                </span>
                <strong>Disegna manualmente</strong>
                <span>Parti da zero. Muri, quote esatte e stanze.</span>
                <span className="azione-inizio">
                  Crea progetto <ArrowRight size={18} aria-hidden="true" />
                </span>
              </button>
              <button
                className="inizio-import"
                onClick={() => void newProject("import")}
              >
                <span className="icona-inizio">
                  <UploadSimple size={28} aria-hidden="true" />
                </span>
                <strong>Importa planimetria</strong>
                <span>
                  DWG, DXF, PDF o immagini. Verifica scala e geometrie.
                </span>
                <span className="azione-inizio">
                  Carica file <ArrowRight size={18} aria-hidden="true" />
                </span>
              </button>
            </div>
            <ol className="passi-inizio" aria-label="Fasi del progetto">
              <li>
                <span>01</span> Definisci gli ambienti
              </li>
              <li>
                <span>02</span> Verifica il fabbisogno
              </li>
              <li>
                <span>03</span> Configura l’impianto
              </li>
            </ol>
            <p className="nota">
              Altezza suggerita 3,00 m. Modificabile per ogni stanza.
            </p>
          </main>
        ) : page === "projects" ? (
          <main className="pagina archivio">
            <div className="titolo-archivio">
              <h2>Archivio progetti</h2>
              <button
                className="bottone chiara"
                onClick={() => setNewDialog("choose")}
              >
                <Plus />
                Nuovo progetto
              </button>
            </div>
            <p className="nota">
              Progetti condivisi e progetti locali di questo browser. Esporta i
              progetti in .hvacproj per conservarne una copia.
            </p>
            {archiveError && (
              <div role="alert" className="warning">
                <p>{archiveError}</p>
                <button className="bottone" onClick={() => void showProjects()}>
                  Riprova
                </button>
              </div>
            )}
            <div
              className="filtri-progetto"
              role="search"
              aria-label="Ricerca progetti"
            >
              <label className="campo">
                <span>Cerca progetto</span>
                <input
                  type="search"
                  value={projectSearch}
                  onChange={(event) => setProjectSearch(event.target.value)}
                />
              </label>
              <label className="campo">
                <span>Ordina progetti</span>
                <select
                  value={projectOrder}
                  onChange={(event) => setProjectOrder(event.target.value)}
                >
                  <option value="recent">Ultima modifica</option>
                  <option value="name">Nome A–Z</option>
                </select>
              </label>
            </div>
            <p className="nota" role="status">
              {visibleProjects.length} di {projects.length} progetti
            </p>
            {projects.length === 0 ? (
              <div className="vuoto">Nessun progetto salvato.</div>
            ) : !visibleProjects.length ? (
              <div className="vuoto">
                Nessun progetto corrisponde alla ricerca.
              </div>
            ) : (
              <div className="elenco">
                {visibleProjects.map((item) => (
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
                              await refreshProjects();
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
                                await repository.setActiveId(previous.id);
                                await repository.get(previous.id);
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
                                `Eliminare ${item.name} dall'archivio? Se condiviso, viene eliminato per tutti. Esportare prima se necessario.`,
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
                              await refreshProjects();
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
              Geometria e completezza dell’impianto sono verificate
              separatamente. Il dossier resta preliminare e richiede verifica
              tecnica prima dell’esecuzione.
            </p>
            {progress && (
              <div className="stato-progetto" aria-label="Stato del progetto">
                <span
                  className={progress.geometryVerified ? "valid" : "warning"}
                >
                  {progress.geometryVerified
                    ? "Geometria verificata"
                    : "Geometria da verificare"}
                </span>
                <strong className={progress.status}>{progress.label}</strong>
              </div>
            )}
            <div className="filtri-progetto" aria-label="Filtri controlli">
              <label className="campo">
                <span>Esito controlli</span>
                <select
                  value={checkStatus}
                  onChange={(event) =>
                    setCheckStatus(event.target.value as CheckFilterStatus)
                  }
                >
                  <option value="problems">Errori e avvisi</option>
                  <option value="invalid">Solo errori</option>
                  <option value="warning">Solo avvisi</option>
                  <option value="all">Tutti i controlli</option>
                </select>
              </label>
              <label className="campo">
                <span>Piano dei controlli</span>
                <select
                  value={effectiveCheckFloor}
                  onChange={(event) => {
                    setCheckFloor(event.target.value);
                    setCheckRoom("");
                  }}
                >
                  <option value="">Tutti i piani</option>
                  {p?.floors.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Ambiente dei controlli</span>
                <select
                  value={effectiveCheckRoom}
                  onChange={(event) => setCheckRoom(event.target.value)}
                >
                  <option value="">Tutti gli ambienti</option>
                  {checkRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name || "Senza nome"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="nota" role="status">
              {visibleChecks.length} di {checks.length} controlli. I controlli
              generali restano visibili nei filtri per piano e ambiente.
            </p>
            <div className="elenco lista-controlli">
              {!visibleChecks.length && (
                <p className="vuoto">
                  Nessun controllo corrisponde ai filtri selezionati.
                </p>
              )}
              {visibleChecks.map((c, i) => (
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
                  {p &&
                    c.status !== "valid" &&
                    resolveCheckTarget(p, c.entityId) && (
                      <button
                        className="bottone piccolo azione-controllo"
                        onClick={() => showCheck(c)}
                      >
                        Mostra nel progetto
                      </button>
                    )}
                </div>
              ))}
            </div>
          </main>
        ) : p ? (
          <main
            className={`configuratore ${showInspector ? "" : "inspector-chiuso"} ${floor?.configurationWizard?.status === "active" ? "wizard-attivo" : ""} ${s.view === "3d" ? "modo-3d" : ""}`}
          >
            {s.view === "2d" && !s.installationPlanId && rooms.length === 0 && (
              <div className="barra-strumenti">{drawingTools}</div>
            )}
            {!s.installationPlanId && (
              <div className="barra-vista">
                <div className="titolo-vista">
                  <div className="piano-mobile">
                    <select
                      aria-label="Piano attivo su schermo ridotto"
                      value={s.activeFloorId}
                      onChange={(e) => s.setFloor(e.target.value)}
                    >
                      {p.floors.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Ambiente su schermo ridotto"
                      value={
                        s.selection[0]?.kind === "room" ? s.selection[0].id : ""
                      }
                      onChange={(e) =>
                        s.select(
                          e.target.value
                            ? { kind: "room", id: e.target.value }
                            : null,
                        )
                      }
                    >
                      <option value="">Seleziona ambiente</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <strong>{floor?.name}</strong>
                  <span>
                    {s.view === "3d"
                      ? "Ambienti e impianti"
                      : "Planimetria in metri"}
                  </span>
                </div>
                <div className="opzioni-vista">
                  <details
                    className="menu-progetto menu-modifica"
                    name="workspace-menus"
                  >
                    <summary className="bottone piccolo">Modifica</summary>
                    <div className="comandi-progetto">
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
                      {s.view === "3d" && (
                        <button
                          className="bottone piccolo"
                          onClick={() => setRectangleOpen(true)}
                        >
                          Aggiungi stanza
                        </button>
                      )}
                      <select
                        aria-label="Elemento nel progetto"
                        value={
                          s.selection[0]?.kind === "device"
                            ? s.selection[0].id
                            : ""
                        }
                        onChange={(e) => {
                          s.select(
                            e.target.value
                              ? { kind: "device", id: e.target.value }
                              : null,
                          );
                          e.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                        }}
                      >
                        <option value="">Seleziona apparecchio</option>
                        {[
                          ...p.radiators,
                          ...p.airTerminals,
                          ...(p.fanCoils ?? []),
                          ...p.plenums,
                          ...(p.pillars ?? []),
                          ...p.hvacSystems.flatMap(
                            (system) => system.indoorUnits,
                          ),
                          ...p.hvacSystems.flatMap((system) =>
                            system.outdoorUnit ? [system.outdoorUnit] : [],
                          ),
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
                        className="bottone piccolo tenue strumento-pilastro"
                        onClick={() =>
                          useProjectStore.setState({ pillarDialog: true })
                        }
                      >
                        Aggiungi pilastro
                      </button>
                      <div className="strumenti-cronologia">
                        <button
                          className="bottone piccolo tenue"
                          aria-label="Annulla"
                          title="Annulla (Ctrl+Z)"
                          disabled={!s.past.length}
                          onClick={s.undo}
                        >
                          <ArrowCounterClockwise />
                          Annulla
                        </button>
                        <button
                          className="bottone piccolo tenue"
                          aria-label="Ripeti"
                          title="Ripeti (Ctrl+Y)"
                          disabled={!s.future.length}
                          onClick={s.redo}
                        >
                          <ArrowClockwise />
                          Ripeti
                        </button>
                        <button
                          className="bottone piccolo tenue"
                          aria-label="Copia selezione"
                          title="Copia selezione (Ctrl+C)"
                          aria-keyshortcuts="Control+C"
                          disabled={!s.selection.length}
                          onClick={copySelection}
                        >
                          <Copy />
                          Copia
                        </button>
                        <button
                          className="bottone piccolo pericolo"
                          aria-label="Elimina selezione"
                          title="Elimina selezione (Canc / Backspace)"
                          aria-keyshortcuts="Delete Backspace"
                          disabled={!s.selection.length}
                          onClick={deleteSelection}
                        >
                          <Trash />
                          Elimina
                        </button>
                      </div>
                      <button
                        className="bottone piccolo pericolo"
                        onClick={deleteSystems}
                      >
                        <Trash aria-hidden="true" />
                        Cancella impianto
                      </button>
                    </div>
                  </details>
                  {s.view === "2d" && (
                    <details className="menu-progetto" name="workspace-menus">
                      <summary className="bottone piccolo">Opzioni 2D</summary>
                      <div className="comandi-progetto">
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
                      </div>
                    </details>
                  )}
                  <button
                    type="button"
                    className="bottone piccolo chiara"
                    aria-pressed={flexibleOpen}
                    onClick={() => {
                      setFlexibleOpen(true);
                      s.setTool("select");
                      useProjectStore.setState({ planPlacementTool: "select" });
                      const duct = p.ducts?.find(
                        (d) =>
                          d.kind === "flexible" &&
                          !d.locked &&
                          p.airTerminals.some(
                            (t) =>
                              t.id === d.terminalId && terminalPlenum(p, t),
                          ) &&
                          p.plenums.some(
                            (pl) =>
                              pl.id === d.plenumId &&
                              pl.floorId === s.activeFloorId,
                          ),
                      );
                      s.select(duct ? { kind: "device", id: duct.id } : null);
                    }}
                  >
                    Flessibili
                  </button>
                  <div className="selettore-vista">
                    <button
                      aria-pressed={s.view === "2d"}
                      className={s.view === "2d" ? "attivo" : ""}
                      onClick={() => {
                        s.setView("2d");
                      }}
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
                  {s.view === "2d" && (
                    <button
                      className={`bottone piccolo ${showInspector ? "chiara" : "tenue"}`}
                      aria-label="Mostra proprietà"
                      title="Mostra o nascondi proprietà"
                      aria-expanded={showInspector}
                      aria-controls="proprieta-progetto"
                      onClick={() => setInspectorOpen((open) => !open)}
                    >
                      <SidebarSimple aria-hidden="true" />
                      Proprietà
                    </button>
                  )}
                  <CustomerViewButton />
                </div>
              </div>
            )}
            <div className="spazio-progetto">
              {s.view === "2d" ? (
                rooms.length > 0 ? (
                  <GraphicalDuctedConfigurator
                    key={`${p.id}-${s.activeFloorId}`}
                    project={p}
                    room={rooms[0]}
                    mainPlan
                    drawingTools={drawingTools}
                    editFlexible={flexibleOpen}
                    onCloseFlexible={() => {
                      setFlexibleOpen(false);
                      s.select(null);
                    }}
                  />
                ) : (
                  <Editor2D key={`${p.id}-${s.activeFloorId}`} />
                )
              ) : (
                <Viewer3D
                  editFlexible={flexibleOpen}
                  onCloseFlexible={() => {
                    setFlexibleOpen(false);
                    s.select(null);
                  }}
                />
              )}
              <div
                className="pannello-progetto"
                id="proprieta-progetto"
                tabIndex={-1}
                hidden={!showInspector || !!s.installationPlanId}
              >
                {wizardReturn?.projectId === p.id ? (
                  <button
                    className="bottone piccolo"
                    onClick={() => {
                      if (
                        p.floors.some(
                          (item) => item.id === wizardReturn.floorId,
                        )
                      )
                        s.setFloor(wizardReturn.floorId);
                      s.select(null);
                      setWizardReturn(null);
                    }}
                  >
                    Torna alla verifica guidata
                  </button>
                ) : (
                  <ConfigurationWizard
                    onShowCheck={(check) => {
                      setWizardReturn({
                        projectId: p.id,
                        floorId: s.activeFloorId,
                      });
                      showCheck(check);
                    }}
                    onDrawRoom={() => setRectangleOpen(true)}
                    onImportPlan={() => {
                      setPlanFile(undefined);
                      setPlanOpen(true);
                    }}
                  />
                )}
                {propertySelection.length > 0 && <Properties />}
              </div>
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
                className={`esito-controlli ${progress?.status}`}
              >
                {progress?.status === "valid" ? (
                  <CheckCircle />
                ) : (
                  <WarningCircle />
                )}
                <span className="stato-progetto" data-testid="project-progress">
                  <span
                    className={progress?.geometryVerified ? "valid" : "warning"}
                  >
                    {progress?.geometryVerified
                      ? "Geometria verificata"
                      : "Geometria da verificare"}
                  </span>
                  <strong>{progress?.label}</strong>
                  {!!(errors.length + warnings.length) && (
                    <span>
                      {errors.length} errori · {warnings.length} avvisi
                    </span>
                  )}
                </span>
              </button>
            </footer>
          </main>
        ) : null}
      </div>
      {pdfPreview && (
        <FullscreenDialog
          open
          title="Anteprima dossier PDF"
          closeLabel="Chiudi anteprima PDF"
          onClose={() => setPdfPreview(null)}
        >
          <div className="anteprima-pdf">
            <p className="nota">
              Documento preliminare. Controlla tavole e avvisi prima della
              consegna.
            </p>
            <PdfPreview blob={pdfPreview.blob} />
            <div className="azioni">
              <button
                className="bottone pieno"
                onClick={() => downloadFile(pdfPreview.name, pdfPreview.blob)}
              >
                Scarica questo PDF
              </button>
            </div>
          </div>
        </FullscreenDialog>
      )}
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
                <LengthInput
                  label="Larghezza netta"
                  name="width"
                  defaultValue={4.2}
                  step={0.01}
                  min={0.1}
                  max={100}
                  required
                />
                <LengthInput
                  label="Lunghezza netta"
                  name="length"
                  defaultValue={3.8}
                  step={0.01}
                  min={0.1}
                  max={100}
                  required
                />
              </div>
              <LengthInput
                label="Altezza"
                name="height"
                defaultValue={p.projectSettings.defaultHeightM}
                step={0.01}
                min={0.1}
                max={30}
                required
              />
              <p className="nota">
                {formatNumber(p.projectSettings.defaultHeightM)} m è il valore
                predefinito. Inserisci l&apos;altezza reale.
              </p>
              <p className="avviso">
                Le misure sono interne. Il sistema genera quattro muri esterni
                da {p.projectSettings.externalWallThicknessM * 1000} mm.
              </p>
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
                  newDialog === "guided"
                    ? "guided"
                    : (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
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
              <label className="campo">
                <span id="new-coefficient-label">
                  Coefficiente termico (W/m³)
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={newCoefficient}
                  onChange={(event) => setNewCoefficient(event.target.value)}
                  aria-describedby="new-coefficient-help"
                  aria-labelledby="new-coefficient-label"
                />
                <small id="new-coefficient-help">
                  Fabbisogno = volume netto × coefficiente. Modificabile nelle
                  impostazioni del progetto.
                </small>
              </label>
              <div className="azioni">
                {newDialog === "guided" ? (
                  <button
                    className="bottone pieno"
                    type="submit"
                    value="guided"
                  >
                    Avvia procedura guidata
                  </button>
                ) : (
                  <>
                    <button
                      className="bottone pieno"
                      type="submit"
                      value="manual"
                    >
                      Disegna manualmente
                    </button>
                    <button className="bottone" type="submit" value="import">
                      Importa planimetria
                    </button>
                  </>
                )}
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
