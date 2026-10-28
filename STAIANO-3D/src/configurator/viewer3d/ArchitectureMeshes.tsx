"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Room, Selection, Wall } from "@/schemas/project";
import { distance } from "@/domain/geometry/primitives";
import {
  architecturalWallHeight,
  measuredOpenings,
  roomWallSpan,
  wallPanels,
  type ArchitecturalOpening,
  type WallOpening,
  type WallPanel,
} from "./architecture-geometry";
import { useSurfaceMaterials } from "./use-surface-materials";
import { drywallGeometries } from "@/domain/geometry/drywall";
import { drywallSides } from "@/domain/geometry/drywall-sides";
import { doorThresholdGeometry } from "./door-threshold-geometry";

export type ArchitectureMeshesProps = {
  walls: readonly Wall[];
  rooms: readonly Room[];
  openings: readonly ArchitecturalOpening[];
  defaultHeightM: number;
  selection: readonly Selection[];
  onSelect: (selection: Selection) => void;
  /** Only foreground walls get clipped; rear walls retain true height. */
  cutWallIds?: ReadonlySet<string>;
  cutHeightM?: number;
  isolatedRoom?: Room;
  floorFinish?: "oak" | "stone";
  onReady?: () => void;
  technicalVoids?: boolean;
  /** Piano mostrato solo come contesto: niente attributi di test né interazione. */
  context?: boolean;
  /** Ante delle porte (livello attivabile): spente, resta il vano vuoto con il solo telaio. */
  doors?: boolean;
};

type WallExtension = { startM: number; endM: number; lengthM: number };

function boxesGeometry(
  panels: readonly WallPanel[],
  depth: number,
  z = 0,
  extension?: WallExtension,
) {
  const boxes = panels.map((p) => {
    // Fill the half-thickness notch where two wall boxes meet at a corner.
    const left =
        extension && p.left <= 1e-9 ? p.left - extension.startM : p.left,
      right =
        extension && p.right >= extension.lengthM - 1e-9
          ? p.right + extension.endM
          : p.right;
    const box = new THREE.BoxGeometry(right - left, p.top - p.bottom, depth);
    box.translate((left + right) / 2, (p.bottom + p.top) / 2, z);
    // Box top uses section material. All other faces remain plaster.
    box.groups.forEach((group) => {
      group.materialIndex = group.materialIndex === 2 ? 1 : 0;
    });
    return box;
  });
  const merged = boxes.length
    ? mergeGeometries(boxes, true)!
    : new THREE.BufferGeometry();
  // Two material groups, regardless of panel count, keep large plans affordable.
  merged.clearGroups();
  let indexOffset = 0;
  const indices: [number[], number[]] = [[], []];
  boxes.forEach((box) => {
    box.groups.forEach((g) => {
      const target = indices[g.materialIndex === 1 ? 1 : 0];
      for (let i = g.start; i < g.start + g.count; i++)
        target.push(merged.index!.getX(indexOffset + i));
    });
    indexOffset += box.index?.count ?? 0;
    box.dispose();
  });
  if (boxes.length) {
    merged.setIndex([...indices[0], ...indices[1]]);
    merged.addGroup(0, indices[0].length, 0);
    merged.addGroup(indices[0].length, indices[1].length, 1);
  }
  return merged;
}

function RoomFloor({
  room,
  chosen,
  onSelect,
  textures,
  floorFinish,
}: {
  room: Room;
  chosen: boolean;
  onSelect: ArchitectureMeshesProps["onSelect"];
  textures: ReturnType<typeof useSurfaceMaterials>;
  floorFinish?: "oak" | "stone";
}) {
  const tiled = floorFinish === "stone";
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    room.polygon.forEach((p, i) =>
      i ? shape.lineTo(p.x, -p.y) : shape.moveTo(p.x, -p.y),
    );
    shape.closePath();
    const result = new THREE.ExtrudeGeometry(shape, {
      depth: 0.065,
      bevelEnabled: false,
    });
    const uv = result.getAttribute("uv");
    const metricPeriod = tiled ? 1.5 : 1.7;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, uv.getX(i) / metricPeriod, uv.getY(i) / metricPeriod);
    uv.needsUpdate = true;
    return result;
  }, [room.polygon, tiled]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const line = room.polygon.map(
    (p) => [p.x, 0.019, p.y] as [number, number, number],
  );
  if (line[0]) line.push(line[0]);
  if (room.geometryStatus === "unresolved")
    return (
      <Line
        points={line}
        color="#b96f4d"
        dashed
        dashSize={0.11}
        gapSize={0.08}
        lineWidth={1.4}
      />
    );
  return (
    <group>
      <mesh
        geometry={geometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.057, 0]}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelect({ kind: "room", id: room.id });
        }}
      >
        <meshPhysicalMaterial
          attach="material-0"
          map={tiled ? textures.stone : textures.wood}
          normalMap={tiled ? textures.stoneNormal : textures.woodNormal}
          normalScale={new THREE.Vector2(0.2, 0.2)}
          roughnessMap={
            tiled ? textures.stoneRoughness : textures.woodRoughness
          }
          roughness={tiled ? 0.82 : 0.65}
          clearcoat={tiled ? 0 : 0.12}
          clearcoatRoughness={0.5}
          color="#ffffff"
        />
        <meshStandardMaterial
          attach="material-1"
          color="#c5bba9"
          roughness={0.95}
        />
      </mesh>
      {chosen && <Line points={line} color="#159bbb" lineWidth={1.7} />}
    </group>
  );
}

