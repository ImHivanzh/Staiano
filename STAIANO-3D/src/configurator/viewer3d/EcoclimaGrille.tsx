"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

export function grilleHinge(scene: THREE.Object3D) {
  const hinge = new THREE.Group();
  hinge.position.y = 0.176;
  const door = scene.children.filter((child) => /^(Cornice_mobile|Pannello_forato)/.test(child.name));
  for (const child of door) {
    child.position.y -= 0.176;
    hinge.add(child);
  }
  scene.add(hinge);
  return hinge;
}

export function EcoclimaGrille({ model, width, height, open, color }: {
  model: "ega6" | "ebl" | "egf" | "egf-push";
  width: number; height: number; open: boolean; color: string;
}) {
  const gltf = useLoader(GLTFLoader, `/models/hvac/${model}-realistic.glb`);
  const progress = useRef(0);
  const { scene, hinge, finish } = useMemo(() => {
    const scene = gltf.scene.clone(true);
    let hinge = new THREE.Group();
    const natural = (model === "ega6" || model === "ebl") && !color;
    const tint = /^#[0-9a-f]{6}$/i.test(color) ? color : color === "RAL9005" ? "#171819" : color === "RAL9016" ? "#f4f4f0" : natural ? "#b5bdbf" : "#efefed";
    const finish = new THREE.MeshStandardMaterial({ color: tint, metalness: natural ? .55 : .15, roughness: .48, side: THREE.DoubleSide });
    if (model === "egf-push") {
      hinge = grilleHinge(scene);
    }
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (/^(Cornice|Pannello_forato|Aletta)/.test(object.name)) object.material = finish;
        object.castShadow = true; object.receiveShadow = true;
      }
    });
    return { scene, hinge, finish };
  }, [gltf, model, color]);
  useEffect(() => () => finish.dispose(), [finish]);
  useFrame((_, delta) => {
    progress.current = THREE.MathUtils.damp(progress.current, open ? 1 : 0, 5, delta);
    hinge.position.z = Math.sin(progress.current * Math.PI) * .006;
    hinge.rotation.x = -progress.current * 1.15;
  });
  return <group scale={[width / .6, height / .4, 1]} dispose={null}>
    <primitive object={scene} />
  </group>;
}
