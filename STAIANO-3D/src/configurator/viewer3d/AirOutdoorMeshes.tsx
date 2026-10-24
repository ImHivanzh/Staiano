"use client";
import { OutdoorBrackets } from "./OutdoorBrackets";
import { OutdoorCabinet } from "./OutdoorCabinet";
import { Line } from "@react-three/drei";
import type { Project, Selection } from "@/schemas/project";
import { refrigerantRoute } from "@/domain/air-conditioning/outdoor";

/** Outdoor unit and illustrative refrigerant lines for split and VRV systems. */
export function AirOutdoorMeshes({
  project,
  floorId,
  showPipes = false,
  selection = [],
  onSelect,
}: {
  project: Project;
  floorId?: string;
  showPipes?: boolean;
  selection?: Selection[];
  onSelect?: (selection: Selection) => void;
}) {
  return (
    <group>
      {project.hvacSystems
        .filter(
          (system) =>
            system.outdoorUnit &&
            (!floorId || system.outdoorUnit.floorId === floorId),
        )
        .map((system) => {
          const unit = system.outdoorUnit!;
          const selected = selection.some((item) => item.id === unit.id);
          const w = unit.widthMm / 1000,
            h = unit.heightMm / 1000,
            d = unit.depthMm / 1000;
          return (
            <group key={system.id}>
              <group
                position={[unit.position.x, unit.elevationM, unit.position.y]}
                rotation={[0, -unit.rotation, 0]}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect?.({ kind: "device", id: unit.id });
                }}
              >
                {unit.mounting === "brackets" && (
                  <OutdoorBrackets widthM={w} heightM={h} depthM={d} />
                )}
                <OutdoorCabinet
                  widthM={w}
                  heightM={h}
                  depthM={d}
                  selected={selected}
                />
              </group>
              {showPipes &&
                system.indoorUnits
                  .filter((indoor) => indoor.floorId === unit.floorId)
                  .map((indoor) => {
                    const path = refrigerantRoute(project, system, indoor.id);
                    if (path.length < 2) return null;
                    return (
                      <group key={indoor.id}>
                        {[
                          [-0.022, "#db7562"],
                          [0.022, "#66bde3"],
                        ].map(([offset, color]) => (
                          <Line
                            key={String(color)}
                            points={path.map(
                              (point) =>
                                [
                                  point.x + Number(offset),
                                  point.elevationM,
                                  point.y,
                                ] as [number, number, number],
                            )}
                            color={String(color)}
                            lineWidth={2}
                            dashed
                            dashSize={0.1}
                            gapSize={0.05}
                          />
                        ))}
                      </group>
                    );
                  })}
            </group>
          );
        })}
    </group>
  );
}
