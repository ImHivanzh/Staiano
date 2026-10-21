"use client";
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Plenum, Project, Selection } from "@/schemas/project";
import { machinePlenum, placedPlenumGeometry } from "@/domain/ducted/placement";
import {
  plenumPortsUpper,
  terminalPlenum,
} from "@/domain/ducted/attached-plenums";
import { plenumTransitionGeometry } from "./plenum-transition";
import { layoutFromMachineGeometry, type PlenumLayout } from "./plenum-layout";

function NumberLabel({
  label,
  position,
  width,
  rotation = 0,
}: {
  label: string;
  position: [number, number, number];
  width: number;
  /** Gira l'etichetta con il plenum: gli stacchi numerati restano allineati. */
  rotation?: number;
}) {
  const map = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 128;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#123645";
    context.fillRect(0, 0, 384, 128);
    context.fillStyle = "#fff";
    context.font = "600 58px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, 192, 66);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [label]);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <sprite position={position} scale={[width, width / 3, 1]} renderOrder={5}>
      <spriteMaterial
        map={map}
        depthTest={false}
        depthWrite={false}
        rotation={rotation}
      />
    </sprite>
  );
}

/** L'etichetta segue il plenum ma non appare mai capovolta. */
function readableRotation(rotation: number) {
  const degrees = ((((rotation * 180) / Math.PI) % 360) + 360) % 360;
  return degrees > 90 && degrees <= 270 ? rotation + Math.PI : rotation;
}

