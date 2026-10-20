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

export function groundTexture() {
  const size = 256,
    pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const grain = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      const noise = grain - Math.floor(grain);
      const patch =
        Math.sin((x * Math.PI) / 128) * Math.cos((y * Math.PI) / 128) * 6;
      pixels.set(
        [
          101 + noise * 25 + patch,
          111 + noise * 28 + patch,
          79 + noise * 21 + patch,
          255,
        ],
        (y * size + x) * 4,
      );
    }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(180, 180);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}
