import { expect, it, vi } from "vitest";
import { PerspectiveCamera } from "three";
import type { Room } from "@/schemas/project";

const callbacks = vi.hoisted(() => ({
  frame: null as ((state: unknown) => void) | null,
}));
vi.mock("@react-three/fiber", () => ({
  useFrame: (frame: (state: unknown) => void) => {
    callbacks.frame = frame;
  },
}));
vi.mock("react", () => ({
  useRef: <T>(value: T) => ({ current: value }),
  useMemo: <T>(run: () => T) => run(),
  useLayoutEffect: (run: () => void) => run(),
}));
import { RoomLabelProjection } from "./RoomLabels";

it("projects labels once while stationary and updates them after camera movement or resizing", () => {
  const writes = vi.fn();
  const style = new Proxy(
    { transform: "", visibility: "" },
    {
      set(target, key, value) {
        writes(key, value);
        Reflect.set(target, key, value);
        return true;
      },
    },
  );
  const label = { style } as unknown as HTMLButtonElement;
  RoomLabelProjection({
    rooms: [
      {
        id: "room",
        centroid: { x: 1, y: 2 },
        polygon: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 4 },
          { x: 0, y: 4 },
        ],
      } as Room,
    ],
    elements: { current: new Map([["room", label]]) },
  });
  const camera = new PerspectiveCamera(40, 2, 0.01, 100);
  camera.position.set(6, 8, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const size = { width: 1000, height: 500 };
  callbacks.frame!({ camera, size });
  const initial = style.transform;
  expect(writes).toHaveBeenCalledTimes(2);
  for (let frame = 0; frame < 120; frame++) callbacks.frame!({ camera, size });
  expect(writes).toHaveBeenCalledTimes(2);
  camera.position.x += 2;
  camera.updateMatrixWorld();
  callbacks.frame!({ camera, size });
  expect(style.transform).not.toBe(initial);
  expect(writes).toHaveBeenCalledTimes(4);
  callbacks.frame!({ camera, size: { width: 1200, height: 500 } });
  expect(writes).toHaveBeenCalledTimes(6);
});
