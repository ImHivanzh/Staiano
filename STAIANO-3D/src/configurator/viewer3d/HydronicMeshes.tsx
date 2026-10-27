"use client";
import { OutdoorBrackets } from "./OutdoorBrackets";
import { OutdoorCabinet } from "./OutdoorCabinet";
import { Line, useTexture } from "@react-three/drei";
import { Suspense, useEffect, useMemo } from "react";
import { ModelAssetBoundary } from "./ModelAssetBoundary";
import GreeDuctedBody from "./GreeDuctedBody";
import * as THREE from "three";
import type { Project, Selection } from "@/schemas/project";
import { heatPumpProductAtVersion } from "@/domain/catalogs/heat-pumps";
import { heatPumpModelUrl } from "@/domain/catalogs/heat-pump-models";
import { hydronicPipeRoute } from "@/domain/hydronic/routes";
import { FlowParticles } from "./DuctMeshes";

function HeatPumpIdentification({
  manufacturer,
  model,
  width,
  height,
  depth,
}: {
  manufacturer: "Gree" | "Chaffoteaux" | "Daikin";
  model: string;
  width: number;
  height: number;
  depth: number;
}) {
  const logo = useTexture(
    manufacturer === "Gree"
      ? "/catalog-assets/brands/gree.png"
      : manufacturer === "Daikin"
        ? "/catalog-assets/brands/daikin.png"
        : "/catalog-assets/brands/chaffoteaux.jpg",
  );
  const label = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 384;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#123645";
    context.font = "bold 72px Arial";
    context.fillText(manufacturer.toUpperCase(), 32, 100, 960);
    context.font = "56px Arial";
    context.fillText(model, 32, 210, 960);
    context.font = "40px Arial";
    context.fillText("POMPA DI CALORE", 32, 320);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [manufacturer, model]);
  useEffect(() => () => label.dispose(), [label]);
  return (
    <>
      <mesh position={[width * 0.23, height * 0.28, depth / 2 + 0.018]}>
        <planeGeometry args={[width * 0.42, height * 0.13]} />
        <meshBasicMaterial map={logo} toneMapped={false} />
      </mesh>
      <mesh
        position={[width / 2 + 0.008, height * 0.1, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry
          args={[depth * 0.86, Math.min(height * 0.3, depth * 0.4)]}
        />
        <meshBasicMaterial map={label} toneMapped={false} />
      </mesh>
      <mesh
        position={[-width / 2 - 0.008, height * 0.1, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry
          args={[depth * 0.86, Math.min(height * 0.3, depth * 0.4)]}
        />
        <meshBasicMaterial map={label} toneMapped={false} />
      </mesh>
    </>
  );
}

export function HydronicMeshes({
  project,
  floorId,
  showPipes = false,
  running = false,
  selection = [],
  onSelect,
}: {
  project: Project;
  floorId?: string;
  showPipes?: boolean;
  running?: boolean;
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
            gree = m?.family === "VERSATI V";
          const versatiIII = [
            "gree-versati-iii-8-split-monofase",
            "gree-versati-iii-10-split-monofase",
          ].includes(s.productId);
          const modelUrl = versatiIII
            ? "/models/gree/versati-iii-sp-08-10.glb"
            : m
              ? heatPumpModelUrl(m)
              : null;
          const cabinet = (
            <OutdoorCabinet
              widthM={w}
              heightM={h}
              depthM={d}
              selected={selected}
              dark={gree}
              family={m?.family}
              running={running}
            />
          );
          return (
            <group key={s.id}>
              <group
                name={`Pompa di calore ${m?.model ?? u.id}`}
                userData={{ sketchupGroup: true }}
                position={[u.position.x, u.elevationM, u.position.y]}
                rotation={[0, -u.rotation, 0]}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.({ kind: "device", id: u.id });
                }}
              >
                {u.mounting === "brackets" && (
                  <OutdoorBrackets widthM={w} heightM={h} depthM={d} />
                )}
                {modelUrl ? (
                  <ModelAssetBoundary fallback={cabinet}>
                    <Suspense fallback={cabinet}>
                      <GreeDuctedBody
                        url={modelUrl}
                        width={w}
                        height={h}
                        depth={d}
                        selected={selected}
                      />
                    </Suspense>
                  </ModelAssetBoundary>
                ) : (
                  cabinet
                )}
                {m && (
                  <HeatPumpIdentification
                    manufacturer={m.manufacturer}
                    model={m.model}
                    width={w}
                    height={h}
                    depth={d}
                  />
                )}
              </group>
              {showPipes &&
                s.fanCoilIds.map((id) => {
                  const path = hydronicPipeRoute(project, s, id);
                  if (path.length < 2) return null;
                  return (
                    <group key={id}>
                      {(
                        [
                          [-0.025, "#db7562", false],
                          [0.025, "#66bde3", true],
                        ] as const
                      ).map(([offset, color, back]) => {
                        const line = path.map((p) => ({
                          ...p,
                          x: p.x + offset,
                        }));
                        return (
                          <group key={color}>
                            <Line
                              points={line.map(
                                (p) =>
                                  [p.x, p.elevationM, p.y] as [
                                    number,
                                    number,
                                    number,
                                  ],
                              )}
                              color={color}
                              lineWidth={2.5}
                              dashed
                              dashSize={0.1}
                              gapSize={0.045}
                            />
                            {running && (
                              // Mandata verso la macchina, ritorno verso la pompa di calore.
                              <FlowParticles
                                points={back ? [...line].reverse() : line}
                                animated
                                color={color}
                              />
                            )}
                          </group>
                        );
                      })}
                    </group>
                  );
                })}
            </group>
          );
        })}
    </group>
  );
}
