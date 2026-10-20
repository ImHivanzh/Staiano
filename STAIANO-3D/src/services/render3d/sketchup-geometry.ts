import * as THREE from "three";
import type { SketchupModel } from "@/services/export/sketchup-schema";

/** The same visible geometry, with SketchUp's Z-up axes; values remain in metres. */
export function sketchupMeshes(root: THREE.Object3D): SketchupModel["meshes"] {
  root.updateWorldMatrix(true, true);
  const meshes: SketchupModel["meshes"] = [];
  let coordinates = 0;
  root.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry,
      index = geometry.index;
    const groups = Array.isArray(object.material)
      ? geometry.groups
      : [
          {
            start: 0,
            count: index?.count ?? geometry.attributes.position.count,
            materialIndex: 0,
          },
        ];
    const instances = object instanceof THREE.InstancedMesh ? object.count : 1;
    for (let instance = 0; instance < instances; instance++) {
      const matrix = object.matrixWorld.clone();
      if (object instanceof THREE.InstancedMesh) {
        const local = new THREE.Matrix4();
        object.getMatrixAt(instance, local);
        matrix.multiply(local);
      }
      for (const group of groups) {
        const material = Array.isArray(object.material)
          ? object.material[group.materialIndex ?? 0]
          : object.material;
        if (!material?.visible || material.opacity === 0) continue;
        if (
          !(material instanceof THREE.MeshStandardMaterial) &&
          !(material instanceof THREE.MeshBasicMaterial)
        )
          continue;
        const vertices: number[] = [];
        const end = Math.min(
          group.start + group.count,
          index?.count ?? geometry.attributes.position.count,
        );
        for (let i = group.start; i + 2 < end; i += 3) {
          const points = [0, 1, 2].map((j) =>
            object
              .getVertexPosition(
                index ? index.getX(i + j) : i + j,
                new THREE.Vector3(),
              )
              .applyMatrix4(matrix),
          );
          if (
            new THREE.Vector3()
              .subVectors(points[1], points[0])
              .cross(new THREE.Vector3().subVectors(points[2], points[0]))
              .lengthSq() < 1e-18
          )
            continue;
          for (const p of points) vertices.push(p.x, -p.z, p.y);
        }
        if (!vertices.length) continue;
        coordinates += vertices.length;
        if (coordinates > 3000000 || meshes.length >= 10000)
          throw Error(
            "Modello troppo complesso per SKP. Esporta un piano più piccolo.",
          );
        const color = material.color.clone().convertLinearToSRGB();
        let parent: THREE.Object3D | null = object;
        while (parent && !parent.name) parent = parent.parent;
        meshes.push({
          name: (parent?.name || `Geometria ${meshes.length + 1}`).slice(
            0,
            200,
          ),
          vertices,
          color: [
            Math.round(color.r * 255),
            Math.round(color.g * 255),
            Math.round(color.b * 255),
            Math.round(material.opacity * 255),
          ],
        });
      }
    }
  });
  return meshes;
}
