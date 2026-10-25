import * as THREE from "three";
import type { Wall } from "@/schemas/project";

export function doorThresholdGeometry(
  wall: Wall,
  opening: { left: number; right: number },
  period: number,
) {
  const width = opening.right - opening.left,
    dx = wall.end.x - wall.start.x,
    dy = wall.end.y - wall.start.y,
    length = Math.hypot(dx, dy);
  if (
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(period) ||
    period <= 0 ||
    length <= 1e-8
  )
    throw new Error("Geometria della soglia porta non valida.");

  const depth = wall.thickness + 0.012,
    result = new THREE.BoxGeometry(width, 0.067, depth);
  result.translate((opening.left + opening.right) / 2, -0.024, 0);
  const tangent = { x: dx / length, y: dy / length },
    positions = result.getAttribute("position"),
    normals = result.getAttribute("normal"),
    uv = result.getAttribute("uv");
  for (let i = 0; i < uv.count; i++)
    if (normals.getY(i) > 0.5) {
      const worldX =
          wall.start.x +
          tangent.x * positions.getX(i) -
          tangent.y * positions.getZ(i),
        worldZ =
          wall.start.y +
          tangent.y * positions.getX(i) +
          tangent.x * positions.getZ(i);
      uv.setXY(i, worldX / period, -worldZ / period);
    }
  uv.needsUpdate = true;
  return result;
}
