import type { Project } from "@/schemas/project";
import { recomputeProject } from "./project";

function objects(project: Project) {
  return [
    ...project.walls,
    ...project.radiators,
    ...project.airTerminals,
    ...project.plenums,
    ...(project.fanCoils ?? []),
    ...(project.hydronicSystems ?? []).map((s) => s.outdoorUnit),
    ...project.hvacSystems.flatMap((s) =>
      s.outdoorUnit ? [s.outdoorUnit] : [],
    ),
    ...(project.pillars ?? []),
    ...(project.ducts ?? []),
    ...project.hvacSystems.flatMap((s) => s.indoorUnits),
  ];
}

/** Guard the command boundary, including multi-selection and property edits. */
export function checkLockedObjects(before: Project, after: Project) {
  const next = new Map(objects(after).map((o) => [o.id, o]));
  for (const old of objects(before).filter((o) => o.locked)) {
    const candidate = next.get(old.id);
    if (!candidate)
      throw new Error("Sbloccare l’elemento prima di eliminarlo.");
    if (!candidate.locked) continue;
    for (const key of [
      "start",
      "end",
      "position",
      "rotation",
      "widthMm",
      "heightMm",
      "depthMm",
      "thickness",
      "elevationM",
      "wallId",
      "roomId",
      "waypoints",
      "routing",
    ])
      if (
        JSON.stringify((old as unknown as Record<string, unknown>)[key]) !==
        JSON.stringify((candidate as unknown as Record<string, unknown>)[key])
      )
        throw new Error(
          "Elemento bloccato: sbloccarlo prima di modificarne la geometria.",
        );
  }
}

/** Record manual decisions from every editor, without marking derived flow changes. */
export function recordOperatorChanges(
  before: Project,
  after: Project,
): Project {
  const previous = new Map(before.airTerminals.map((t) => [t.id, t]));
  const changedSystems = new Set<string>();
  const airTerminals = after.airTerminals.map((t) => {
    const old = previous.get(t.id);
    if (!old) return t;
    const changed = [
      "position",
      "rotation",
      "widthMm",
      "heightMm",
      "wallId",
      "roomId",
      "elevationM",
      "productId",
      "style",
      "color",
      "finish",
      "plenumId",
      "commercialOptions",
    ].some(
      (key) =>
        JSON.stringify(old[key as keyof typeof old]) !==
        JSON.stringify(t[key as keyof typeof t]),
    );
    if (!changed) return t;
    if (t.systemId) changedSystems.add(t.systemId);
    return { ...t, decisionOrigin: "manual" as const };
  });
  for (const old of before.airTerminals)
    if (old.systemId && !airTerminals.some((t) => t.id === old.id))
      changedSystems.add(old.systemId);
  const validDucts = (after.ducts ?? []).filter(
    (d) =>
      after.plenums.some(
        (pl) => pl.id === d.plenumId && pl.systemId === d.systemId,
      ) &&
      (!d.terminalId ||
        airTerminals.some(
          (t) =>
            t.id === d.terminalId &&
            t.plenumId === d.plenumId &&
            t.systemId === d.systemId,
        )),
  );
  const next = {
    ...after,
    airTerminals,
    ducts: validDucts,
    walls: after.walls.map((w) => {
      const old = before.walls.find((v) => v.id === w.id);
      return old?.recognition &&
        ["start", "end", "thickness"].some(
          (key) =>
            JSON.stringify(old[key as keyof typeof old]) !==
            JSON.stringify(w[key as keyof typeof w]),
        )
        ? {
            ...w,
            recognition: { ...old.recognition, origin: "manual" as const },
          }
        : w;
    }),
    hvacSystems: after.hvacSystems.map((s) =>
      changedSystems.has(s.id) && s.linearPlan && s.linearPlan.status !== "none"
        ? { ...s, linearPlan: { ...s.linearPlan, status: "modified" as const } }
        : s,
    ),
  };
  // Topology changes clean dependent references; pillar edits recalculate net area.
  return JSON.stringify(before.pillars) !== JSON.stringify(next.pillars) ||
    JSON.stringify(before.fanCoils?.map((u) => [u.id, u.roomId])) !==
      JSON.stringify(next.fanCoils?.map((u) => [u.id, u.roomId])) ||
    JSON.stringify(before.hvacSystems.map((s) => [s.id, s.roomIds])) !==
      JSON.stringify(next.hvacSystems.map((s) => [s.id, s.roomIds])) ||
    before.plenums.length !== next.plenums.length ||
    before.airTerminals.length !== next.airTerminals.length ||
    before.hvacSystems.length !== next.hvacSystems.length
    ? recomputeProject(next)
    : next;
}
