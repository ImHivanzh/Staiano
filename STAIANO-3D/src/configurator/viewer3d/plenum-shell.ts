import * as THREE from "three";

/** Sheet-metal face with round openings; coordinates are centred on the face. */
export function plenumFaceGeometry(width: number, height: number, holes: readonly { x: number; y: number; radius: number }[]) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2);
  shape.lineTo(-width / 2, height / 2);
  shape.closePath();
  for (const { x, y, radius } of holes) {
    if (radius <= 0 || Math.abs(x) + radius > width / 2 || Math.abs(y) + radius > height / 2) continue;
    const hole = new THREE.Path();
    hole.absarc(x, y, radius, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  return new THREE.ShapeGeometry(shape, 40);
}
