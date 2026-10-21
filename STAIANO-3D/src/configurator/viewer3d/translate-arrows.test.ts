import { expect, it } from "vitest";
import { Mesh, Object3D, PerspectiveCamera, Scene } from "three";
import { TransformControls } from "three-stdlib";
import { alignTranslateArrows } from "./translate-arrows";

it("keeps translation arrow tips outward on either side of every axis", () => {
  const camera = new PerspectiveCamera();
  const controls = new TransformControls(camera, undefined);
  const object = new Object3D();
  const scene = new Scene();
  scene.add(object, controls);
  controls.attach(object);
  alignTranslateArrows(controls);
  alignTranslateArrows(controls);
  for (const sign of [-1, 1]) {
    camera.position.set(5 * sign, 6 * sign, 7 * sign);
    camera.updateMatrixWorld();
    controls.updateMatrixWorld();
    const arrows: Mesh[] = [];
    controls.traverse((handle) => {
      if (
        handle instanceof Mesh &&
        "tag" in handle &&
        handle.tag === (sign < 0 ? "bwd" : "fwd")
      )
        arrows.push(handle);
    });
    expect(arrows).toHaveLength(3);
    for (const arrow of arrows) {
      expect(arrow.visible).toBe(true);
      const positions = arrow.geometry.getAttribute("position");
      const axis = "XYZ".indexOf(arrow.name);
      const coordinates = Array.from({ length: positions.count }, (_, i) =>
        positions.getComponent(i, axis),
      );
      // The apex is at 1.1, the wider base at 0.9, before the camera-side mirror.
      expect(coordinates[0]).toBeCloseTo(1.1);
      expect(Math.min(...coordinates)).toBeCloseTo(0.9);
      expect(arrow.scale.getComponent(axis) * sign).toBeGreaterThan(0);
    }
  }
});
