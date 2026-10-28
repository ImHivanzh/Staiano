import * as THREE from "three";

/** Open hose layers. End circles remain exactly on the supplied collar mouths. */
export function flexibleDuctGeometry(curve: THREE.Curve<THREE.Vector3>, diameterMm: number, insulationMm: number) {
  const length = curve.getLength();
  if (![length, diameterMm].every((value) => Number.isFinite(value) && value > 0) || !Number.isFinite(insulationMm) || insulationMm < 0) {
    throw new Error("Dimensioni del flessibile non valide.");
  }
  const innerRadius = diameterMm / 2000;
  const outerRadius = innerRadius + insulationMm / 1000;
  const cutback = insulationMm > 0 ? Math.min(.02, length * .1) : 0;
  const foilLength = length - cutback * 2;
  const foilCurve = new class extends THREE.Curve<THREE.Vector3> {
    constructor() { super(); }
    getPoint(t: number, target = new THREE.Vector3()) { return target.copy(curve.getPointAt((cutback + t * foilLength) / length)); }
    getLength() { return foilLength; }
  }();
  const segments = Math.min(2048, Math.max(16, Math.ceil(length / .006)));
  const radial = 24;
  const foil = new THREE.TubeGeometry(foilCurve, segments, outerRadius, radial, false);
  const positions = foil.getAttribute("position"), normals = foil.getAttribute("normal");
  for (let row = 0; row <= segments; row++) {
    const distance = foilLength * row / segments;
    const blend = Math.max(0, Math.min(1, (distance - .015) / .02, (foilLength - distance - .015) / .02));
    for (let col = 0; col <= radial; col++) {
      const angle = col / radial * Math.PI * 2;
      const phase = distance / .025 * Math.PI * 2 - angle;
      const amplitude = insulationMm > 0 ? .00025 : Math.min(.001, outerRadius * .012);
      const displacement = -blend * amplitude * (.5 + .5 * Math.cos(phase));
      const index = row * (radial + 1) + col;
      positions.setXYZ(index, positions.getX(index) + normals.getX(index) * displacement,
        positions.getY(index) + normals.getY(index) * displacement, positions.getZ(index) + normals.getZ(index) * displacement);
    }
  }
  foil.computeVertexNormals();
  foil.clearGroups();
  for (let row = 0; row < segments; row++) {
    const band = insulationMm === 0 && ((row + .5) * length / segments < .015 || (segments - row - .5) * length / segments < .015);
    const previous = foil.groups.at(-1);
    if (previous?.materialIndex === Number(band)) previous.count += radial * 6;
    else foil.addGroup(row * radial * 6, radial * 6, Number(band));
  }
  const liner = insulationMm > 0 ? new THREE.TubeGeometry(curve, segments, innerRadius, radial, false) : null;
  if (liner) {
    liner.clearGroups();
    for (let row = 0; row < segments; row++) {
      const band = (row + .5) * length / segments < .015 || (segments - row - .5) * length / segments < .015;
      const previous = liner.groups.at(-1);
      if (previous?.materialIndex === Number(band)) previous.count += radial * 6;
      else liner.addGroup(row * radial * 6, radial * 6, Number(band));
    }
  }
  const ends = insulationMm > 0 ? [cutback / length, 1 - cutback / length].map((t, index) => {
    const geometry = new THREE.RingGeometry(innerRadius, outerRadius, radial);
    const direction = curve.getTangentAt(t).multiplyScalar(index === 0 ? -1 : 1).normalize();
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction));
    const point = curve.getPointAt(t); geometry.translate(point.x, point.y, point.z);
    return geometry;
  }) : [];
  return { foil, liner, ends, length, foilLength, cutback, innerRadius, outerRadius };
}

/** Deterministic crumpled foil height field; metric repetition is set by each hose. */
export function flexibleFoilTexture() {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  const noise = (x: number, y: number, cells: number) => {
    const u = x / size * cells, v = y / size * cells;
    const i = Math.floor(u), j = Math.floor(v);
    const a = u - i, b = v - j, s = a * a * (3 - 2 * a), t = b * b * (3 - 2 * b);
    const hash = (ix: number, iy: number) => {
      let value = Math.imul(ix % cells, 374761393) + Math.imul(iy % cells, 668265263);
      value ^= value >>> 13;
      return (Math.imul(value, 1274126177) >>> 0) / 4294967295;
    };
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(i, j), hash(i + 1, j), s),
      THREE.MathUtils.lerp(hash(i, j + 1), hash(i + 1, j + 1), s), t);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const folds = 1 - Math.abs(2 * noise(x, y, 16) - 1);
    const value = Math.round(65 + 100 * folds + 55 * noise(x, y, 48) + 25 * noise(x, y, 7));
    const index = (y * size + x) * 4;
    pixels[index] = pixels[index + 1] = pixels[index + 2] = value; pixels[index + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}
