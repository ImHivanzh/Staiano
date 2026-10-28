"use client";
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { PerspectiveCamera } from "three";

/** Sposta il centro dell'inquadratura di `pixels` verso sinistra senza ridurre la scena (pannello laterale). */
export function ViewShift({ pixels }: { pixels: number }) {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const view = camera as PerspectiveCamera;
    if (!view.isPerspectiveCamera) return;
    if (pixels > 0 && size.width >= 900)
      view.setViewOffset(
        size.width,
        size.height,
        pixels,
        0,
        size.width,
        size.height,
      );
    else view.clearViewOffset();
    invalidate();
    return () => {
      view.clearViewOffset();
      invalidate();
    };
  }, [camera, size.width, size.height, pixels, invalidate]);
  return null;
}
