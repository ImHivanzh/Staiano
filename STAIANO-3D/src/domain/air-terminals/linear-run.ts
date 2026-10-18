import type { Project } from "@/schemas/project";

type Terminal = Project["airTerminals"][number];

export function linearRunMembers(project: Project, terminal: Terminal) {
  const runId = terminal.commercialOptions?.linearRunId;
  return runId
    ? project.airTerminals
        .filter((item) => item.commercialOptions?.linearRunId === runId)
        .sort(
          (a, b) =>
            (a.commercialOptions?.linearRunOrder ?? 0) -
            (b.commercialOptions?.linearRunOrder ?? 0),
        )
    : [terminal];
}

/** Place modules edge to edge, around the whole point or a selected module. */
export function layoutLinearRun(
  members: Terminal[],
  pose: Pick<
    Terminal,
    "position" | "rotation" | "roomId" | "wallId" | "elevationM"
  >,
  anchorIndex?: number,
) {
  const anchorMm =
    anchorIndex === undefined
      ? members.reduce((sum, item) => sum + item.widthMm, 0) / 2
      : members
          .slice(0, anchorIndex)
          .reduce((sum, item) => sum + item.widthMm, 0) +
        members[anchorIndex].widthMm / 2;
  let offsetMm = 0;
  return members.map((item) => {
    const offsetM = (offsetMm + item.widthMm / 2 - anchorMm) / 1000;
    offsetMm += item.widthMm;
    return {
      ...item,
      rotation: pose.rotation,
      roomId: pose.roomId,
      wallId: pose.wallId,
      elevationM: pose.elevationM,
      position: {
        x: pose.position.x + Math.cos(pose.rotation) * offsetM,
        y: pose.position.y + Math.sin(pose.rotation) * offsetM,
      },
    };
  });
}
