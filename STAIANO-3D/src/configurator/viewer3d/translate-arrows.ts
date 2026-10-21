import { Mesh, type Object3D } from "three";

export function alignTranslateArrows(controls: Object3D | null) {
  controls?.traverse((handle) => {
    if (!(handle instanceof Mesh) || !("tag" in handle) || handle.tag !== "bwd")
      return;
    const forward = handle.parent?.children.find(
      (other) =>
        other.name === handle.name && "tag" in other && other.tag === "fwd",
    );
    // three-stdlib already mirrors the backward handle; its cone must face outward before that mirror.
    if (forward instanceof Mesh) handle.geometry.copy(forward.geometry);
  });
}
