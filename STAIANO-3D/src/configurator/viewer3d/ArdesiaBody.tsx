"use client";
import { useMemo, useEffect } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Mesh, type Material } from "three";
import {
  sectionVertexY,
  type RadiatorSection,
} from "@/domain/catalogs/radiator-sections";
import { Parts } from "./Parts";
export default function ArdesiaBody({
  section,
  heightMm,
  elements,
  material,
}: {
  section: RadiatorSection;
  heightMm: number;
  elements: number;
  material: Material;
}) {
  const gltf = useLoader(GLTFLoader, section.localUrl);
  const geometry = useMemo(() => {
    const mesh = gltf.scene.children[0];
    if (!(mesh instanceof Mesh))
      throw new Error("Elemento Ardesia privo di geometria.");
    const geometry = mesh.geometry.clone(),
      position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++)
      position.setY(i, sectionVertexY(position.getY(i), heightMm, section));
    position.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }, [gltf, section, heightMm]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const parts = useMemo(
    () =>
      Array.from({ length: elements }, (_, i) => ({
        position: [(i - (elements - 1) / 2) * 0.046, 0, 0] as [
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
