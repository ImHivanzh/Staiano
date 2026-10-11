import { create } from "zustand";
import type { Project, Selection } from "@/schemas/project";
import { projectSchema } from "@/schemas/project";
import { recomputeProject } from "@/domain/project";
import { refreshDuctedBindings } from "@/domain/ducted/refresh";
import { refreshSplitBindings } from "@/domain/air-conditioning/refresh";
import type { SnapOptions } from "@/domain/geometry/primitives";
import {
  checkLockedObjects,
  recordOperatorChanges,
} from "@/domain/project-commands";

export type Tool = "select" | "wall" | "measure" | "pan" | "calibrate";
type State = {
  project: Project | null;
  activeFloorId: string;
  selection: Selection[];
  tool: Tool;
  view: "2d" | "3d";
  past: Project[];
  future: Project[];
  revision: number;
  dirty: boolean;
  saveStatus: "loading" | "saving" | "saved" | "error";
  saveConflict: boolean;
  error: string | null;
  snap: SnapOptions;
  showGrid: boolean;
  showDimensions: boolean;
  presentation: boolean;
  pillarDialog: boolean;
  load(p: Project): void;
  commit(fn: (p: Project) => Project): void;
  undo(): void;
  redo(): void;
  select(s: Selection | null, multiple?: boolean): void;
  setFloor(id: string): void;
  setTool(tool: Tool): void;
  setView(view: "2d" | "3d"): void;
  setError(error: string | null): void;
  markSaved(revision: number): void;
};
export const useProjectStore = create<State>((set, get) => ({
  project: null,
  activeFloorId: "",
  selection: [],
  tool: "select",
  view: "2d",
  past: [],
  future: [],
  revision: 0,
  dirty: false,
  saveStatus: "loading",
  saveConflict: false,
  error: null,
  snap: {
    enabled: true,
    orthogonal: true,
    angle45: false,
    parallel: true,
    grid: true,
    stepM: 0.1,
    toleranceM: 0.12,
  },
  showGrid: true,
  showDimensions: true,
  presentation: false,
  pillarDialog: false,
  load(p) {
    set({
      project: projectSchema.parse(
        refreshSplitBindings(refreshDuctedBindings(recomputeProject(p))),
      ),
      activeFloorId: p.floors[0].id,
      selection: [],
      past: [],
      future: [],
      revision: get().revision + 1,
      dirty: false,
      saveStatus: "saved",
      saveConflict: false,
      error: null,
    });
  },
  commit(fn) {
    const state = get();
    if (!state.project) return;
    try {
      const changed = fn(structuredClone(state.project));
      checkLockedObjects(state.project, changed);
      const next = refreshSplitBindings(
        refreshDuctedBindings(recordOperatorChanges(state.project, changed)),
      );
      next.updatedAt = new Date().toISOString();
      const valid = projectSchema.parse(next);
      const ids = new Set(
        [
          ...valid.rooms,
          ...valid.walls,
          ...valid.radiators,
          ...valid.airTerminals,
          ...valid.plenums,
          ...(valid.fanCoils ?? []),
          ...(valid.hydronicSystems ?? []).map((s) => s.outdoorUnit),
          ...(valid.pillars ?? []),
          ...(valid.ducts ?? []),
          ...valid.hvacSystems.flatMap((system) => system.indoorUnits),
        ].map((e) => e.id),
      );
      set({
        project: valid,
        past: [...state.past.slice(-49), state.project],
        future: [],
        dirty: true,
        revision: state.revision + 1,
        saveStatus: "saving",
        error: null,
        selection: state.selection.filter((s) => ids.has(s.id)),
      });
    } catch (e) {
      set({
        error:
          e instanceof Error && !("issues" in e)
            ? e.message
            : "Modifica non valida. Controllare misure e campi.",
      });
    }
  },
  undo() {
    const s = get(),
      p = s.past.at(-1);
    if (!p || !s.project) return;
    set({
      project: { ...p, updatedAt: new Date().toISOString() },
      past: s.past.slice(0, -1),
      future: [s.project, ...s.future],
      selection: [],
      dirty: true,
      revision: s.revision + 1,
      saveStatus: "saving",
    });
  },
  redo() {
    const s = get(),
      p = s.future[0];
    if (!p || !s.project) return;
    set({
      project: { ...p, updatedAt: new Date().toISOString() },
      past: [...s.past, s.project],
      future: s.future.slice(1),
      selection: [],
      dirty: true,
      revision: s.revision + 1,
      saveStatus: "saving",
    });
  },
  select(s, multiple = false) {
    set((state) => ({
      selection: !s
        ? []
        : multiple
          ? state.selection.some((v) => v.id === s.id)
            ? state.selection.filter((v) => v.id !== s.id)
            : [...state.selection, s]
          : [s],
    }));
  },
  setFloor(id) {
    set({ activeFloorId: id, selection: [] });
  },
  setTool(tool) {
    set({ tool });
  },
  setView(view) {
    set({ view });
  },
  setError(error) {
    set({ error });
  },
  markSaved(revision) {
    if (get().revision === revision) set({ dirty: false, saveStatus: "saved" });
  },
}));
