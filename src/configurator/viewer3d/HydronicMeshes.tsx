"use client";
import { Line } from "@react-three/drei";
import type { Project, Selection } from "@/schemas/project";
import { heatPumpProductAtVersion } from "@/domain/catalogs/heat-pumps";
import { hydronicPipeRoute } from "@/domain/hydronic/routes";

export function HydronicMeshes({
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
      {(project.hydronicSystems ?? [])
        .filter((s) => !floorId || s.outdoorUnit.floorId === floorId)
        .map((s) => {
          const u = s.outdoorUnit,
            m = heatPumpProductAtVersion(s.productId, s.catalogVersion),
            w = u.widthMm / 1000,
            h = u.heightMm / 1000,
            d = u.depthMm / 1000;
          const selected = selection.some((item) => item.id === u.id),
            gree = m?.manufacturer === "Gree",
            fanRadius = Math.min(w * 0.28, h * 0.34);
          return (
            <group key={s.id}>
              <group
                position={[u.position.x, u.elevationM, u.position.y]}
                rotation={[0, -u.rotation, 0]}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.({ kind: "device", id: u.id });
                }}
              >
                <mesh castShadow receiveShadow>
                  <boxGeometry args={[w, h - 0.06, d]} />
                  <meshStandardMaterial
                    color={selected ? "#bfdde0" : gree ? "#7a7e83" : "#f0f0ed"}
                    metalness={0.22}
                    roughness={0.42}
                  />
                </mesh>
                <mesh position={[-w * 0.18, 0, d / 2 + 0.002]}>
                  <circleGeometry args={[fanRadius, 40]} />
                  <meshStandardMaterial color={gree ? "#151c23" : "#374047"} />
                </mesh>
                {Array.from({ length: 8 }, (_, i) => (
                  <mesh
                    key={i}
                    position={[-w * 0.18, 0, d / 2 + 0.006]}
                    rotation={[0, 0, (i * Math.PI) / 4]}
                  >
                    <boxGeometry args={[fanRadius * 2, 0.008, 0.008]} />
                    <meshStandardMaterial
                      color={gree ? "#535b63" : "#d2d5d4"}
                      metalness={0.45}
                    />
                  </mesh>
                ))}
                <mesh position={[-w * 0.18, 0, d / 2 + 0.01]}>
                  <ringGeometry args={[fanRadius * 0.88, fanRadius, 40]} />
                  <meshStandardMaterial color={gree ? "#333c43" : "#e4e5e2"} />
                </mesh>
                <mesh position={[-w * 0.18, 0, d / 2 + 0.015]}>
                  <circleGeometry args={[fanRadius * 0.16, 24]} />
                  <meshStandardMaterial color="#9aa1a4" metalness={0.5} />
                </mesh>
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
                s.fanCoilIds.map((id) => {
                  const path = hydronicPipeRoute(project, s, id);
                  if (path.length < 2) return null;
                  return (
                    <group key={id}>
                      {[
                        [-0.025, "#db7562"],
                        [0.025, "#66bde3"],
                      ].map(([offset, color]) => (
                        <Line
                          key={String(color)}
                          points={path.map(
                            (p) =>
                              [p.x + Number(offset), p.elevationM, p.y] as [
                                number,
                                number,
                                number,
                              ],
                          )}
                          color={String(color)}
                          lineWidth={2.5}
                          dashed
                          dashSize={0.1}
                          gapSize={0.045}
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
