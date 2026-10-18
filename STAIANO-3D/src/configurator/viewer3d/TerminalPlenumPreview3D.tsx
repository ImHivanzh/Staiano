"use client";

import { useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bounds, Edges, OrbitControls, useBounds } from "@react-three/drei";
import type { TerminalAccessorySpecification } from "@/domain/catalogs/ecoclima-price-schema";
import { FullscreenDialog } from "@/configurator/FullscreenDialog";
import styles from "./TerminalPlenumPreview3D.module.css";

type PreviewView = "isometric" | "front" | "top";

function PreviewCamera({
  extent,
  view,
  reset,
}: {
  extent: number;
  view: PreviewView;
  reset: number;
}) {
  const { camera, size, invalidate } = useThree();
  const bounds = useBounds();
  useEffect(() => {
    camera.position.set(
      ...({ isometric: [1, 0.8, -1.6], front: [0, 0, -2], top: [0, 2, -0.001] }[
        view
      ] as [number, number, number]),
    );
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    bounds.refresh().reset().clip().fit();
    invalidate();
  }, [
    bounds,
    camera,
    extent,
    view,
    reset,
    size.width,
    size.height,
    invalidate,
  ]);
  useFrame(({ gl, camera }) => {
    gl.domElement.dataset.rendered = "true";
    gl.domElement.dataset.zoom = String(camera.zoom);
  });
  return (
    <OrbitControls makeDefault enableDamping dampingFactor={0.08} enablePan />
  );
}

export function TerminalPlenumPreview3D({
  plenums,
  className,
}: {
  plenums: TerminalAccessorySpecification["plenum"][];
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<PreviewView>("isometric");
  const [reset, setReset] = useState(0);
  const modules = plenums.filter((item) => item != null);
  if (!modules.length || modules.length !== plenums.length) {
    return (
      <p className={`${styles.missing} ${className ?? ""}`} role="status">
        Quote e stacchi non pubblicati per questa taglia. Chiedere conferma a
        Ecoclima.
      </p>
    );
  }
  const totalWidth = modules.reduce(
    (sum, item) => sum + (item.lengthMm ?? 400) / 1000,
    0,
  );
  const portCount = modules.reduce((sum, item) => sum + item.portCount, 0);
  const extent = Math.max(
    totalWidth,
    ...modules.map((item) =>
      Math.max(
        (item.widthMm ?? 160) / 1000 + item.portDiameterMm / 1000 + 0.14,
        (item.heightMm ?? 120) / 1000 + 0.12,
      ),
    ),
  );
  const controls = (
    <>
      {(["isometric", "front", "top"] as const).map((mode) => (
        <button
          type="button"
          className="bottone piccolo"
          key={mode}
          aria-pressed={view === mode}
          onClick={() => setView(mode)}
        >
          {
            { isometric: "Isometrica", front: "Frontale", top: "Dall’alto" }[
              mode
            ]
          }
        </button>
      ))}
      <button
        type="button"
        className="bottone piccolo"
        onClick={() => setReset((value) => value + 1)}
      >
        Reimposta vista
      </button>
    </>
  );
  const preview = (
    <>
      <div className={styles.canvas} data-testid="terminal-plenum-preview">
        <Canvas
          orthographic
          frameloop="demand"
          dpr={[1, 2]}
          camera={{ position: [1, 0.8, -1.6], near: 0.01, far: 20 }}
          fallback={<span>Anteprima 3D non disponibile</span>}
        >
          <color attach="background" args={["#f4f7fa"]} />
          <ambientLight intensity={1.1} />
          <directionalLight position={[2, 3, 4]} intensity={2.2} />
          <Bounds fit clip observe margin={1.3} maxDuration={0}>
            {modules.map((plenum, moduleIndex) => {
              const width = (plenum.lengthMm ?? 400) / 1000;
              const height = (plenum.heightMm ?? 120) / 1000;
              const depth = (plenum.widthMm ?? 160) / 1000;
              const radius = plenum.portDiameterMm / 2000;
              const offset =
                -totalWidth / 2 +
                width / 2 +
                modules
                  .slice(0, moduleIndex)
                  .reduce(
                    (sum, item) => sum + (item.lengthMm ?? 400) / 1000,
                    0,
                  );
              return (
                <group key={moduleIndex} position={[offset, 0, 0]}>
                  <mesh>
                    <boxGeometry args={[width, height, depth]} />
                    <meshStandardMaterial
                      color="#b8c3c8"
                      metalness={0.48}
                      roughness={0.4}
                    />
                    <Edges color="#52646b" threshold={15} />
                  </mesh>
                  {Array.from({ length: plenum.portCount }, (_, index) => {
                    const x =
                      plenum.portCount === 1
                        ? 0
                        : -width * 0.38 +
                          (index * width * 0.76) / (plenum.portCount - 1);
                    return (
                      <group key={index} position={[x, 0, -(depth + 0.12) / 2]}>
                        <mesh rotation={[Math.PI / 2, 0, 0]}>
                          <cylinderGeometry
                            args={[radius, radius, 0.12, 32, 1, true]}
                          />
                          <meshStandardMaterial
                            color="#9aaab0"
                            metalness={0.55}
                            roughness={0.32}
                            side={2}
                          />
                        </mesh>
                        <mesh position={[0, 0, -0.061]}>
                          <ringGeometry args={[radius * 0.9, radius, 32]} />
                          <meshStandardMaterial
                            color="#63747a"
                            metalness={0.6}
                            roughness={0.32}
                            side={2}
                          />
                        </mesh>
                        <mesh position={[0, 0, 0.059]}>
                          <circleGeometry args={[radius * 0.9, 32]} />
                          <meshStandardMaterial
                            color="#183249"
                            side={2}
                            roughness={1}
                          />
                        </mesh>
                      </group>
                    );
                  })}
                </group>
              );
            })}
            <PreviewCamera extent={extent} view={view} reset={reset} />
          </Bounds>
        </Canvas>
      </div>
      <figcaption>
        <strong>
          {modules.length} plenum ·{" "}
          {modules.map((item) => item.lengthMm ?? "—").join(" + ")} mm ·{" "}
          {portCount} stacchi totali
        </strong>
        {modules.map((plenum, index) => (
          <span key={index}>
            Plenum {index + 1}: {plenum.lengthMm ?? "—"} ×{" "}
            {plenum.widthMm ?? "—"} × {plenum.heightMm ?? "—"} mm ·{" "}
            {plenum.portCount} × Ø {plenum.portDiameterMm} mm ·{" "}
            {plenum.modelCode}
          </span>
        ))}
        <span>
          Trascina per ruotare · rotella per zoom · tasto destro per spostare
        </span>
      </figcaption>
    </>
  );
  return (
    <>
      <figure
        className={`${styles.preview} ${className ?? ""}`}
        aria-label="Anteprima 3D plenum bocchetta"
      >
        <div
          className={styles.controls}
          role="group"
          aria-label="Vista plenum bocchetta"
        >
          {!expanded && controls}
          <button
            type="button"
            className="bottone piccolo"
            onClick={() => setExpanded(true)}
          >
            Ingrandisci plenum
          </button>
        </div>
        {!expanded && preview}
      </figure>
      <FullscreenDialog
        open={expanded}
        title="Plenum della bocchetta · vista ingrandita"
        onClose={() => setExpanded(false)}
      >
        {expanded && (
          <figure className={`${styles.preview} ${styles.expanded}`}>
            <div
              className={styles.controls}
              role="group"
              aria-label="Vista plenum bocchetta"
            >
              {controls}
            </div>
            {preview}
          </figure>
        )}
      </FullscreenDialog>
    </>
  );
}
