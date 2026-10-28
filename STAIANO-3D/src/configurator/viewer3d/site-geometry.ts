import * as THREE from "three";
import type { Point } from "@/schemas/project";

/** Follow the measured footprint instead of placing the model on a rectangular plinth. */
export function foundationGeometry(polygon: Point[]) {
  const shape = new THREE.Shape(
    polygon.map((p) => new THREE.Vector2(p.x, -p.y)),
  );
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.28,
    bevelEnabled: false,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -0.337, 0);
  return geometry;
}

/** Metri di terreno per ogni lato, in multipli della dimensione del modello. */
export const GROUND_EXTENT = 16;

/**
 * Terreno senza ripetizioni: una corona di ghiaia chiara attorno alla casa, un prato
 * morbido che sfuma nell'orizzonte. Una sola immagine, quindi nessun moiré.
 */
export function groundTexture() {
  const size = 256,
    pixels = new Uint8Array(size * size * 4);
  // [distanza dal centro in unità di lato, colore sRGB]
  const stops: [number, [number, number, number]][] = [
    [0, [196, 189, 174]],
    [0.05, [192, 185, 170]],
    [0.075, [136, 168, 96]],
    [0.17, [124, 160, 84]],
    [0.32, [140, 170, 104]],
    [0.5, [150, 178, 120]],
  ];
  const at = (r: number) => {
    for (let i = 1; i < stops.length; i++)
      if (r <= stops[i][0]) {
        const [r0, c0] = stops[i - 1],
          [r1, c1] = stops[i];
        const t = (r - r0) / (r1 - r0);
        const k = t * t * (3 - 2 * t);
        return c0.map((v, j) => v + (c1[j] - v) * k);
      }
    return stops[stops.length - 1][1];
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5,
        dy = (y + 0.5) / size - 0.5;
      const r = Math.hypot(dx, dy);
      const grain = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      const noise = (grain - Math.floor(grain) - 0.5) * 5;
      const [cr, cg, cb] = at(r);
      // Oltre il prato il terreno diventa trasparente e lascia vedere l'orizzonte del cielo.
      const fade = Math.min(1, Math.max(0, (0.48 - r) / 0.2));
      pixels.set(
        [
          cr + noise,
          cg + noise,
          cb + noise,
          255 * fade * fade * (3 - 2 * fade),
        ],
        (y * size + x) * 4,
      );
    }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
