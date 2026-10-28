import * as THREE from "three";
import type { PlenumConnectionSide } from "@/domain/ducted/attached-plenums";

export type PlenumOpening = { side: PlenumConnectionSide } & ({ radius: number } | { width: number; height: number });
export type PlenumShellPort = { side: PlenumConnectionSide; x: number; y: number; z: number; radius: number };

/** Sheet-metal face with round openings; coordinates are centred on the face. */
export function plenumFaceGeometry(width: number, height: number, holes: readonly { x: number; y: number; radius: number }[], opening?: { width: number; height: number }) {
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
  if (opening && opening.width > 0 && opening.height > 0 && opening.width < width && opening.height < height) {
    const x = opening.width / 2, y = opening.height / 2;
    const hole = new THREE.Path();
    hole.moveTo(-x, -y); hole.lineTo(-x, y); hole.lineTo(x, y); hole.lineTo(x, -y); hole.closePath();
    shape.holes.push(hole);
  }
  // Thickness grows inward so the saved enclosure dimensions remain the outside dimensions.
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: .0015, bevelEnabled: false, curveSegments: 40, steps: 1 });
  geometry.translate(0, 0, -.0015);
  geometry.clearGroups();
  const normals = geometry.getAttribute("normal");
  for (let i = 0; i < normals.count; i += 3) {
    const material = normals.getZ(i) > .99 ? 0 : 1;
    const previous = geometry.groups.at(-1);
    if (previous?.materialIndex === material) previous.count += 3;
    else geometry.addGroup(i, 3, material);
  }
  return geometry;
}

/** Six inward-thickened sheets; the terminal opening is distinct from the duct ports. */
export function attachedPlenumFaces(w: number, h: number, d: number, ports: readonly PlenumShellPort[], inlet: PlenumOpening | null) {
  return (["front", "rear", "top", "bottom", "left", "right"] as const).map((side) => {
    const end = side === "left" || side === "right";
    const horizontal = side === "top" || side === "bottom";
    const width = end ? d : w, height = horizontal ? d : h;
    const holes = ports.filter((p) => p.side === side).map((p) => ({
      x: end ? (side === "left" ? p.y : -p.y) : side === "rear" ? -p.x : p.x,
      y: horizontal ? (side === "top" ? -p.y : p.y) : p.z,
      radius: p.radius,
    }));
    const opening = inlet?.side === side ? inlet : null;
    if (opening && "radius" in opening) holes.push({ x: 0, y: 0, radius: opening.radius });
    const position: [number, number, number] = side === "front" ? [0, 0, d / 2] : side === "rear" ? [0, 0, -d / 2] : side === "top" ? [0, h / 2, 0] : side === "bottom" ? [0, -h / 2, 0] : side === "left" ? [-w / 2, 0, 0] : [w / 2, 0, 0];
    const rotation: [number, number, number] = side === "front" ? [0, 0, 0] : side === "rear" ? [0, Math.PI, 0] : side === "top" ? [-Math.PI / 2, 0, 0] : side === "bottom" ? [Math.PI / 2, 0, 0] : [0, side === "left" ? -Math.PI / 2 : Math.PI / 2, 0];
    const geometry = plenumFaceGeometry(width, height, holes, opening && "width" in opening ? opening : undefined);
    if (opening && "width" in opening) {
      geometry.clearGroups(); geometry.addGroup(0, geometry.getAttribute("position").count, 1);
    }
    return { side, position, rotation, geometry };
  });
}