function DoorThreshold({
  wall,
  opening,
  rooms,
  defaultHeightM,
  textures,
  floorFinish,
}: {
  wall: Wall;
  opening: ArchitecturalOpening;
  rooms: readonly Room[];
  defaultHeightM: number;
  textures: ReturnType<typeof useSurfaceMaterials>;
  floorFinish?: "oak" | "stone";
}) {
  const tiled = floorFinish === "stone",
    period = tiled ? 1.5 : 1.7;
  const aperture = useMemo(
    () =>
      measuredOpenings(
        wall,
        [opening],
        architecturalWallHeight(wall, rooms, defaultHeightM),
      ).find((item) => item.type === "door"),
    [wall, opening, rooms, defaultHeightM],
  );
  const geometry = useMemo(() => {
    if (!aperture) return null;
    return doorThresholdGeometry(wall, aperture, period);
  }, [aperture, wall, period]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!aperture || !geometry) return null;
  return (
    <group
      position={[wall.start.x, 0, wall.start.y]}
      rotation={[
        0,
        -Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x),
        0,
      ]}
    >
      <mesh geometry={geometry} receiveShadow>
        <meshPhysicalMaterial
          map={tiled ? textures.stone : textures.wood}
          normalMap={tiled ? textures.stoneNormal : textures.woodNormal}
          roughnessMap={
            tiled ? textures.stoneRoughness : textures.woodRoughness
          }
          roughness={tiled ? 0.82 : 0.65}
          clearcoat={tiled ? 0 : 0.12}
          clearcoatRoughness={0.5}
        />
      </mesh>
    </group>
  );
}

