"use client";
import { useMemo, useEffect } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Mesh, type Material } from "three";
import {
  globalSectionVertexY,
  type GlobalSection,
} from "@/domain/catalogs/global-sections";
import { Parts } from "./Parts";

/** Global VIP/OSCAR: one cast element from Blender, repeated every 80 mm. */
export default function GlobalBody({
  section,
  heightMm,
  elements,
  material,
}: {
  section: GlobalSection;
  heightMm: number;
  elements: number;
  material: Material;
}) {
  const gltf = useLoader(GLTFLoader, section.url);
  const geometry = useMemo(() => {
    let mesh: Mesh | undefined;
    gltf.scene.traverse((child) => {
      if (!mesh && child instanceof Mesh) mesh = child;
    });
    if (!mesh) throw new Error("Elemento Global privo di geometria.");
    mesh.updateWorldMatrix(true, false);
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),
      position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++)
      position.setY(i, globalSectionVertexY(position.getY(i), heightMm, section));
    position.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }, [gltf, section, heightMm]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const parts = useMemo(
    () =>
      Array.from({ length: elements }, (_, i) => ({
        position: [(i - (elements - 1) / 2) * 0.08, 0, 0] as [
          number,
          number,
          number,
        ],
        scale: [1, 1, 1] as [number, number, number],
      })),
    [elements],
  );
  return <Parts parts={parts} geometry={geometry} material={material} />;
}
