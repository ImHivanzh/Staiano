"use client";
import { OutdoorBrackets } from "./OutdoorBrackets";
import { OutdoorCabinet } from "./OutdoorCabinet";
import { useTexture } from "@react-three/drei";
import { Suspense, useEffect, useMemo } from "react";
import { ModelAssetBoundary } from "./ModelAssetBoundary";
import GreeDuctedBody from "./GreeDuctedBody";
import * as THREE from "three";
import type { Project, Selection } from "@/schemas/project";
import { heatPumpProductAtVersion } from "@/domain/catalogs/heat-pumps";
import { heatPumpModelUrl } from "@/domain/catalogs/heat-pump-models";
import { hydronicPipeRoute } from "@/domain/hydronic/routes";
import { FlowParticles } from "./DuctMeshes";

const PIPE_RADIUS_M = 0.011;

/** Tubo pieno (non una linea tratteggiata) a tratti rettilinei con giunti sferici. */
function PipeTube({
  points,
  color,
}: {
  points: [number, number, number][];
  color: string;
}) {
  return (
    <group>
      {points.map((point, index) => {
        const next = points[index + 1];
        const joint = (
          <mesh position={point}>
            <sphereGeometry args={[PIPE_RADIUS_M, 10, 8]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
        );
        if (!next) return <group key={index}>{joint}</group>;
        const from = new THREE.Vector3(...point);
        const to = new THREE.Vector3(...next);
        const length = from.distanceTo(to);
        if (length < 1e-4) return <group key={index}>{joint}</group>;
        const middle = from.clone().add(to).multiplyScalar(0.5);
        const rotation = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          to.clone().sub(from).normalize(),
        );
        return (
          <group key={index}>
            {joint}
            <mesh position={middle} quaternion={rotation}>
              <cylinderGeometry
                args={[PIPE_RADIUS_M, PIPE_RADIUS_M, length, 12]}
              />
              <meshStandardMaterial color={color} roughness={0.5} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

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
                        running={running}
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
                            <PipeTube
                              points={line.map(
                                (p) =>
                                  [p.x, p.elevationM, p.y] as [
                                    number,
                                    number,
                                    number,
                                  ],
                              )}
                              color={color}
                            />
                            {running && (
                              // Mandata verso la macchina, ritorno verso la pompa di calore:
                              // gocce più larghe del tubo, una ogni ~25 cm, a velocità costante.
                              <FlowParticles
                                points={back ? [...line].reverse() : line}
                                animated
                                color={back ? "#d6f1ff" : "#ffd9cf"}
                                radiusM={PIPE_RADIUS_M * 1.5}
                                count={Math.min(
                                  80,
                                  Math.max(
                                    6,
                                    Math.round(
                                      line.reduce(
                                        (sum, p, i) =>
                                          i
                                            ? sum +
                                              Math.hypot(
                                                p.x - line[i - 1].x,
                                                p.y - line[i - 1].y,
                                                p.elevationM -
                                                  line[i - 1].elevationM,
                                              )
                                            : 0,
                                        0,
                                      ) / 0.25,
                                    ),
                                  ),
                                )}
                                speedMps={0.35}
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
