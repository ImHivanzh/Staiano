"use client";
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Plenum, Project, Selection } from "@/schemas/project";
import { placedPlenumGeometry } from "@/domain/ducted/placement";
import {
  plenumConnectionSide,
  plenumPortLocal,
} from "@/domain/ducted/attached-plenums";
import { plenumTransitionGeometry } from "./plenum-transition";
import { layoutFromMachineGeometry, type PlenumLayout } from "./plenum-layout";
import { DuctedMachineBody } from "./DuctedMachineBody";

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
  if (plenum.attachmentId !== undefined && !geometry) {
    const count = plenum.portCount ?? 1;
    const radius = (plenum.portDiameterMm ?? 160) / 2000;
    const sides = Array.from({ length: count }, (_, i) =>
      plenumConnectionSide(project, plenum, i),
    );
    const totals: Record<string, number> = {};
    for (const side of sides) totals[side] = (totals[side] ?? 0) + 1;
    const seen: Record<string, number> = {};
    const ordinals = sides.map((side) => {
      const ordinal = seen[side] ?? 0;
      seen[side] = ordinal + 1;
      return ordinal;
    });
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
        {Array.from({ length: count }, (_, i) => {
          const side = sides[i];
          const local = plenumPortLocal(
            plenum,
            side,
            ordinals[i],
            totals[side],
            0.03,
          );
          return (
            <mesh
              key={i}
              position={[local.x, local.z, local.y]}
              rotation={
                side === "top" || side === "bottom"
                  ? [0, 0, 0]
                  : side === "left" || side === "right"
                    ? [0, 0, Math.PI / 2]
                    : [Math.PI / 2, 0, 0]
              }
            >
              <cylinderGeometry args={[radius, radius, 0.06, 24, 1, true]} />
              <meshStandardMaterial
                color="#d1dde0"
                metalness={0.7}
                roughness={0.3}
                side={THREE.DoubleSide}
              />
            </mesh>
          );
        })}
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
  hideDuctedMachines = false,
}: {
  project: Project;
  activeFloorId: string;
  selection: Selection[];
  onSelect: (s: Selection) => void;
  isolatedRoomId?: string;
  hideDuctedMachines?: boolean;
}) {
  const chosen = (id: string) => selection.some((s) => s.id === id);
  const { gl } = useThree();
  // Solo i plenum salvati sono oggetti fisici: né la macchina né la bocchetta
  // ne mostrano uno finché l'operatore non lo crea con lo strumento Plenum.
  // Il plenum di catalogo resta nella distinta, senza corpo nel modello 3D.
  const plenums = project.plenums;
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
            name={`Pilastro ${c.id}`}
            userData={{ sketchupGroup: true }}
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
      {!hideDuctedMachines && project.hvacSystems
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
                name={`Unità canalizzata ${u.productId}`}
                userData={{ sketchupGroup: true }}
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
                <DuctedMachineBody item={u} selected={chosen(u.id)} />
                {/* Fronte visibile dall'alto: distingue 0° da 180°. */}
                <mesh
                  position={[
                    0,
                    u.heightMm / 2000 + 0.002,
                    u.depthMm / 2000 - 0.03,
                  ]}
                >
                  <boxGeometry args={[(u.widthMm / 1000) * 0.8, 0.004, 0.03]} />
                  <meshStandardMaterial color="#00aeef" />
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
            name={`Plenum ${pl.id}`}
            userData={{ sketchupGroup: true }}
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
