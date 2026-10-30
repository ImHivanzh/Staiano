import type { Project } from "@/schemas/project";

export type CollectionChange = {
  key: string;
  label: string;
  added: number;
  removed: number;
  changed: number;
};

const labels: Record<string, string> = {
  floors: "Piani",
  walls: "Muri",
  rooms: "Stanze",
  openings: "Porte e finestre",
  pillars: "Pilastri",
  installations: "Installazioni",
  hvacSystems: "Impianti",
  airTerminals: "Bocchette",
  plenums: "Plenum",
  ducts: "Canali",
  fanCoils: "Ventilconvettori",
  outdoorUnits: "Unità esterne",
};

type Item = { id: string };
const items = (value: unknown): Item[] | undefined =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      item && typeof item === "object" && typeof (item as Item).id === "string",
  )
    ? (value as Item[])
    : undefined;

/** Per ogni elenco del progetto: elementi aggiunti, tolti e modificati (stesso id, contenuto diverso). */
export function compareProjects(
  previous: Project,
  current: Project,
): CollectionChange[] {
  const before = previous as unknown as Record<string, unknown>;
  const after = current as unknown as Record<string, unknown>;
  const result: CollectionChange[] = [];
  for (const key of Object.keys(after)) {
    const next = items(after[key]);
    if (!next) continue;
    const old = new Map((items(before[key]) ?? []).map((i) => [i.id, i]));
    const ids = new Set(next.map((item) => item.id));
    const change: CollectionChange = {
      key,
      label: labels[key] ?? key,
      added: 0,
      removed: [...old.keys()].filter((id) => !ids.has(id)).length,
      changed: 0,
    };
    for (const item of next) {
      const was = old.get(item.id);
      if (!was) change.added++;
      else if (JSON.stringify(was) !== JSON.stringify(item)) change.changed++;
    }
    if (change.added || change.removed || change.changed) result.push(change);
  }
  return result;
}
