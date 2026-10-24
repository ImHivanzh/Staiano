import { Vector3, type PerspectiveCamera } from "three";

export type CameraMoveKeys = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
};

const WORLD_UP = new Vector3(0, 1, 0);

// ponytail: in vista dall'alto la direzione di sguardo è verticale, quindi uso l'up
// dello schermo proiettato a terra come "avanti". Se serve un rig completo, sostituire qui.
export function cameraMoveVector(
  camera: PerspectiveCamera,
  target: Vector3,
  keys: CameraMoveKeys,
  distance: number,
) {
  const forward = new Vector3().subVectors(target, camera.position);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) {
    forward.set(0, 1, 0).applyQuaternion(camera.quaternion);
    forward.y = 0;
  }
  forward.normalize();
  const right = new Vector3().crossVectors(forward, WORLD_UP).normalize();
  const move = new Vector3();
  if (keys.forward) move.add(forward);
  if (keys.back) move.sub(forward);
  if (keys.right) move.add(right);
  if (keys.left) move.sub(right);
  if (keys.up) move.add(WORLD_UP);
  if (keys.down) move.sub(WORLD_UP);
  return move.lengthSq() === 0 ? move : move.normalize().multiplyScalar(distance);
}
