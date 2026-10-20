"use client";
import { useMemo } from "react";
import { Environment, Lightformer, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import type { SceneFrame } from "./scene-layout";
import type { Room } from "@/schemas/project";
import { SiteContext } from "./SiteContext";

/** A local studio environment: no remote HDRI or runtime network dependency. */
export function SceneLighting({
  frame,
  revision,
  rooms,
}: {
  frame: SceneFrame;
  revision: number;
  rooms: readonly Room[];
}) {
  const x = (frame.minX + frame.maxX) / 2,
    z = (frame.minZ + frame.maxZ) / 2;
  const span = Math.max(6, frame.maxX - frame.minX, frame.maxZ - frame.minZ);
  const target = useMemo(() => {
    const object = new THREE.Object3D();
    object.position.set(x, 0, z);
    return object;
  }, [x, z]);
  return (
    <>
      <color attach="background" args={["#dce5e8"]} />
      <fog attach="fog" args={["#dce5e8", span * 3, span * 16]} />
      <hemisphereLight color="#daeaff" groundColor="#9b9471" intensity={1.25} />
      <ambientLight intensity={0.12} />
      <primitive object={target} />
      <directionalLight
        target={target}
        position={[x - span * 0.8, span * 0.9 + frame.height, z - span * 0.6]}
        intensity={2.8}
        color="#fff2dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-span * 0.85}
        shadow-camera-right={span * 0.85}
        shadow-camera-top={span * 0.85}
        shadow-camera-bottom={-span * 0.85}
        shadow-camera-near={0.1}
        shadow-camera-far={span * 4 + frame.height * 4}
        shadow-normalBias={0.008}
        shadow-bias={-0.0001}
        shadow-radius={3}
      />
      <Environment resolution={128} frames={1} environmentIntensity={0.65}>
        <color attach="background" args={["#b8b3aa"]} />
        <Lightformer
          form="rect"
          intensity={3}
          color="#fff9ee"
          position={[-4, 7, -4]}
          scale={[9, 5, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={1.2}
          color="#d8e6fa"
          position={[5, 3, 2]}
          scale={[5, 5, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={1}
          color="#ffffff"
          position={[0, 8, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[10, 10, 1]}
        />
      </Environment>
      <SiteContext rooms={rooms} x={x} z={z} span={span} />
      <ContactShadows
        key={revision}
        position={[x, -0.338, z]}
        scale={span * 1.7}
        far={frame.height + 0.5}
        opacity={0.45}
        blur={2.8}
        resolution={1024}
        frames={1}
        color="#554c40"
      />
    </>
  );
}
