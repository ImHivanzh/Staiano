"use client";
import { useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

const selectedMaterial = new THREE.MeshStandardMaterial({ color: "#73b5ce", metalness: 0.5, roughness: 0.35 });
const galvanized = new THREE.MeshStandardMaterial({ color: "#bdcbd0", metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide });
const casing = new THREE.MeshStandardMaterial({ color: "#e1e5e4", metalness: 0.25, roughness: 0.48, side: THREE.DoubleSide });
const grille = new THREE.MeshStandardMaterial({ color: "#7c9098", metalness: 0.2, roughness: 0.5, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
const plastic = new THREE.MeshStandardMaterial({ color: "#26383e", roughness: 0.7, side: THREE.DoubleSide });

export default function GreeDuctedBody({ width, height, depth, selected, running = false, url = "/models/gree/u-match-ducted-realistic.glb" }: { width: number; height: number; depth: number; selected: boolean; running?: boolean; url?: string }) {
  const model = useLoader(GLTFLoader, url);
  const { scene, center, size } = useMemo(() => {
    const scene = model.scene.clone(true);
    const logos: THREE.Object3D[] = [];
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      if (["Gree Products_Azul", "Gree Products_Naranja", "Gree Products_Service space"].includes(material.name)) { logos.push(object); return; }
      object.castShadow = true;
      object.receiveShadow = true;
      if (material.name === "GREE_White metal") object.material = selected ? selectedMaterial : galvanized;
      else if (material.name === "Gree Products_Metal blanco") object.material = selected ? selectedMaterial : casing;
      else if (material.name === "Gree Products_Rejilla") object.material = grille;
      else if (material.name === "GREE_Black plastic") object.material = plastic;
      else if (selected) object.material = selectedMaterial;
    });
    for (const logo of logos) logo.removeFromParent();
    const bounds = new THREE.Box3().setFromObject(scene);
    const size = bounds.getSize(new THREE.Vector3());
    if (!size.x || !size.y || !size.z) throw new Error("Modello canalizzato senza dimensioni valide.");
    return { scene, size, center: bounds.getCenter(new THREE.Vector3()) };
  }, [model, selected]);
  // Le pale sono nodi FanBlades_<n> con origine sull'asse della ventola (scripts/blender/heat-pump-outdoor-units.py): l'asse è Z locale.
  const group = useRef<THREE.Group>(null);
  useFrame(({ invalidate }, delta) => {
    if (!running) return;
    let spinning = false;
    group.current?.traverse((object) => { if (object.name.startsWith("FanBlades_")) { object.rotation.z -= delta * 14; spinning = true; } });
    if (spinning) invalidate();
  });
  return <group ref={group} scale={[width / size.x, height / size.y, depth / size.z]} dispose={null}>
    <primitive object={scene} position={[-center.x, -center.y, -center.z]} />
  </group>;
}
