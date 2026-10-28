"use client";
import { useEffect, useMemo } from "react";
import { Edges } from "@react-three/drei";
import * as THREE from "three";
import type { CeilingBand, Project, Room } from "@/schemas/project";
import { ceilingBandPolygon } from "@/domain/geometry/ceilings";
import { roomNetPolygon } from "@/domain/geometry/drywall";
import { ceilingShellPositions } from "@/domain/geometry/ceiling-shell";
import { SuspendedCeiling } from "./CeilingReference";

function CeilingShell({
  project,
  room,
  band,
  transparent,
}: {
  project: Project;
  room: Room;
  band?: CeilingBand;
  transparent: boolean;
}) {
  const geometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        ceilingShellPositions(
          project,
          room,
          band ? ceilingBandPolygon(project, room, band) : room.polygon,
          band?.elevationM,
          band?.id,
        ),
        3,
      ),
    );
    geometry.computeVertexNormals();
    return geometry;
  }, [project, room, band]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      name={
        band?.name ??
        `${room.roof ? "Tetto a due falde" : "Soffitto"} ${room.name}`
      }
      raycast={() => undefined}
      receiveShadow
    >
      <meshStandardMaterial
        color="#f0f0eb"
        transparent={transparent}
        opacity={transparent ? 0.14 : 1}
        depthWrite={!transparent}
        roughness={0.85}
        side={THREE.DoubleSide}
      />
      <Edges
        color={transparent ? "#4f7f8c" : "#c1c7c5"}
        transparent
        opacity={transparent ? 0.6 : 0.35}
      />
    </mesh>
  );
}

export function RoomCeiling3D({
  project,
  room,
  transparent = true,
  showCeiling = true,
}: {
  project: Project;
  room: Room;
  transparent?: boolean;
  showCeiling?: boolean;
}) {
  const net = useMemo(
    () => roomNetPolygon(project, room),
    [project.walls, project.rooms, room],
  );
  return (
    <group>
      {(room.roof ||
        (!transparent &&
          room.ceilingBands?.length &&
          room.ceilingHeightM === null)) && (
        <CeilingShell project={project} room={room} transparent={transparent} />
      )}
      {showCeiling && (
        <>
          {room.ceilingHeightM !== null && (
            <SuspendedCeiling room={room} polygon={net} transparent={transparent} />
          )}
          {room.ceilingBands?.map((band) => (
            <CeilingShell
              key={band.id}
              project={project}
              room={room}
              band={band}
              transparent={transparent}
            />
          ))}
        </>
      )}
    </group>
  );
}
