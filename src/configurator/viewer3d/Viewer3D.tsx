"use client";
import { Component, useEffect, useMemo, useState } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { Grid, OrbitControls, Line } from "@react-three/drei";
import * as THREE from "three";
import { useProjectStore } from "@/stores/project-store";
import type { Room } from "@/schemas/project";
import { bounds, distance } from "@/domain/geometry/primitives";
import { splitCenterElevationM } from "@/domain/air-conditioning/elevation";

class WebGLError extends Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="vuoto">
        Vista 3D non disponibile sul dispositivo. La planimetria resta
        modificabile in 2D.
      </div>
    ) : (
      this.props.children
    );
  }
}
function FloorMesh({
  room,
  chosen,
  choose,
}: {
  room: Room;
  chosen: boolean;
  choose: () => void;
}) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    room.polygon.forEach((p, i) =>
      i ? s.lineTo(p.x, -p.y) : s.moveTo(p.x, -p.y),
    );
    s.closePath();
    return s;
  }, [room.polygon]);
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.01, 0]}
      onClick={(e) => {
        e.stopPropagation();
        choose();
      }}
    >
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial
        color={chosen ? "#b3ddef" : "#e3e7ee"}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
function Camera({
  top,
  center,
  size,
}: {
  top: boolean;
  center: [number, number, number];
  size: number;
}) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    camera.position.set(
      center[0] + (top ? 0 : size * 0.8),
      Math.max(size, 8),
      center[2] + (top ? 0.01 : size * 0.8),
    );
    camera.lookAt(...center);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, center, size, top, invalidate]);
  return (
    <OrbitControls
      makeDefault
      target={center}
      minDistance={2}
      maxDistance={200}
      maxPolarAngle={Math.PI / 2 - 0.01}
    />
  );
}
function RenderMarker() {
  useFrame(({ gl }) => {
    requestAnimationFrame(() => {
      gl.domElement.dataset.rendered = "true";
    });
  });
  return null;
}
export default function Viewer3D() {
  const { project: p, activeFloorId, selection, select } = useProjectStore();
  const [top, setTop] = useState(false),
    [isolated, setIsolated] = useState(false),
    [cutaway, setCutaway] = useState(true);
  const selectedRoom = p?.rooms.find((r) =>
    selection.some((s) => s.kind === "room" && s.id === r.id),
  );
  const rooms =
    p?.rooms.filter(
      (r) =>
        r.floorId === activeFloorId &&
        (!isolated || !selectedRoom || r.id === selectedRoom.id),
    ) ?? [];
  const walls =
    p?.walls.filter(
      (w) =>
        w.floorId === activeFloorId &&
        (!isolated || !selectedRoom || selectedRoom.wallIds.includes(w.id)),
    ) ?? [];
  const box = bounds(walls.flatMap((w) => [w.start, w.end]));
  const centerY = Math.max(0, ...rooms.map((r) => r.heightM)) / 2;
  const centerX = (box.minX + box.maxX) / 2,
    centerZ = (box.minY + box.maxY) / 2;
  const center = useMemo<[number, number, number]>(
    () => [centerX, centerY, centerZ],
    [centerX, centerY, centerZ],
  );
  const size = Math.max(box.maxX - box.minX, box.maxY - box.minY, centerY * 4);
  return (
    <div className="area-editor vista-3d" data-testid="viewer-3d">
      <div className="comandi-3d">
        <button
          className={`bottone piccolo ${top ? "chiara" : ""}`}
          onClick={() => setTop(!top)}
        >
          {top ? "Vista prospettica" : "Vista dall'alto"}
        </button>
        <label>
          <input
            type="checkbox"
            checked={cutaway}
            onChange={(e) => setCutaway(e.target.checked)}
          />{" "}
          Muri in sezione
        </label>
        <label>
          <input
            type="checkbox"
            checked={isolated}
            disabled={!selectedRoom}
            onChange={(e) => setIsolated(e.target.checked)}
          />{" "}
          Isola selezione
        </label>
      </div>
      <WebGLError>
        <Canvas
          camera={{ fov: 45, near: 0.1, far: 1000 }}
          frameloop="demand"
          onPointerMissed={() => select(null)}
          fallback={
            <div className="vuoto">
              WebGL non disponibile. Usare la vista 2D.
            </div>
          }
        >
          <color attach="background" args={["#fafbfc"]} />
          <ambientLight intensity={1.6} />
          <directionalLight position={[10, 20, 8]} intensity={2} />
          <Grid
            args={[100, 100]}
            cellSize={1}
            sectionSize={5}
            fadeDistance={100}
            cellColor="#ccd3de"
            sectionColor="#929aa8"
            position={[0, -0.01, 0]}
          />
          {rooms.map((r) => (
            <FloorMesh
              key={r.id}
              room={r}
              chosen={selection.some((s) => s.id === r.id)}
              choose={() => select({ kind: "room", id: r.id })}
            />
          ))}
          {walls.map((w) => {
            const height = cutaway
              ? 0.7
              : (w.height ??
                (Math.max(
                  0,
                  ...rooms
                    .filter((r) => r.wallIds.includes(w.id))
                    .map((r) => r.heightM),
                ) ||
                  p?.projectSettings.defaultHeightM ||
                  2.7));
            return (
              <mesh
                key={w.id}
                position={[
                  (w.start.x + w.end.x) / 2,
                  height / 2,
                  (w.start.y + w.end.y) / 2,
                ]}
                rotation={[
                  0,
                  -Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x),
                  0,
                ]}
                onClick={(e) => {
                  e.stopPropagation();
                  select({ kind: "wall", id: w.id });
                }}
              >
                <boxGeometry
                  args={[distance(w.start, w.end), height, w.thickness]}
                />
                <meshStandardMaterial
                  color={
                    selection.some((s) => s.id === w.id) ? "#0b7ea8" : "#5c6675"
                  }
                />
              </mesh>
            );
          })}
          {p?.radiators
            .filter(
              (d) =>
                d.floorId === activeFloorId &&
                (!isolated || !selectedRoom || d.roomId === selectedRoom.id),
            )
            .map((d) => (
              <mesh
                key={d.id}
                position={[d.position.x, d.heightMm / 2000 + 0.1, d.position.y]}
                rotation={[0, -d.rotation, 0]}
                onClick={(e) => {
                  e.stopPropagation();
                  select({ kind: "device", id: d.id });
                }}
              >
                <boxGeometry
                  args={[d.widthMm / 1000, d.heightMm / 1000, d.depthMm / 1000]}
                />
                <meshStandardMaterial
                  color={
                    selection.some((s) => s.id === d.id) ? "#365aa8" : "#0b7ea8"
                  }
                />
              </mesh>
            ))}
          {p?.hvacSystems
            .flatMap((system) => system.indoorUnits)
            .filter(
              (d) =>
                d.floorId === activeFloorId &&
                (!isolated || !selectedRoom || d.roomId === selectedRoom.id),
            )
            .map((d) => {
              const room = p.rooms.find((r) => r.id === d.roomId);
              if (!room) return null;
              return (
                <group
                  key={d.id}
                  position={[
                    d.position.x,
                    splitCenterElevationM(room, d),
                    d.position.y,
                  ]}
                  rotation={[0, -d.rotation, 0]}
                  onClick={(e) => {
                    e.stopPropagation();
                    select({ kind: "device", id: d.id });
                  }}
                >
                  <mesh>
                    <boxGeometry
                      args={[
                        d.widthMm / 1000,
                        d.heightMm / 1000,
                        d.depthMm / 1000,
                      ]}
                    />
                    <meshStandardMaterial
                      color={
                        selection.some((s) => s.id === d.id)
                          ? "#b3ddef"
                          : "#ffffff"
                      }
                    />
                  </mesh>
                  <mesh
                    position={[0, -d.heightMm / 3000, d.depthMm / 2000 + 0.001]}
                  >
                    <boxGeometry
                      args={[d.widthMm / 1000 - 0.08, 0.025, 0.008]}
                    />
                    <meshStandardMaterial color="#365aa8" />
                  </mesh>
                </group>
              );
            })}
          {p?.airTerminals
            .filter(
              (t) =>
                t.mounting !== "unknown" &&
                t.elevationM !== null &&
                !t.legacyUnverified &&
                t.floorId === activeFloorId &&
                (!isolated || !selectedRoom || t.roomId === selectedRoom.id),
            )
            .map((t) => (
              <mesh
                key={t.id}
                position={[
                  t.position.x,
                  (t.elevationM ?? 0) +
                    (t.mounting === "ceiling" ? (t.depthMm ?? 0) / 2000 : 0),
                  t.position.y,
                ]}
                rotation={
                  t.mounting === "ceiling"
                    ? [-Math.PI / 2, 0, -t.rotation]
                    : [0, -t.rotation, 0]
                }
                onClick={(e) => {
                  e.stopPropagation();
                  select({ kind: "device", id: t.id });
                }}
              >
                {t.depthMm !== null ? (
                  <boxGeometry
                    args={[
                      t.widthMm / 1000,
                      t.heightMm / 1000,
                      t.depthMm / 1000,
                    ]}
                  />
                ) : t.shape === "circle" ? (
                  <circleGeometry args={[t.widthMm / 2000, 32]} />
                ) : (
                  <planeGeometry args={[t.widthMm / 1000, t.heightMm / 1000]} />
                )}
                <meshStandardMaterial
                  color={
                    selection.some((s) => s.id === t.id)
                      ? "#365aa8"
                      : t.use === "supply"
                        ? "#00aeef"
                        : "#54ba51"
                  }
                  side={THREE.DoubleSide}
                />
              </mesh>
            ))}
          {p?.airTerminals
            .filter(
              (t) =>
                t.mounting !== "unknown" &&
                t.elevationM !== null &&
                !t.legacyUnverified &&
                t.floorId === activeFloorId &&
                (!isolated || !selectedRoom || t.roomId === selectedRoom.id),
            )
            .map((t) => (
              <Line
                key={`projection-${t.id}`}
                points={[
                  [t.position.x, 0.03, t.position.y],
                  [t.position.x, t.elevationM ?? 0, t.position.y],
                ]}
                color="#ccd3de"
                lineWidth={1}
                dashed
                dashSize={0.08}
                gapSize={0.06}
              />
            ))}
          <Camera top={top} center={center} size={size} />
          <RenderMarker />
        </Canvas>
      </WebGLError>
      <div className="indicazione-editor">
        Trascina per orbitare · Pulsante destro per pan · Rotella per zoom
      </div>
    </div>
  );
}
