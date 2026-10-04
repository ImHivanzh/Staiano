"use client";
import { useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { createSurfaceTextures } from "./surface-textures";

export const SURFACE_MAP_PATHS = [
  "/materials3d/oak/basecolor.jpg",
  "/materials3d/oak/normal.jpg",
  "/materials3d/oak/roughness.jpg",
  "/materials3d/stone/basecolor.jpg",
  "/materials3d/stone/normal.jpg",
  "/materials3d/stone/roughness.jpg",
];

/** Cache image data; own the GPU texture clones so unmounting never poisons the loader cache. */
export function useSurfaceMaterials() {
  const loaded = useLoader(THREE.TextureLoader, SURFACE_MAP_PATHS);
  return useMemo(() => {
    const procedural = createSurfaceTextures();
    procedural.wood.dispose();
    procedural.stone.dispose();
    const maps = loaded.map((source, i) => {
      const clone = source.clone();
      clone.wrapS = clone.wrapT = THREE.RepeatWrapping;
      clone.colorSpace =
        i % 3 === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      clone.anisotropy = 8;
      clone.needsUpdate = true;
      return clone;
    });
    return {
      wood: maps[0],
      woodNormal: maps[1],
      woodRoughness: maps[2],
      stone: maps[3],
      stoneNormal: maps[4],
      stoneRoughness: maps[5],
      plaster: procedural.plaster,
    };
  }, [loaded]);
}