function OpeningFrame({
  opening,
  thickness,
}: {
  opening: WallOpening;
  thickness: number;
}) {
  const { left, right, bottom, top } = opening;
  const width = right - left;
  const height = top - bottom;
  const rim = Math.min(0.05, width / 8, height / 8);
  const color = opening.type === "door" ? "#ece5d7" : "#efeee9";
  const depth =
    opening.type === "door" ? thickness + 0.012 : Math.min(thickness, 0.085);
  const frame = [
    { p: [left + rim / 2, (bottom + top) / 2, 0], s: [rim, height, depth] },
    { p: [right - rim / 2, (bottom + top) / 2, 0], s: [rim, height, depth] },
  ];
  if (!opening.headClipped)
    frame.push({
      p: [(left + right) / 2, top - rim / 2, 0],
      s: [width, rim, depth],
    });
  if (opening.type === "window")
    frame.push(
      { p: [(left + right) / 2, bottom + rim / 2, 0], s: [width, rim, depth] },
      {
        p: [(left + right) / 2, (bottom + top) / 2, 0],
        s: [rim * 0.7, height, depth],
      },
    );
  return (
    <group>
      {frame.map((part, i) => (
        <mesh
          key={i}
          position={part.p as [number, number, number]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={part.s as [number, number, number]} />
          <meshStandardMaterial
            color={color}
            roughness={0.38}
            metalness={opening.type === "window" ? 0.13 : 0}
          />
        </mesh>
      ))}
      {opening.type === "window" && (
        <>
          <mesh position={[(left + right) / 2, (bottom + top) / 2, 0]}>
            <boxGeometry
              args={[
                Math.max(0.01, width - rim * 2),
                Math.max(0.01, height - rim * 2),
                0.008,
              ]}
            />
            <meshStandardMaterial
              color="#b3cfda"
              metalness={0.2}
              roughness={0.16}
              transparent
              opacity={0.24}
              depthWrite={false}
            />
          </mesh>
          {bottom > 0.05 && (
            <mesh
              position={[(left + right) / 2, bottom - 0.018, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[width + 0.045, 0.035, thickness + 0.055]} />
              <meshStandardMaterial color="#d8d5cc" roughness={0.52} />
            </mesh>
          )}
        </>
      )}
    </group>
  );
}

/** Anta socchiusa con pannelli e maniglia: lo stesso telaio, ma la porta si riconosce a colpo d'occhio. */
function DoorLeaf({ opening }: { opening: WallOpening }) {
  const { left, right, bottom, top } = opening;
  const rim = Math.min(0.05, (right - left) / 8, (top - bottom) / 8);
  const width = Math.max(0.2, right - left - rim * 2 - 0.01);
  const height = Math.max(0.5, top - bottom - rim - 0.01);
  const leaf = 0.04;
  const panelWidth = width * 0.68;
  const panels = [0.27, 0.73].map((share) => ({
    y: height * share,
    h: height * (share < 0.5 ? 0.3 : 0.42),
  }));
  return (
    // Cerniera sul montante sinistro; 70° di apertura verso la stanza.
    <group position={[left + rim, bottom, 0]} rotation={[0, -1.22, 0]}>
      <mesh position={[width / 2, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, leaf]} />
        <meshStandardMaterial color="#f1ece1" roughness={0.42} />
      </mesh>
      {[-1, 1].flatMap((side) =>
        panels.map((panel) => (
          <mesh
            key={`${side}-${panel.y}`}
            position={[width / 2, panel.y, (side * (leaf + 0.008)) / 2]}
          >
            <boxGeometry args={[panelWidth, panel.h, 0.008]} />
            <meshStandardMaterial color="#e6dfd0" roughness={0.5} />
          </mesh>
        )),
      )}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[width - 0.07, 1.0, (side * (leaf + 0.05)) / 2]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <cylinderGeometry args={[0.009, 0.009, 0.11, 10]} />
          <meshStandardMaterial
            color="#b9c0c4"
            metalness={0.85}
            roughness={0.28}
          />
        </mesh>
      ))}
    </group>
  );
}

