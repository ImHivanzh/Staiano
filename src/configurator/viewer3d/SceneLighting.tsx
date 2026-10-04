"use client";
import { useMemo } from "react";
import { Environment, Lightformer, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import type { SceneFrame } from "./scene-layout";

/** A local studio environment: no remote HDRI or runtime network dependency. */
export function SceneLighting({
  frame,
  revision,
}: {
  frame: SceneFrame;
  revision: number;
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
      <color attach="background" args={["#e8e5df"]} />
      <hemisphereLight color="#e4edff" groundColor="#c1ad92" intensity={1.1} />
      <ambientLight intensity={0.15} />
      <primitive object={target} />
      <directionalLight
        target={target}
        position={[x - span * 0.65, span + frame.height * 2, z - span * 0.45]}
        intensity={2.4}
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
      <Environment resolution={128} frames={1} environmentIntensity={0.45}>
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
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[x, -0.065, z]}
        receiveShadow
      >
        <planeGeometry args={[span * 30, span * 30]} />
        <meshStandardMaterial color="#e8e5df" roughness={1} />
      </mesh>
      <ContactShadows
        key={revision}
        position={[x, -0.063, z]}
        scale={span * 1.7}
        far={frame.height + 0.5}
        opacity={0.38}
        blur={2.2}
        resolution={512}
        frames={1}
        color="#554c40"
      />
    </>
  );
}
