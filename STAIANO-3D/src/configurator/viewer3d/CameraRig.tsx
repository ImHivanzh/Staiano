"use client";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { Room, Wall } from "@/schemas/project";
import { cameraCutWalls, type SceneFrame } from "./scene-layout";
import { useCustomerCamera } from "./customer-camera";
import { bounds, pointInPolygon } from "@/domain/geometry/primitives";
import { cameraMoveVector } from "./camera-move";
import {
  restartSocialClock,
  sampleSocialStops,
  socialCaption,
  socialTime,
  socialStops,
  type SocialHome,
  type SocialPoint,
} from "./social-shots";

const MOVE_CODES = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"]);

export function CameraRig({
  frame,
  top,
  fitKey,
  walls,
  rooms,
  cutaway,
  onCutWalls,
  viewRotation,
  underside,
  animate = false,
  orbit = false,
  shots = [],
  hook = "",
  sync,
  interiorRoom,
  preserveView = false,
}: {
  frame: SceneFrame;
  top: boolean;
  fitKey: string;
  walls: Wall[];
  rooms: Room[];
  cutaway: boolean;
  onCutWalls: (ids: Set<string>) => void;
  viewRotation?: number;
  underside?: boolean;
  animate?: boolean;
  orbit?: boolean;
  /** Apparecchi su cui la regia social si avvicina. */
  shots?: readonly SocialPoint[];
  /** Titolo d'apertura del video social. */
  hook?: string;
  sync?: { projectId: string; floorId: string; follow: boolean };
  interiorRoom?: Room;
  preserveView?: boolean;
}) {
  const { camera, size, invalidate } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const previous = useRef("");
  const lastBroadcast = useRef({ time: 0, value: "" });
  const follow = sync?.follow ?? false;
  const director = useRef<{
    home: SocialHome;
    stops: ReturnType<typeof socialStops>;
  } | null>(null);
  // Regia social: parte dall'inquadratura attuale e ci ritorna alla fine del giro. L'inquadratura di
  // partenza si fissa una volta sola: se cambiano le scene a giro iniziato, la camera sta già volando.
  const home = useRef<SocialHome | null>(null);
  useEffect(() => {
    if (!orbit || !controls.current) {
      director.current = null;
      home.current = null;
      socialCaption.alpha = 0;
      return;
    }
    if (!home.current) {
      const target = controls.current.target;
      const offset = camera.position.clone().sub(target);
      const radius = Math.max(0.5, offset.length());
      home.current = {
        target: target.toArray() as [number, number, number],
        radius,
        polar: Math.min(1.2, Math.max(0.5, Math.acos(offset.y / radius))),
        azimuth: Math.atan2(offset.x, offset.z),
      };
    }
    director.current = {
      home: home.current,
      stops: socialStops(home.current, shots, hook),
    };
    restartSocialClock();
    invalidate();
  }, [orbit, shots, hook, camera, invalidate]);
  useEffect(() => {
    if (!follow) return;
    const apply = () => {
      const activeCamera = controls.current?.object;
      const { camera: remote } = useCustomerCamera.getState();
      if (
        !remote ||
        remote.projectId !== sync?.projectId ||
        remote.floorId !== sync?.floorId ||
        !controls.current ||
        !(activeCamera instanceof THREE.PerspectiveCamera)
      )
        return;
      activeCamera.position.fromArray(remote.position);
      activeCamera.fov = remote.fov;
      activeCamera.updateProjectionMatrix();
      controls.current.target.fromArray(remote.target);
      controls.current.update();
      invalidate();
    };
    apply();
    return useCustomerCamera.subscribe(apply);
  }, [follow, sync?.projectId, sync?.floorId, camera, invalidate]);
  const pressed = useRef(new Set<string>());
  useEffect(() => {
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const down = (event: KeyboardEvent) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        typing(event.target)
      )
        return;
      const shift = event.code === "ShiftLeft" || event.code === "ShiftRight";
      if (!MOVE_CODES.has(event.code) && !shift) return;
      if (!shift) {
        event.preventDefault();
        event.stopPropagation();
      }
      pressed.current.add(event.code);
      invalidate();
    };
    const up = (event: KeyboardEvent) => pressed.current.delete(event.code);
    const clear = () => pressed.current.clear();
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, [invalidate]);
  const lastCutPosition = useRef(new THREE.Vector2(NaN, NaN));
  useEffect(() => {
    lastCutPosition.current.set(NaN, NaN);
    invalidate();
  }, [walls, rooms, top, cutaway, invalidate]);
  const initialized = useRef(false);
  const lastFitRequest = useRef("");
  const motion = useRef<{
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromTarget: THREE.Vector3;
    target: THREE.Vector3;
    started: number;
  } | null>(null);
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const remote = useCustomerCamera.getState().camera;
    if (
      follow &&
      remote?.projectId === sync?.projectId &&
      remote?.floorId === sync?.floorId
    )
      return;
    const selectedView = preserveView
      ? ""
      : `${viewRotation ?? ""}|${underside ?? false}|${interiorRoom?.id ?? ""}`;
    const fitRequest = `${sync?.projectId ?? ""}|${fitKey}|${top}|${selectedView}|${size.width}|${size.height}`;
    if (initialized.current && lastFitRequest.current === fitRequest) return;
    lastFitRequest.current = fitRequest;
    const base = frame.base ?? 0;
    const target = new THREE.Vector3(
      (frame.minX + frame.maxX) / 2,
      top ? base : base + (frame.height - base) * 0.32,
      (frame.minZ + frame.maxZ) / 2,
    );
    const direction = top
      ? new THREE.Vector3(0, 1, 0.0001)
      : viewRotation !== undefined
        ? new THREE.Vector3(
            0.45 * Math.cos(viewRotation) - Math.sin(viewRotation),
            underside ? -0.65 : 0.38,
            0.45 * Math.sin(viewRotation) + Math.cos(viewRotation),
          )
        : new THREE.Vector3(1, 0.72, 1.2);
    direction.normalize();
    const right = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), direction)
      .normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = (tanV * size.width) / Math.max(1, size.height);
    let distance = 0.8;
    for (const x of [frame.minX, frame.maxX])
      for (const y of [base, frame.height])
        for (const z of [frame.minZ, frame.maxZ]) {
          const offset = new THREE.Vector3(x, y, z).sub(target);
          distance = Math.max(
            distance,
            offset.dot(direction) +
              Math.max(
                (Math.abs(offset.dot(right)) / tanH) * 1.12,
                (Math.abs(offset.dot(up)) / tanV) * 1.25,
              ),
          );
        }
    const destination = target.clone().addScaledVector(direction, distance);
    if (interiorRoom) {
      const box = bounds(interiorRoom.polygon);
      const alongX = box.maxX - box.minX > box.maxY - box.minY;
      const point = alongX
        ? { x: box.minX + 0.4, y: (box.minY + box.maxY) / 2 }
        : { x: (box.minX + box.maxX) / 2, y: box.minY + 0.4 };
      const inside = pointInPolygon(point, interiorRoom.polygon)
        ? point
        : interiorRoom.centroid;
      const eye = Math.min(
        1.6,
        (interiorRoom.ceilingHeightM ?? interiorRoom.heightM) - 0.3,
      );
      destination.set(inside.x, eye, inside.y);
      target.set(
        alongX ? box.maxX - 0.4 : inside.x,
        Math.max(
          eye,
          (interiorRoom.ceilingHeightM ?? interiorRoom.heightM) - 0.5,
        ),
        alongX ? inside.y : box.maxY - 0.4,
      );
    }
    if (
      animate &&
      initialized.current &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      controls.current
    ) {
      motion.current = {
        from: camera.position.clone(),
        to: destination,
        fromTarget: controls.current.target.clone(),
        target,
        started: performance.now(),
      };
      controls.current.enabled = false;
      invalidate();
      return;
    }
    initialized.current = true;
    camera.position.copy(destination);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    if (controls.current) {
      controls.current.target.copy(target);
      controls.current.update();
    }
    invalidate();
  }, [
    camera,
    frame.minX,
    frame.maxX,
    frame.minZ,
    frame.maxZ,
    frame.height,
    frame.base,
    size.width,
    size.height,
    top,
    viewRotation,
    underside,
    fitKey,
    invalidate,
    animate,
    follow,
    sync?.projectId,
    sync?.floorId,
    interiorRoom,
    preserveView,
  ]);
  useFrame((_, delta) => {
    // frameloop "demand": la regia social chiede un nuovo fotogramma finché è attiva.
    if (orbit && director.current && controls.current) {
      const { stops } = director.current;
      const view = sampleSocialStops(stops, socialTime());
      const [x, y, z] = view.target;
      const flat = Math.sin(view.polar) * view.radius;
      camera.position.set(
        x + flat * Math.sin(view.azimuth),
        y + Math.cos(view.polar) * view.radius,
        z + flat * Math.cos(view.azimuth),
      );
      controls.current.target.set(x, y, z);
      controls.current.update();
      socialCaption.text = view.label;
      socialCaption.alpha = view.alpha;
      socialCaption.age = view.age;
      invalidate();
    }
    if (
      !follow &&
      !motion.current &&
      controls.current &&
      pressed.current.size > 0 &&
      camera instanceof THREE.PerspectiveCamera
    ) {
      const keys = pressed.current;
      const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 3.2 : 0.8;
      const offset = cameraMoveVector(
        camera,
        controls.current.target,
        {
          forward: keys.has("KeyW"),
          back: keys.has("KeyS"),
          left: keys.has("KeyA"),
          right: keys.has("KeyD"),
          up: keys.has("KeyQ"),
          down: keys.has("KeyE"),
        },
        Math.min(delta, 0.1) * speed,
      );
      if (offset.lengthSq() > 0) {
        camera.position.add(offset);
        controls.current.target.add(offset);
        controls.current.update();
        invalidate();
      }
    }
    if (motion.current && controls.current) {
      const m = motion.current;
      const t = Math.min(1, (performance.now() - m.started) / 1200);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      camera.position.lerpVectors(m.from, m.to, eased);
      controls.current.target.lerpVectors(m.fromTarget, m.target, eased);
      camera.lookAt(controls.current.target);
      controls.current.update();
      invalidate();
      if (t >= 1) {
        motion.current = null;
        controls.current.enabled = true;
      }
    }
    if (
      sync &&
      !follow &&
      controls.current &&
      camera instanceof THREE.PerspectiveCamera
    ) {
      const now = performance.now();
      const position = camera.position.toArray();
      const target = controls.current.target.toArray();
      const value = [
        sync.projectId,
        sync.floorId,
        ...position.map((n) => n.toFixed(5)),
        ...target.map((n) => n.toFixed(5)),
        camera.fov,
        top,
      ].join("|");
      if (
        now - lastBroadcast.current.time >= 33 &&
        value !== lastBroadcast.current.value
      ) {
        lastBroadcast.current = { time: now, value };
        useCustomerCamera.setState({
          camera: {
            projectId: sync.projectId,
            floorId: sync.floorId,
            position,
            target,
            fov: camera.fov,
            top,
          },
        });
      } else if (value !== lastBroadcast.current.value) {
        // Demand rendering must flush the final camera position after throttling.
        invalidate();
      }
    }
    if (
      lastCutPosition.current.x === camera.position.x &&
      lastCutPosition.current.y === camera.position.z
    )
      return;
    lastCutPosition.current.set(camera.position.x, camera.position.z);
    const ids = cutaway
      ? cameraCutWalls(
          walls,
          rooms,
          camera.position,
          follow ? (useCustomerCamera.getState().camera?.top ?? top) : top,
        )
      : new Set<string>();
    const key = [...ids].join("|");
    if (previous.current !== key) {
      previous.current = key;
      onCutWalls(ids);
    }
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!follow && !orbit}
      enableDamping
      dampingFactor={0.12}
      minDistance={0.2}
      maxDistance={2000}
      maxPolarAngle={
        interiorRoom || underside || orbit ? Math.PI * 0.85 : Math.PI / 2 - 0.03
      }
      screenSpacePanning
    />
  );
}
