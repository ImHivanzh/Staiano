"use client";

import { useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

export default function EcoclimaLinearBody({ family, count, width, height, depth, color, whiteModel, supply, slotWidthMm }: {
  family: "edls" | "edfl"; count: number; width: number; height: number; depth: number;
  color: string; whiteModel: boolean; supply: boolean; slotWidthMm?: number | null;
}) {
  const section = slotWidthMm === 30 ? 30 : 20;
  const url = family === "edls" && count <= 3 ? `/models/ecoclima/edls-${section}-${count}.glb` : family === "edfl" ? `/models/ecoclima/edfl-realistic-${count}.glb` : `/models/ecoclima/${family}-${count}.glb`;
  const model = useLoader(GLTFLoader, url);
  const { scene, center, size } = useMemo(() => {
    const copy = model.scene.clone(true);
    const white = whiteModel || color === "RAL9016" || color.toLowerCase() === "#ffffff";
    const finish = /^#[0-9a-f]{6}$/i.test(color) ? color : color === "RAL9005" || (family === "edls" && !color) ? "#171819" : white ? "#f4f4f0" : "#aeb7b9";
    copy.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      if (material.name.startsWith("Profile")) object.material = new THREE.MeshStandardMaterial({ color: finish, metalness: white ? 0.1 : 0.6, roughness: 0.45 });
      if (material.name.startsWith("Deflector")) {
        object.visible = supply;
        if (white) object.material = new THREE.MeshStandardMaterial({ color: "#efefeb", metalness: 0.15, roughness: 0.5 });
      }
      object.castShadow = true;
      object.receiveShadow = true;
    });
    const bounds = new THREE.Box3().setFromObject(copy);
    return { scene: copy, center: bounds.getCenter(new THREE.Vector3()), size: bounds.getSize(new THREE.Vector3()) };
  }, [model, color, family, whiteModel, supply]);
  return <group scale={[width / size.x, height / size.y, depth / size.z]} dispose={null}>
    <primitive object={scene} position={[-center.x, -center.y, -center.z]} />
  </group>;
}
