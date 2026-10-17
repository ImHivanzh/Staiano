"use client";

import { useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Edges, Html, Line, OrbitControls } from "@react-three/drei";
import type { TerminalAccessorySpecification } from "@/domain/catalogs/ecoclima-price-schema";
import styles from "./TerminalPlenumPreview3D.module.css";

function PreviewCamera({ extent }: { extent: number }) {
  const { camera, size, invalidate } = useThree();
  const zoom = Math.min(size.width, size.height) / (extent * 1.8);
  useEffect(() => {
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, zoom, invalidate]);
  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minZoom={zoom * 0.5}
      maxZoom={zoom * 4}
      enablePan={false}
    />
  );
}

export function TerminalPlenumPreview3D({
  plenums,
  className,
}: {
  plenums: TerminalAccessorySpecification["plenum"][];
  className?: string;
}) {
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
  return (
    <figure
      className={`${styles.preview} ${className ?? ""}`}
      aria-label="Anteprima 3D plenum bocchetta"
    >
      <div className={styles.canvas}>
        <div className={styles.diameter}>
          {modules.length} plenum · {portCount} stacchi
        </div>
        <Canvas
          orthographic
          camera={{ position: [1, 0.8, -1.6], near: 0.01, far: 20 }}
          fallback={<span>Anteprima 3D non disponibile</span>}
        >
          <color attach="background" args={["#f4f7fa"]} />
          <ambientLight intensity={1.1} />
          <directionalLight position={[2, 3, 4]} intensity={2.2} />
          {modules.map((plenum, moduleIndex) => {
            const width = (plenum.lengthMm ?? 400) / 1000;
            const height = (plenum.widthMm ?? 160) / 1000;
            const depth = (plenum.heightMm ?? 120) / 1000;
            const radius = plenum.portDiameterMm / 2000;
            const offset =
              -totalWidth / 2 +
              width / 2 +
              modules
                .slice(0, moduleIndex)
                .reduce((sum, item) => sum + (item.lengthMm ?? 400) / 1000, 0);
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
                      <mesh position={[0, 0, 0.061]}>
                        <ringGeometry args={[radius * 0.9, radius, 32]} />
                        <meshStandardMaterial
                          color="#63747a"
                          metalness={0.6}
                          roughness={0.32}
                          side={2}
                        />
                      </mesh>
                      <Line
                        points={[
                          [0, radius, -0.06],
                          [0, radius + 0.08, -0.06],
                        ]}
                        color="#183249"
                        lineWidth={1}
                      />
                      <Html
                        position={[0, radius + 0.1, -0.06]}
                        center
                        zIndexRange={[1, 0]}
                        className={styles.portLabel}
                      >
                        Ø {plenum.portDiameterMm} mm
                      </Html>
                    </group>
                  );
                })}
              </group>
            );
          })}
          <PreviewCamera extent={extent} />
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
        <span>Trascina per ruotare · rotella per zoom</span>
      </figcaption>
    </figure>
  );
}
