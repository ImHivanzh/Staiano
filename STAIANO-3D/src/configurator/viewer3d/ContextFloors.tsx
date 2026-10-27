"use client";
import { useEffect, useRef } from "react";
import type { Group } from "three";
import type { Floor, Project } from "@/schemas/project";
import { ArchitectureMeshes } from "./ArchitectureMeshes";

const ignoreSelection = () => {};

/** Scostamento verticale del piano rispetto a quello attivo, che resta a quota 0. */
export function floorOffsetM(
  floors: readonly Floor[],
  floor: Floor,
  active: Floor,
  storeyM: number,
) {
  const offset = floor.elevationM - active.elevationM;
  if (offset !== 0) return offset;
  // Quote uguali (progetti importati): si segue l'ordine dei piani.
  return (floors.indexOf(floor) - floors.indexOf(active)) * storeyM;
}

/** Gli altri piani compaiono sopra o sotto quello attivo, senza interazione. */
export function ContextFloors({
  project,
  activeFloorId,
  hiddenFloorIds,
  floorFinish,
}: {
  project: Project;
  activeFloorId: string;
  hiddenFloorIds: ReadonlySet<string>;
  floorFinish: "oak" | "stone";
}) {
  const active = project.floors.find((floor) => floor.id === activeFloorId);
  if (!active) return null;
  const storeyM = project.projectSettings.defaultHeightM;
  return (
    <>
      {project.floors
        .filter((floor) => floor.id !== activeFloorId)
        .filter((floor) => !hiddenFloorIds.has(floor.id))
        .map((floor) => (
          <ContextFloor
            key={floor.id}
            project={project}
            floor={floor}
            offsetM={floorOffsetM(project.floors, floor, active, storeyM)}
            floorFinish={floorFinish}
          />
        ))}
    </>
  );
}

function ContextFloor({
  project,
  floor,
  offsetM,
  floorFinish,
}: {
  project: Project;
  floor: Floor;
  offsetM: number;
  floorFinish: "oak" | "stone";
}) {
  const group = useRef<Group>(null);
  // Il piano di contesto non deve intercettare i clic destinati al piano attivo.
  useEffect(() => {
    group.current?.traverse((object) => {
      object.raycast = () => {};
    });
  });
  return (
    <group ref={group} position={[0, offsetM, 0]} data-context-floor={floor.id}>
      <ArchitectureMeshes
        context
        walls={project.walls.filter((wall) => wall.floorId === floor.id)}
        rooms={project.rooms.filter((room) => room.floorId === floor.id)}
        openings={project.openings.filter(
          (opening) => opening.floorId === floor.id,
        )}
        defaultHeightM={project.projectSettings.defaultHeightM}
        selection={[]}
        onSelect={ignoreSelection}
        floorFinish={floorFinish}
      />
    </group>
  );
}
