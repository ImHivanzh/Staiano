"use client";

import { useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

export default function SplitWallBody({ url, width, height, depth }: {
  url: string; width: number; height: number; depth: number;
}) {
  const gltf = useLoader(GLTFLoader, url);
  const { scene, size, centre } = useMemo(() => {
    const scene = gltf.scene.clone(true);
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    const bounds = new THREE.Box3().setFromObject(scene);
    const size = bounds.getSize(new THREE.Vector3());
    if (![size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0)) {
      throw new Error("Modello split senza dimensioni valide.");
    }
    return { scene, size, centre: bounds.getCenter(new THREE.Vector3()) };
  }, [gltf]);
  return <group scale={[width / size.x, height / size.y, depth / size.z]} dispose={null}>
    <primitive object={scene} position={[-centre.x, -centre.y, -centre.z]} />
  </group>;
}
