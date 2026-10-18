import * as THREE from "three";
/** Four metal walls joining the measured inlet to the calculated plenum face. */
export function plenumTransitionGeometry(
  inlet: [number, number],
  face: [number, number],
  depth: number,
) {
  const [a, b] = inlet.map((v) => v / 2),
    [c, d] = face.map((v) => v / 2);
  const vertices = [
    -a,
    -b,
    0,
    a,
    -b,
    0,
    a,
    b,
    0,
    -a,
    b,
    0,
    -c,
    -d,
    depth,
    c,
    -d,
    depth,
    c,
    d,
    depth,
    -c,
    d,
    depth,
  ];
  const result = new THREE.BufferGeometry();
  result.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  result.setIndex([
    0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
  ]);
  result.computeVertexNormals();
  return result;
}
