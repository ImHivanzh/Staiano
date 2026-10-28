"use client";

import { useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

/** Blender terminal model: face scaled to width x height, front plane on local z 0, body behind it. */
export default function EcoclimaTerminalBody({ url, width, height, depth, color, natural }: {
  url: string; width: number; height: number; depth: number | null; color: string; natural: boolean;
}) {
  const gltf = useLoader(GLTFLoader, url);
  const { scene, center, size, front } = useMemo(() => {
    const copy = gltf.scene.clone(true);
    const tinted = /^#[0-9a-f]{6}$/i.test(color) ? color : color === "RAL9005" ? "#171819" : color === "RAL9016" ? "#f4f4f0" : null;
    const finish = tinted ?? (natural ? "#b5bdbf" : "#f4f4f0");
    copy.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      if (material.name.startsWith("Profile")) object.material = new THREE.MeshStandardMaterial({ color: finish, map: material.map, flatShading: material.flatShading, metalness: natural && !tinted ? 0.95 : 0, roughness: natural && !tinted ? 0.36 : 0.4, side: THREE.DoubleSide });
      object.castShadow = true;
      object.receiveShadow = true;
    });
    const bounds = new THREE.Box3().setFromObject(copy);
    return { scene: copy, center: bounds.getCenter(new THREE.Vector3()), size: bounds.getSize(new THREE.Vector3()), front: bounds.max.z };
  }, [gltf, color, natural]);
  const sx = width / size.x, sy = height / size.y;
  return <group scale={[sx, sy, depth ? depth / size.z : (sx + sy) / 2]} dispose={null}>
    <primitive object={scene} position={[-center.x, -center.y, -front]} />
  </group>;
}