/** Saved custom body dimensions, real counted and numbered port geometry. */
export function PlenumBody({
  layout,
  labels = true,
  selected = false,
  labelRotation = 0,
}: {
  layout: PlenumLayout;
  labels?: boolean;
  selected?: boolean;
  /** Rotazione del plenum: le etichette degli stacchi girano con il corpo. */
  labelRotation?: number;
}) {
  const [width, height] = layout.body;
  const transition = useMemo(
    () =>
      plenumTransitionGeometry(
        layout.inlet,
        [width, height],
        layout.transitionDepthM,
      ),
    [layout.inlet, width, height, layout.transitionDepthM],
  );
  useEffect(() => () => transition.dispose(), [transition]);
  return (
    <group>
      {layout.transitionDepthM > 0 && (
        <mesh geometry={transition}>
          <meshStandardMaterial
            color="#aebfc6"
            metalness={0.6}
            roughness={0.32}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      <mesh position={[0, 0, layout.transitionDepthM + layout.boxDepthM / 2]}>
        <boxGeometry args={[width, height, layout.boxDepthM]} />
        <meshStandardMaterial
          color={selected ? "#67c8de" : "#9abac6"}
          transparent
          opacity={0.4}
          metalness={0.45}
          roughness={0.28}
          depthWrite={false}
        />
      </mesh>
      {layout.ports.map((port) => (
        <group key={port.branch.id} position={port.position}>
          <mesh
            position={[0, 0, port.collarLengthM / 2]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry
              args={[
                port.diameterM / 2,
                port.diameterM / 2,
                port.collarLengthM,
                32,
                1,
                true,
              ]}
            />
            <meshStandardMaterial
              color="#d1dde0"
              metalness={0.68}
              roughness={0.22}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[0, 0, port.collarLengthM]}>
            <ringGeometry
              args={[port.diameterM * 0.44, port.diameterM / 2, 32]}
            />
            <meshStandardMaterial
              color="#91b5c5"
              metalness={0.7}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[0, 0, 0.0001]}>
            <circleGeometry args={[port.diameterM * 0.44, 32]} />
            <meshStandardMaterial color="#183c4c" />
          </mesh>
          {labels && (
            <NumberLabel
              label={`${port.number} · Ø${port.branch.diameterMm}`}
              position={[0, port.diameterM / 2 + 0.065, port.collarLengthM]}
              width={Math.max(port.diameterM * 1.4, 0.23)}
              rotation={labelRotation}
            />
          )}
        </group>
      ))}
    </group>
  );
}

function PlenumMesh({
  project,
  plenum,
  selected,
}: {
  project: Project;
  plenum: Plenum;
  selected: boolean;
}) {
  const geometry = useMemo(
    () => placedPlenumGeometry(project, plenum),
    [project, plenum],
  );
  const layout = useMemo(
    () => (geometry ? layoutFromMachineGeometry(geometry) : null),
    [geometry],
  );
  if (plenum.attachmentId !== undefined) {
    const upper = plenumPortsUpper(project, plenum);
    const count = plenum.portCount ?? 1;
    const radius = (plenum.portDiameterMm ?? 160) / 2000;
    return (
      <group>
        <mesh>
          <boxGeometry
            args={[
              plenum.widthMm / 1000,
              plenum.heightMm / 1000,
              plenum.depthMm / 1000,
            ]}
          />
          <meshStandardMaterial
            color={
              selected
                ? "#67c8de"
                : plenum.material === "galvanized"
                  ? "#b1c0c4"
                  : "#8ba5ae"
            }
            metalness={0.6}
            roughness={0.4}
          />
        </mesh>
        {Array.from({ length: count }, (_, i) => (
          <mesh
            key={i}
            position={[
              (((i + 0.5) / count - 0.5) * plenum.widthMm) / 1000,
              upper ? plenum.heightMm / 2000 + 0.03 : 0,
              upper ? 0 : -plenum.depthMm / 2000 - 0.03,
            ]}
            rotation={upper ? [0, 0, 0] : [Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[radius, radius, 0.06, 24, 1, true]} />
            <meshStandardMaterial
              color="#d1dde0"
              metalness={0.7}
              roughness={0.3}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>
    );
  }
  return (
    <group position={[0, 0, -plenum.depthMm / 2000]}>
      {layout ? (
        <PlenumBody
          layout={layout}
          selected={selected}
          labels={selected}
          labelRotation={readableRotation(-plenum.rotation)}
        />
      ) : (
        <mesh position={[0, 0, plenum.depthMm / 2000]}>
          <boxGeometry
            args={[
              plenum.widthMm / 1000,
              plenum.heightMm / 1000,
              plenum.depthMm / 1000,
            ]}
          />
          <meshStandardMaterial color="#9abac6" wireframe />
        </mesh>
      )}
    </group>
  );
}

export function SystemMeshes({
  project,
  activeFloorId,
  selection,
  onSelect,
  isolatedRoomId,
}: {
  project: Project;
  activeFloorId: string;
  selection: Selection[];
  onSelect: (s: Selection) => void;
  isolatedRoomId?: string;
}) {
  const chosen = (id: string) => selection.some((s) => s.id === id);
  const { gl } = useThree();
  const plenums = useMemo(
    () => [
      ...project.plenums,
      ...project.hvacSystems
        .filter((s) => s.type === "ducted")
        .flatMap((system) =>
          (["supply", "return"] as const).flatMap((use) => {
            const plenum = machinePlenum(project, system.id, use);
            return plenum && !project.plenums.some((p) => p.id === plenum.id)
              ? [plenum]
              : [];
          }),
        ),
      ...project.airTerminals.flatMap((terminal) => {
        if (project.plenums.some((p) => p.attachmentId === terminal.id))
          return [];
        const plenum = terminalPlenum(project, terminal);
        return plenum ? [plenum] : [];
      }),
    ],
    [project],
  );
  const plenumCount = plenums.filter(
    (plenum) =>
      plenum.floorId === activeFloorId &&
      (!isolatedRoomId || plenum.roomId === isolatedRoomId),
  ).length;
  useEffect(() => {
    gl.domElement.setAttribute("data-plenum-count", String(plenumCount));
    return () => {
      gl.domElement.removeAttribute("data-plenum-count");
    };
  }, [gl, plenumCount]);
  return (
    <group>
      {(project.pillars ?? [])
        .filter((c) => c.floorId === activeFloorId)
        .map((c) => (
          <mesh
            key={c.id}
            position={[c.position.x, c.heightMm / 2000, c.position.y]}
            rotation={[0, -c.rotation, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelect({ kind: "device", id: c.id });
            }}
            castShadow
            receiveShadow
          >
            <boxGeometry
              args={[c.widthMm / 1000, c.heightMm / 1000, c.depthMm / 1000]}
            />
            <meshStandardMaterial
              color={chosen(c.id) ? "#8fbbc4" : "#adb4ad"}
              roughness={0.85}
            />
          </mesh>
        ))}
      {project.hvacSystems
        .filter((s) => s.type === "ducted" && !s.fanCoilId)
        .flatMap((s) =>
          s.indoorUnits
            .filter(
              (u) =>
                u.floorId === activeFloorId &&
                (!isolatedRoomId || u.roomId === isolatedRoomId),
            )
            .map((u) => (
              <group
                key={u.id}
                position={[
                  u.position.x,
                  (() => {
                    const room = project.rooms.find((r) => r.id === u.roomId);
                    return room
                      ? room.heightM
                      : project.projectSettings.defaultHeightM;
                  })() -
                    u.heightMm / 2000 -
                    0.05,
                  u.position.y,
                ]}
                rotation={[0, -u.rotation, 0]}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect({ kind: "device", id: u.id });
                }}
              >
                <mesh castShadow>
                  <boxGeometry
                    args={[
                      u.widthMm / 1000,
                      u.heightMm / 1000,
                      u.depthMm / 1000,
                    ]}
                  />
                  <meshStandardMaterial
                    color={chosen(u.id) ? "#73b5ce" : "#bac7ca"}
                    roughness={0.3}
                    metalness={0.55}
                  />
                </mesh>
                <mesh position={[0, 0, u.depthMm / 2000 + 0.001]}>
                  <planeGeometry
                    args={[
                      (u.widthMm / 1000) * 0.9,
                      (u.heightMm / 1000) * 0.65,
                    ]}
                  />
                  <meshStandardMaterial color="#335a6b" />
                </mesh>
              </group>
            )),
        )}
      {plenums
        .filter(
          (pl) =>
            pl.floorId === activeFloorId &&
            (!isolatedRoomId || pl.roomId === isolatedRoomId),
        )
        .map((pl) => (
          <group
            key={pl.id}
            position={[pl.position.x, pl.elevationM ?? 2, pl.position.y]}
            rotation={[0, -pl.rotation, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelect({
                kind: "device",
                id: pl.id.startsWith("terminal-plenum:")
                  ? pl.attachmentId!
                  : pl.id.startsWith("machine-plenum:")
                    ? project.hvacSystems.find((s) => s.id === pl.systemId)!
                        .indoorUnits[0].id
                    : pl.id,
              });
            }}
          >
            <PlenumMesh
              project={project}
              plenum={pl}
              selected={chosen(pl.id)}
            />
          </group>
        ))}
    </group>
  );
}
