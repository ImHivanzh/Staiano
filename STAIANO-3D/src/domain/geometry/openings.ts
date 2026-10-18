import type { Project } from "@/schemas/project";
import { distance } from "./primitives";

export type OpeningMeasurements = Pick<
  Project["openings"][number],
  "type" | "offsetM" | "widthM" | "heightM" | "sillHeightM"
>;

/** A measured opening; cosmetic render details do not change these dimensions. */
export function saveOpening(
  project: Project,
  wallId: string,
  measurements: OpeningMeasurements,
  id?: string,
): Project {
  const wall = project.walls.find((w) => w.id === wallId);
  if (!wall) throw new Error("Parete non trovata.");
  if (id && !project.openings.some((o) => o.id === id && o.wallId === wallId))
    throw new Error("Apertura non trovata.");
  const base = measurements.type === "window" ? measurements.sillHeightM : 0;
  if (base === null)
    throw new Error("Inserire la quota davanzale della finestra.");
  const height =
    wall.height ??
    (Math.max(
      0,
      ...project.rooms
        .filter((r) => r.wallIds.includes(wallId))
        .map((r) => r.heightM),
    ) ||
      project.projectSettings.defaultHeightM);
  if (
    ![
      measurements.offsetM,
      measurements.widthM,
      measurements.heightM,
      base,
    ].every(Number.isFinite) ||
    measurements.offsetM < 0 ||
    measurements.widthM <= 0 ||
    measurements.heightM <= 0 ||
    base < 0 ||
    measurements.offsetM + measurements.widthM >
      distance(wall.start, wall.end) + 1e-7 ||
    base + measurements.heightM > height + 1e-7
  )
    throw new Error(
      "L’apertura deve rientrare nella lunghezza e nell’altezza della parete.",
    );
  const overlap = project.openings.some(
    (o) =>
      o.wallId === wallId &&
      o.id !== id &&
      o.offsetM < measurements.offsetM + measurements.widthM - 1e-7 &&
      measurements.offsetM < o.offsetM + o.widthM - 1e-7,
  );
  if (overlap)
    throw new Error("Un’altra apertura occupa questa posizione della parete.");
  const opening = {
    ...measurements,
    id: id ?? crypto.randomUUID(),
    wallId,
    floorId: wall.floorId,
    sillHeightM: measurements.type === "door" ? 0 : base,
  };
  return {
    ...project,
    openings: id
      ? project.openings.map((o) => (o.id === id ? opening : o))
      : [...project.openings, opening],
  };
}
