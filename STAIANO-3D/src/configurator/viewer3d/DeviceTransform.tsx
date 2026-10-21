"use client";
import { useEffect, useRef, useCallback } from "react";
import { TransformControls } from "@react-three/drei";
import { alignTranslateArrows } from "./translate-arrows";
import * as THREE from "three";
import type { Project } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { movePlacedDevice } from "@/domain/geometry/move-device";
import { editOperatorTerminal } from "@/domain/air-terminals/operator";
import { snapTerminalPose } from "@/domain/geometry/terminal-snap";
import { airTerminalFamilyAtVersion } from "@/domain/catalogs/air-terminals";
import { moveHvacOutdoorUnit } from "@/domain/air-conditioning/outdoor";
import { moveHydronicOutdoorUnit } from "@/domain/hydronic/apply";
import { updateFanCoil } from "@/domain/fan-coils/apply";

export type TransformMode = "translate" | "rotate" | "scale";

/** A temporary preview, one shared project command at pointer release. */
export function DeviceTransform({
  project,
  id,
  mode,
  onPreview,
  onGuide,
}: {
  project: Project;
  id: string;
  mode: TransformMode;
  onPreview: (p: Project | null) => void;
  onGuide: (s: string) => void;
}) {
  const { snap, commit, setError } = useProjectStore();
  const proxy = useRef(new THREE.Group());
  const dragging = useRef(false);
  useEffect(
    () => () => {
      onPreview(null);
      onGuide("");
    },
    [onPreview, onGuide],
  );
  const t = project.airTerminals.find((t) => t.id === id);
  const plenum = project.plenums.find((pl) => pl.id === id);
  const pillar = project.pillars?.find((c) => c.id === id);
  const system = project.hvacSystems.find((s) =>
    s.indoorUnits.some((u) => u.id === id),
  );
  const unit = system?.indoorUnits.find((u) => u.id === id);
  const fanCoil = project.fanCoils?.find((u) => u.id === id);
  const hydronicOutdoor = project.hydronicSystems?.find(
    (s) => s.outdoorUnit.id === id,
  )?.outdoorUnit;
  const outdoor =
    hydronicOutdoor ??
    project.hvacSystems.find((s) => s.outdoorUnit?.id === id)?.outdoorUnit;
  const item = t ?? plenum ?? pillar ?? fanCoil ?? outdoor ?? unit;
  const validLength = t
    ? airTerminalFamilyAtVersion(t.family, t.catalogVersion)?.isLinearPerMeter
    : !!plenum || !!pillar;
  const elevation =
    t?.elevationM ??
    plenum?.elevationM ??
    fanCoil?.elevationM ??
    outdoor?.elevationM ??
    (pillar
      ? pillar.heightMm / 2000
      : unit && system?.type === "ducted"
        ? (project.rooms.find((r) => r.id === unit.roomId)?.heightM ?? 2.7) -
          unit.heightMm / 2000 -
          0.05
        : 2);
  useEffect(() => {
    if (!proxy.current || !item || dragging.current) return;
    proxy.current.position.set(item.position.x, elevation, item.position.y);
    proxy.current.rotation.set(0, -item.rotation, 0);
    proxy.current.scale.set(1, 1, 1);
  }, [item, elevation, mode]);
  const apply = useCallback(
    (p: Project): Project => {
      const object = proxy.current;
      if (!object || !item) return p;
      if (mode === "translate" && outdoor) {
        const patch = {
          position: { x: object.position.x, y: object.position.z },
          elevationM: object.position.y,
        };
        return hydronicOutdoor
          ? moveHydronicOutdoorUnit(p, id, patch)
          : moveHvacOutdoorUnit(p, id, patch);
      }
      if (mode === "translate")
        return movePlacedDevice(
          p,
          id,
          { x: object.position.x, y: object.position.z },
          snap,
        );
      const rotation = -object.rotation.y;
      const widthMm = Math.max(1, item.widthMm * object.scale.x);
      if (outdoor)
        return hydronicOutdoor
          ? moveHydronicOutdoorUnit(p, id, { rotation })
          : moveHvacOutdoorUnit(p, id, { rotation });
      if (fanCoil) return updateFanCoil(p, id, { rotation });
      if (t)
        return editOperatorTerminal(
          p,
          id,
          mode === "rotate" ? { rotation } : { widthMm },
        );
      if (plenum)
        return {
          ...p,
          plenums: p.plenums.map((pl) =>
            pl.id === id
              ? {
                  ...pl,
                  ...(mode === "rotate" ? { rotation } : { widthMm }),
                  status: "manual",
                }
              : pl,
          ),
        };
      if (pillar)
        return {
          ...p,
          pillars: p.pillars?.map((c) =>
            c.id === id
              ? { ...c, ...(mode === "rotate" ? { rotation } : { widthMm }) }
              : c,
          ),
        };
      return {
        ...p,
        hvacSystems: p.hvacSystems.map((s) => ({
          ...s,
          indoorUnits: s.indoorUnits.map((u) =>
            u.id === id ? { ...u, rotation } : u,
          ),
        })),
      };
    },
    [
      id,
      item,
      mode,
      plenum,
      pillar,
      snap,
      t,
      outdoor,
      hydronicOutdoor,
      fanCoil,
    ],
  );
  if (!item || item.locked || (mode === "scale" && !validLength)) return null;
  return (
    <>
      <group ref={proxy} />
      <TransformControls
        ref={alignTranslateArrows}
        object={proxy}
        mode={mode}
        space={mode === "translate" ? "world" : "local"}
        size={outdoor ? 1.2 : 0.8}
        showX={mode !== "rotate"}
        showY={mode === "rotate" || (mode === "translate" && !!outdoor)}
        showZ={mode === "translate"}
        rotationSnap={snap.enabled && snap.angle45 ? Math.PI / 4 : undefined}
        translationSnap={snap.enabled && snap.grid ? snap.stepM : undefined}
        onMouseDown={() => {
          dragging.current = true;
        }}
        onObjectChange={() => {
          if (!dragging.current) return;
          try {
            onPreview(apply(project));
            if (t && mode === "translate" && proxy.current)
              onGuide(
                snapTerminalPose(
                  project,
                  id,
                  { x: proxy.current.position.x, y: proxy.current.position.z },
                  snap,
                ).label,
              );
            else
              onGuide(
                mode === "scale" && proxy.current
                  ? `Longhezza ${Math.round(item.widthMm * proxy.current.scale.x)} mm`
                  : "Modifica 3D in corso",
              );
          } catch (error) {
            onGuide(
              error instanceof Error ? error.message : "Modifica da verificare",
            );
          }
        }}
        onMouseUp={() => {
          if (!dragging.current) return;
          dragging.current = false;
          try {
            commit(apply);
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "Modifica 3D non valida.",
            );
          }
          onPreview(null);
          onGuide("");
        }}
      />
    </>
  );
}