function ArchitecturalWall({
  wall,
  walls,
  rooms,
  openings,
  defaultHeightM,
  chosen,
  cut,
  cutHeightM,
  isolatedRoom,
  textures,
  onSelect,
  transparent = false,
  fixtures = true,
  lining = false,
  doors = false,
}: {
  wall: Wall;
  walls: readonly Wall[];
  rooms: readonly Room[];
  openings: readonly ArchitecturalOpening[];
  defaultHeightM: number;
  chosen: boolean;
  cut: boolean;
  cutHeightM: number;
  isolatedRoom?: Room;
  textures: ReturnType<typeof useSurfaceMaterials>;
  onSelect: ArchitectureMeshesProps["onSelect"];
  transparent?: boolean;
  fixtures?: boolean;
  /** Cartongesso/controparete: tinta leggermente più calda del soffitto. */
  lining?: boolean;
  doors?: boolean;
}) {
  const trueHeight = architecturalWallHeight(wall, rooms, defaultHeightM);
  const height = cut ? Math.min(cutHeightM, trueHeight) : trueHeight;
  const length = distance(wall.start, wall.end);
  const span = roomWallSpan(wall, isolatedRoom);
  const extension = useMemo(() => {
    const joined = (point: { x: number; y: number }) =>
      walls.some(
        (other) =>
          other.id !== wall.id &&
          other.floorId === wall.floorId &&
          (distance(other.start, point) < 1e-6 ||
            distance(other.end, point) < 1e-6),
      );
    return {
      startM: joined(wall.start) ? wall.thickness / 2 : 0,
      endM: joined(wall.end) ? wall.thickness / 2 : 0,
      lengthM: length,
    };
  }, [walls, wall, length]);
  const apertures = useMemo(
    () =>
      measuredOpenings(wall, openings, height).flatMap((o) => {
        const left = Math.max(span.start, o.left);
        const right = Math.min(span.end, o.right);
        return right > left ? [{ ...o, left, right }] : [];
      }),
    [wall, openings, height, span.start, span.end],
  );
  const geometry = useMemo(
    () =>
      boxesGeometry(
        wallPanels(length, height, apertures).flatMap((p) => {
          const left = Math.max(span.start, p.left);
          const right = Math.min(span.end, p.right);
          return right > left ? [{ ...p, left, right }] : [];
        }),
        wall.thickness,
        0,
        extension,
      ),
    [
      length,
      height,
      apertures,
      wall.thickness,
      span.start,
      span.end,
      extension,
    ],
  );
  const baseboard = useMemo(() => {
    const strips = wallPanels(
      length,
      Math.min(0.085, height),
      apertures,
    ).flatMap((p) => {
      const left = Math.max(span.start, p.left);
      const right = Math.min(span.end, p.right);
      return right > left ? [{ ...p, left, right }] : [];
    });
    const first = boxesGeometry(
      strips,
      0.012,
      wall.thickness / 2 + 0.007,
      extension,
    );
    const second = boxesGeometry(
      strips,
      0.012,
      -wall.thickness / 2 - 0.007,
      extension,
    );
    const merged = mergeGeometries([first, second])!;
    first.dispose();
    second.dispose();
    return merged;
  }, [
    length,
    height,
    apertures,
    span.start,
    span.end,
    wall.thickness,
    extension,
  ]);
  useEffect(
    () => () => {
      geometry.dispose();
      baseboard.dispose();
    },
    [geometry, baseboard],
  );
  if (length < 1e-8 || span.end <= span.start) return null;
  return (
    <group
      position={[wall.start.x, 0, wall.start.y]}
      rotation={[
        0,
        -Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x),
        0,
      ]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ kind: "wall", id: wall.id });
      }}
    >
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          attach="material-0"
          map={textures.plaster}
          color={lining ? "#e8e1d1" : "#f4f1e9"}
          roughness={0.91}
          transparent={transparent}
          opacity={transparent ? 0.18 : 1}
          depthWrite={!transparent}
        />
        <meshStandardMaterial
          attach="material-1"
          color={lining ? "#ded6c6" : cut ? "#cbc3b4" : "#e5e0d4"}
          roughness={0.9}
          transparent={transparent}
          opacity={transparent ? 0.18 : 1}
          depthWrite={!transparent}
        />
      </mesh>
      <mesh geometry={baseboard} receiveShadow>
        <meshStandardMaterial color="#e5dfd2" roughness={0.61} />
      </mesh>
      {fixtures &&
        apertures.map((opening) => (
          <OpeningFrame
            key={opening.id}
            opening={opening}
            thickness={wall.thickness}
          />
        ))}
      {fixtures &&
        doors &&
        apertures
          .filter((o) => o.type === "door" && !o.headClipped)
          .map((opening) => (
            <DoorLeaf key={`leaf-${opening.id}`} opening={opening} />
          ))}
      {openings
        .filter(
          (o) =>
            o.wallId === wall.id &&
            o.type === "window" &&
            o.sillHeightM == null &&
            o.offsetM < span.end &&
            o.offsetM + o.widthM > span.start,
        )
        .map((o) => (
          <Line
            key={`unknown-${o.id}`}
            points={[
              [
                Math.max(span.start, o.offsetM),
                0.025,
                wall.thickness / 2 + 0.011,
              ],
              [
                Math.min(span.end, o.offsetM + o.widthM),
                0.025,
                wall.thickness / 2 + 0.011,
              ],
            ]}
            color="#a8794f"
            dashed
            dashSize={0.06}
            gapSize={0.04}
            lineWidth={2}
          />
        ))}
      {chosen && (
        <Line
          points={[
            [span.start, 0.017, wall.thickness / 2 + 0.003],
            [span.end, 0.017, wall.thickness / 2 + 0.003],
            [span.end, height + 0.004, wall.thickness / 2 + 0.003],
            [span.start, height + 0.004, wall.thickness / 2 + 0.003],
            [span.start, 0.017, wall.thickness / 2 + 0.003],
          ]}
          color="#159bbb"
          lineWidth={1.8}
        />
      )}
    </group>
  );
}

