import * as THREE from "three";

/** Deterministic local finishes: decorative material, never manufacturer data. */
export function createSurfaceTextures() {
  const size = 256;
  const wood = new Uint8Array(size * size * 4);
  const stone = new Uint8Array(size * size * 4);
  const plaster = new Uint8Array(size * size * 4);
  const noise = (x: number, y: number) => {
    const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return value - Math.floor(value);
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const plank = Math.floor(y / 32);
      const seam = y % 32 < 1 || (x + (plank % 2) * 128) % 256 < 1;
      const grain =
        Math.sin(y * 1.7 + Math.sin(x / 26) * 2.3) * 2.4 +
        Math.sin(y * 0.7 + x / 70) * 3;
      const variation = noise(plank, 4) * 15 + noise(x, y) * 4 + grain;
      wood.set(
        seam
          ? [125, 99, 74, 255]
          : [188 + variation, 156 + variation, 117 + variation, 255],
        i,
      );
      const joint = x % 128 < 2 || y % 128 < 2;
      const fleck = noise(x, y) * 5 + Math.sin((x + y) / 19) * 1.5;
      stone.set(
        joint
          ? [161, 158, 150, 255]
          : [211 + fleck, 208 + fleck, 197 + fleck, 255],
        i,
      );
      const grit = noise(x, y) * 8;
      plaster.set([243 - grit, 241 - grit, 233 - grit, 255], i);
    }
  const texture = (data: Uint8Array) => {
    const result = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    result.wrapS = result.wrapT = THREE.RepeatWrapping;
    result.magFilter = THREE.LinearFilter;
    result.minFilter = THREE.LinearMipmapLinearFilter;
    result.generateMipmaps = true;
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 4;
    result.needsUpdate = true;
    return result;
  };
  return {
    wood: texture(wood),
    stone: texture(stone),
    plaster: texture(plaster),
  };
}
