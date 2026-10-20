"use client";
import { OutdoorBrackets } from "./OutdoorBrackets";
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
                <mesh castShadow receiveShadow>
                  <boxGeometry args={[w, h - 0.06, d]} />
                  <meshStandardMaterial
                    color={selected ? "#bfdde0" : "#f0f0ed"}
                    metalness={0.22}
                    roughness={0.42}
                  />
                </mesh>
                <mesh position={[-w * 0.18, 0, d / 2 + 0.002]}>
                  <circleGeometry args={[Math.min(w * 0.28, h * 0.34), 40]} />
                  <meshStandardMaterial color="#374047" />
                </mesh>
                {Array.from({ length: 8 }, (_, index) => (
                  <mesh
                    key={index}
                    position={[-w * 0.18, 0, d / 2 + 0.006]}
                    rotation={[0, 0, (index * Math.PI) / 4]}
                  >
                    <boxGeometry
                      args={[Math.min(w * 0.56, h * 0.68), 0.008, 0.008]}
                    />
                    <meshStandardMaterial color="#d2d5d4" metalness={0.45} />
                  </mesh>
                ))}
                {[-1, 1].map((sign) => (
                  <mesh
                    key={sign}
                    position={[sign * w * 0.32, -h / 2 + 0.015, 0]}
                  >
                    <boxGeometry args={[0.08, 0.03, d]} />
                    <meshStandardMaterial color="#252e35" roughness={0.65} />
                  </mesh>
                ))}
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
