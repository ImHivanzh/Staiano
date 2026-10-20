"use client";
import { useEffect, useMemo } from "react";
import { Edges } from "@react-three/drei";
import * as THREE from "three";
import type { CeilingBand, Point, Project, Room } from "@/schemas/project";
import {
  ceilingBandPolygon,
  roofHeightAt,
  roofPlanes,
} from "@/domain/geometry/ceilings";
import { onSegment } from "@/domain/geometry/primitives";
import { SuspendedCeiling } from "./CeilingReference";

function shellGeometry(
  project: Project,
  room: Room,
  polygon: Point[],
  bottom?: number,
) {
  const positions: number[] = [];
  const topAt = (p: Point) =>
    bottom !== undefined && room.ceilingHeightM !== null
      ? room.ceilingHeightM
      : roofHeightAt(project, room, p);
  const triangle = (
    a: Point,
    ah: number,
    b: Point,
    bh: number,
    c: Point,
    ch: number,
  ) => positions.push(a.x, ah, a.y, b.x, bh, b.y, c.x, ch, c.y);
  for (const plane of roofPlanes(project, room, polygon)) {
    const faces = THREE.ShapeUtils.triangulateShape(
      plane.map((p) => new THREE.Vector2(p.x, p.y)),
      [],
    );
    for (const [ia, ib, ic] of faces) {
      const a = plane[ia],
        b = plane[ib],
        c = plane[ic];
      triangle(a, topAt(a), b, topAt(b), c, topAt(c));
      if (bottom !== undefined) triangle(c, bottom, b, bottom, a, bottom);
    }
    for (let i = 0; i < plane.length; i++) {
      const a = plane[i],
        b = plane[(i + 1) % plane.length];
      if (
        !polygon.some(
          (p, j) =>
            onSegment(a, p, polygon[(j + 1) % polygon.length]) &&
            onSegment(b, p, polygon[(j + 1) % polygon.length]),
        )
      )
        continue;
      const low = bottom ?? room.heightM;
      triangle(a, low, b, low, a, topAt(a));
      triangle(b, low, b, topAt(b), a, topAt(a));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

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
  const geometry = useMemo(
    () =>
      shellGeometry(
        project,
        room,
        band ? ceilingBandPolygon(project, room, band) : room.polygon,
        band?.elevationM,
      ),
    [project, room, band],
  );
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
            <SuspendedCeiling room={room} transparent={transparent} />
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