export function ArchitectureMeshes({
  walls,
  rooms,
  openings,
  defaultHeightM,
  selection,
  onSelect,
  cutWallIds,
  cutHeightM = 0.74,
  isolatedRoom,
  floorFinish,
  onReady,
  technicalVoids = false,
  context = false,
  doors = false,
}: ArchitectureMeshesProps) {
  const textures = useSurfaceMaterials();
  const { gl, invalidate } = useThree();
  useEffect(() => {
    if (context) return;
    gl.domElement.setAttribute(
      "data-drywall-count",
      String(walls.reduce((sum, wall) => sum + drywallSides(wall).length, 0)),
    );
    return () => {
      gl.domElement.removeAttribute("data-drywall-count");
    };
  }, [gl, walls, context]);
  useEffect(() => {
    if (context) return;
    gl.domElement.setAttribute(
      "data-door-leaves",
      String(doors ? openings.filter((o) => o.type === "door").length : 0),
    );
    return () => {
      gl.domElement.removeAttribute("data-door-leaves");
    };
  }, [gl, openings, doors, context]);
  useEffect(() => {
    if (context) return;
    gl.domElement.setAttribute("data-materials", "pbr");
    onReady?.();
    invalidate();
  }, [gl, onReady, invalidate, textures, context]);
  useEffect(
    () => () => Object.values(textures).forEach((t) => t.dispose()),
    [textures],
  );
  const selected = new Set(selection.map((s) => s.id));
  return (
    <group>
      {rooms.map((room) => (
        <RoomFloor
          key={room.id}
          room={room}
          chosen={selected.has(room.id)}
          onSelect={onSelect}
          textures={textures}
          floorFinish={floorFinish}
        />
      ))}
      {openings.flatMap((opening) => {
        if (opening.type !== "door") return [];
        const wall = walls.find(
          (item) =>
            item.id === opening.wallId && item.floorId === opening.floorId,
        );
        return wall
          ? [
              <DoorThreshold
                key={opening.id}
                wall={wall}
                opening={opening}
                rooms={rooms}
                defaultHeightM={defaultHeightM}
                textures={textures}
                floorFinish={floorFinish}
              />,
            ]
          : [];
      })}
      {walls.map((wall, wallIndex) => {
        const hollows = drywallGeometries({ walls, rooms }, wall);
        const sketchupGroup = {
          name: `Muro ${wallIndex + 1}`,
          userData: { sketchupGroup: true },
        };
        const renderWall = (
          copy: Wall,
          key: string,
          thin = false,
          fixtures = true,
          wallOpenings = openings,
        ) => (
          <ArchitecturalWall
            key={key}
            wall={copy}
            walls={walls}
            rooms={rooms}
            openings={wallOpenings}
            defaultHeightM={defaultHeightM}
            chosen={selected.has(wall.id)}
            cut={cutWallIds?.has(wall.id) ?? false}
            cutHeightM={cutHeightM}
            isolatedRoom={isolatedRoom}
            textures={textures}
            onSelect={onSelect}
            transparent={thin && technicalVoids}
            lining={thin}
            fixtures={fixtures}
            doors={doors}
          />
        );
        if (!hollows.length)
          return (
            <group key={wall.id} {...sketchupGroup}>
              {renderWall(wall, wall.id)}
            </group>
          );
        const tangent = {
          x: (wall.end.x - wall.start.x) / distance(wall.start, wall.end),
          y: (wall.end.y - wall.start.y) / distance(wall.start, wall.end),
        };
        const layer = (
          hollow: (typeof hollows)[number],
          face: (typeof hollows)[number]["front"],
          thickness: number,
        ) => {
          const forward =
            (face.end.x - face.start.x) * tangent.x +
              (face.end.y - face.start.y) * tangent.y >=
            0;
          const start = forward ? face.start : face.end,
            end = forward ? face.end : face.start;
          return {
            ...wall,
            thickness,
            start: {
              x: start.x - (hollow.normal.x * thickness) / 2,
              y: start.y - (hollow.normal.y * thickness) / 2,
            },
            end: {
              x: end.x - (hollow.normal.x * thickness) / 2,
              y: end.y - (hollow.normal.y * thickness) / 2,
            },
          };
        };
        const apertures = (copy: Wall) =>
          openings.map((opening) =>
            opening.wallId === wall.id
              ? {
                  ...opening,
                  offsetM:
                    opening.offsetM -
                    ((copy.start.x - wall.start.x) * tangent.x +
                      (copy.start.y - wall.start.y) * tangent.y),
                }
              : opening,
          );
        return (
          <group key={wall.id} {...sketchupGroup}>
            {hollows.map((hollow, index) => {
              const front = layer(hollow, hollow.front, 0.0125);
              return (
                <group key={hollow.roomId}>
                  {index === 0 &&
                    (() => {
                      const back = layer(hollow, hollow.back, wall.thickness);
                      return renderWall(
                        back,
                        "back",
                        false,
                        false,
                        apertures(back),
                      );
                    })()}
                  {renderWall(
                    front,
                    `front-${hollow.roomId}`,
                    true,
                    true,
                    apertures(front),
                  )}
                  {(["start", "end"] as const).map((end) =>
                    hollow[end === "start" ? "joinedStart" : "joinedEnd"]
                      ? null
                      : renderWall(
                          {
                            ...wall,
                            thickness: 0.0125,
                            start: hollow.back[end],
                            end: hollow.front[end],
                          },
                          `${hollow.roomId}-${end}`,
                          true,
                          false,
                          [],
                        ),
                  )}
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
