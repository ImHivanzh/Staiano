"use client";
import { useEffect, useRef, useState } from "react";
import type { Point, Project, Selection } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { addWall, moveWall } from "@/domain/project";
import { RecalibrationDialog } from "../RecalibrationDialog";
import {
  add,
  bounds,
  distance,
  samePoint,
  scale,
  snapPoint,
  subtract,
} from "@/domain/geometry/primitives";
import { formatNumber } from "@/utils/format";
import { movePlacedDevice } from "@/domain/geometry/move-device";
import { translateSelection } from "@/domain/geometry/selection";
import { deviceCodes } from "@/services/export/device-codes";
import { ArrowsOut, Minus, Plus } from "@phosphor-icons/react";
import { wallMeasuredLength } from "@/domain/geometry/dimensions";
import { snapTerminalPose } from "@/domain/geometry/terminal-snap";
import { ductRoute } from "@/domain/ducted/routes";
import { hydronicPipeRoute } from "@/domain/hydronic/routes";

type View = { x: number; y: number; w: number; h: number };
type Drag = {
  type: "pan" | "wall" | "device" | "group";
  pointerId: number;
  anchor: Point;
  view: View;
  wallId?: string;
  deviceId?: string;
  delta: Point;
  selection?: Selection[];
};
export function Editor2D({
  placement,
}: {
  placement?: {
    project: Project;
    terminalId: string;
    onMove: (point: Point) => void;
  };
} = {}) {
  const {
    project: savedProject,
    activeFloorId: savedFloorId,
    tool: savedTool,
    snap,
    showGrid,
    showDimensions,
    selection: savedSelection,
    commit,
    select,
  } = useProjectStore();
  const project = placement?.project ?? savedProject;
  const activeFloorId = placement
    ? placement.project.airTerminals.find(
        (item) => item.id === placement.terminalId,
      )!.floorId
    : savedFloorId;
  const tool = placement ? "select" : savedTool;
  const selection: Selection[] = placement
    ? [{ kind: "device", id: placement.terminalId }]
    : savedSelection;
  const placing = useRef(false);
  const initialPlacementFit = useRef(!!placement);
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<Drag | null>(null);
  const [view, setView] = useState<View>({ x: -2, y: -2, w: 14, h: 10 });
  const [anchor, setAnchor] = useState<Point | null>(null),
    [chainStart, setChainStart] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<{ point: Point; kind: string } | null>(
      null,
    ),
    [measure, setMeasure] = useState<[Point, Point] | null>(null);
  const [delta, setDelta] = useState<Point | null>(null),
    [exact, setExact] = useState("");
  const [calibrationDistance, setCalibrationDistance] = useState<number | null>(
    null,
  );
  const [size, setSize] = useState({ width: 900, height: 700 });
  const [terminalPose, setTerminalPose] = useState<ReturnType<
    typeof snapTerminalPose
  > | null>(null);
  const walls = project?.walls.filter((w) => w.floorId === activeFloorId) ?? [],
    rooms = project?.rooms.filter((r) => r.floorId === activeFloorId) ?? [];
  const floor = project?.floors.find((f) => f.id === activeFloorId);
  const u = Math.max(view.w / size.width, view.h / size.height);
  const fitRef = useRef(fit);
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      });
      if (initialPlacementFit.current && entry.contentRect.width > 0) {
        initialPlacementFit.current = false;
        fitRef.current();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  function fit() {
    const b = bounds(walls.flatMap((w) => [w.start, w.end]));
    for (const unit of project?.hydronicSystems
      ?.filter((s) => s.outdoorUnit.floorId === activeFloorId)
      .map((s) => s.outdoorUnit) ?? []) {
      const radius = Math.hypot(unit.widthMm, unit.depthMm) / 2000;
      b.minX = Math.min(b.minX, unit.position.x - radius);
      b.maxX = Math.max(b.maxX, unit.position.x + radius);
      b.minY = Math.min(b.minY, unit.position.y - radius);
      b.maxY = Math.max(b.maxY, unit.position.y + radius);
    }
    if (floor?.background) {
      b.minX = Math.min(b.minX, floor.background.origin.x);
      b.minY = Math.min(b.minY, floor.background.origin.y);
      b.maxX = Math.max(
        b.maxX,
        floor.background.origin.x +
          floor.background.widthPx * floor.background.metersPerPixel,
      );
      b.maxY = Math.max(
        b.maxY,
        floor.background.origin.y +
          floor.background.heightPx * floor.background.metersPerPixel,
      );
    }
    const ratio = svg.current
      ? svg.current.clientWidth / Math.max(1, svg.current.clientHeight)
      : 1.4;
    const w = Math.max(b.maxX - b.minX + 2, (b.maxY - b.minY + 2) * ratio),
      h = w / ratio;
    setView({
      x: (b.minX + b.maxX - w) / 2,
      y: (b.minY + b.maxY - h) / 2,
      w,
      h,
    });
  }
  // Reset unfinished drawing when the tool or floor changes.
  useEffect(() => {
    const reset = () => {
      setAnchor(null);
      setChainStart(null);
      setMeasure(null);
    };
    reset();
  }, [tool, activeFloorId]);
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = world(e.clientX, e.clientY);
      const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
      setView((v) => {
        if (v.w * factor < 1 || v.w * factor > 500) return v;
        return {
          x: p.x - (p.x - v.x) * factor,
          y: p.y - (p.y - v.y) * factor,
          w: v.w * factor,
          h: v.h * factor,
        };
      });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);
  function world(x: number, y: number): Point {
    const node = svg.current,
      matrix = node?.getScreenCTM();
    if (!node || !matrix) return { x: 0, y: 0 };
    const p = new DOMPoint(x, y).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  }
  function target(e: React.PointerEvent) {
    const raw = world(e.clientX, e.clientY);
    if (tool === "calibrate" || tool === "pan")
      return { point: raw, kind: "libero" };
    const snapped = snapPoint(raw, walls, anchor, {
      ...snap,
      toleranceM: view.w / 100,
    });
    const length = Number(exact.replace(",", "."));
    if (
      anchor &&
      length >= 0.05 &&
      length <= 100 &&
      tool === "wall" &&
      distance(anchor, snapped.point) > 0.001
    )
      return {
        ...snapped,
        point: add(
          anchor,
          scale(
            subtract(snapped.point, anchor),
            length / distance(snapped.point, anchor),
          ),
        ),
      };
    return snapped;
  }
  function onDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button === 1 || tool === "pan") {
      e.preventDefault();
      svg.current?.setPointerCapture(e.pointerId);
      drag.current = {
        type: "pan",
        pointerId: e.pointerId,
        anchor: world(e.clientX, e.clientY),
        view,
        delta: { x: 0, y: 0 },
      };
      return;
    }
    if (e.button !== 0) return;
    if (tool === "select") {
      select(null);
      return;
    }
    const hit = target(e).point;
    if (!anchor) {
      setAnchor(hit);
      setChainStart(hit);
      setMeasure(null);
      return;
    }
    if (tool === "wall") {
      const end =
        chainStart && !exact.trim() && distance(hit, chainStart) <= view.w / 100
          ? chainStart
          : hit;
      if (distance(anchor, end) < 0.05) return;
      commit((p) => addWall(p, activeFloorId, anchor, end));
      if (chainStart && samePoint(end, chainStart)) {
        setAnchor(null);
        setChainStart(null);
      } else setAnchor(end);
      setExact("");
    } else if (tool === "measure") {
      setMeasure([anchor, hit]);
      setAnchor(null);
    } else if (tool === "calibrate") {
      if (distance(anchor, hit) > 0.01 && floor?.background) {
        setCalibrationDistance(distance(anchor, hit));
      } else
        useProjectStore
          .getState()
          .setError("Distanza reale positiva e due punti distinti richiesti.");
      setAnchor(null);
    }
  }
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (d) {
      if (d.type === "pan") {
        const node = svg.current!,
          rect = node.getBoundingClientRect();
        const px = (e.movementX / rect.width) * d.view.w,
          py = (e.movementY / rect.height) * d.view.h;
        setView((v) => ({ ...v, x: v.x - px, y: v.y - py }));
      } else {
        const raw = world(e.clientX, e.clientY),
          step = snap.enabled && snap.grid ? snap.stepM : 0;
        const v = subtract(raw, d.anchor);
        d.delta = step
          ? {
              x: Math.round(v.x / step) * step,
              y: Math.round(v.y / step) * step,
            }
          : v;
        if (d.type === "device" && d.deviceId && project) {
          const terminal = project.airTerminals.find(
            (t) => t.id === d.deviceId,
          );
          if (terminal) {
            const pose = snapTerminalPose(
              project,
              terminal.id,
              add(terminal.position, d.delta),
              snap,
            );
            d.delta = subtract(pose.position, terminal.position);
            setTerminalPose(pose);
          }
        }
        setDelta(d.delta);
      }
      return;
    }
    setCursor(target(e));
  }
  function onUp(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (
      d?.type === "group" &&
      d.selection &&
      distance(d.delta, { x: 0, y: 0 }) > 0.001
    )
      commit((project) => translateSelection(project, d.selection!, d.delta));
    if (d?.type === "device" && d.deviceId && project) {
      const item = [
        ...project.radiators,
        ...(project.fanCoils ?? []),
        ...project.airTerminals,
        ...project.plenums,
        ...(project.pillars ?? []),
        ...(project.hydronicSystems ?? []).map((s) => s.outdoorUnit),
        ...project.hvacSystems.flatMap((system) => system.indoorUnits),
      ].find((r) => r.id === d.deviceId);
      if (item && distance(d.delta, { x: 0, y: 0 }) > 0.001)
        commit((p) =>
          movePlacedDevice(p, d.deviceId!, add(item.position, d.delta), snap),
        );
    }
    if (
      d?.type === "wall" &&
      d.wallId &&
      distance(d.delta, { x: 0, y: 0 }) > 0.001
    )
      commit((p) => moveWall(p, d.wallId!, d.delta));
    drag.current = null;
    setDelta(null);
    setTerminalPose(null);
    if (svg.current?.hasPointerCapture(e.pointerId))
      svg.current.releasePointerCapture(e.pointerId);
  }
  function beginDeviceDrag(e: React.PointerEvent, id: string) {
    if (tool !== "select") return;
    e.stopPropagation();
    const prior = useProjectStore.getState().selection;
    const group =
      !e.shiftKey && prior.length > 1 && prior.some((s) => s.id === id);
    if (!group) select({ kind: "device", id }, e.shiftKey);
    if (
      [
        ...(project?.radiators ?? []),
        ...(project?.fanCoils ?? []),
        ...(project?.hydronicSystems?.map((s) => s.outdoorUnit) ?? []),
        ...(project?.airTerminals ?? []),
        ...(project?.plenums ?? []),
        ...(project?.pillars ?? []),
        ...(project?.hvacSystems.flatMap((s) => s.indoorUnits) ?? []),
      ].find((o) => o.id === id)?.locked
    )
      return;
    if (e.shiftKey) return;
    svg.current?.setPointerCapture(e.pointerId);
    drag.current = {
      type: group ? "group" : "device",
      selection: group ? prior : undefined,
      deviceId: id,
      pointerId: e.pointerId,
      anchor: world(e.clientX, e.clientY),
      view,
      delta: { x: 0, y: 0 },
    };
  }
  const selectedWall = walls.find((w) => w.id === drag.current?.wallId);
  const groupSelection =
    drag.current?.type === "group" ? (drag.current.selection ?? []) : [];
  const groupWalls = walls.filter(
    (w) =>
      groupSelection.some((s) => s.kind === "wall" && s.id === w.id) ||
      rooms.some(
        (r) =>
          groupSelection.some((s) => s.kind === "room" && s.id === r.id) &&
          r.wallIds.includes(w.id),
      ),
  );
  const codes = project ? deviceCodes(project) : new Map<string, string>();
  const previewDevice = (device: {
    id: string;
    roomId: string;
    wallId: string | null;
    position: Point;
  }) =>
    delta &&
    (drag.current?.deviceId === device.id ||
      groupSelection.some(
        (s) =>
          s.id === device.id || (s.kind === "room" && s.id === device.roomId),
      ) ||
      groupWalls.some((w) => w.id === device.wallId))
      ? add(device.position, delta)
      : device.position;
  const previewPoint = (p: Point) =>
    delta &&
    ((selectedWall &&
      (samePoint(p, selectedWall.start) || samePoint(p, selectedWall.end))) ||
      groupWalls.some((w) => samePoint(p, w.start) || samePoint(p, w.end)))
      ? add(p, delta)
      : p;
  const instructions = placement
    ? "Clicca nell’ambiente e trascina la bocchetta. Conferma posizione per aggiornare il totale."
    : tool === "wall"
      ? "Clic per iniziare. Chiudi sul punto iniziale. Esc termina il tratto."
      : tool === "measure"
        ? "Seleziona due punti per misurare."
        : tool === "calibrate"
          ? "Seleziona due punti noti della planimetria."
          : "Seleziona una stanza o trascina una parete. Rotella per zoom.";
  return (
    <div className="area-editor">
      <svg
        ref={svg}
        role="application"
        aria-label="Editor planimetrico 2D"
        data-testid="editor-2d"
        tabIndex={placement ? 0 : undefined}
        onKeyDown={
          placement
            ? (event) => {
                const movement = {
                  ArrowLeft: [-1, 0],
                  ArrowRight: [1, 0],
                  ArrowUp: [0, -1],
                  ArrowDown: [0, 1],
                }[event.key];
                if (!movement) return;
                event.preventDefault();
                event.stopPropagation();
                const item = placement.project.airTerminals.find(
                  (terminal) => terminal.id === placement.terminalId,
                )!;
                placement.onMove({
                  x: item.position.x + movement[0] * snap.stepM,
                  y: item.position.y + movement[1] * snap.stepM,
                });
              }
            : undefined
        }
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onPointerDownCapture={
          placement
            ? (event) => {
                event.stopPropagation();
                if (event.button !== 0) return;
                placing.current = true;
                svg.current?.setPointerCapture(event.pointerId);
                placement.onMove(world(event.clientX, event.clientY));
              }
            : undefined
        }
        onPointerDown={onDown}
        onPointerMove={
          placement
            ? (event) => {
                if (placing.current)
                  placement.onMove(world(event.clientX, event.clientY));
              }
            : onMove
        }
        onPointerUp={
          placement
            ? (event) => {
                placing.current = false;
                if (svg.current?.hasPointerCapture(event.pointerId))
                  svg.current.releasePointerCapture(event.pointerId);
              }
            : onUp
        }
        onPointerCancel={() => {
          placing.current = false;
          drag.current = null;
          setDelta(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={`pianta strumento-${tool}`}
      >
        <defs>
          <pattern
            id={placement ? "placement-grid" : "grid"}
            width="0.5"
            height="0.5"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 0.5 0 L 0 0 0 0.5"
              className="griglia-pianta"
              strokeWidth={u * 0.6}
              fill="none"
            />
          </pattern>
        </defs>
        <rect
          x={view.x - 100}
          y={view.y - 100}
          width={view.w + 200}
          height={view.h + 200}
          className="fondo-pianta"
        />
        {floor?.background && (
          <image
            href={floor.background.dataUrl}
            x={floor.background.origin.x}
            y={floor.background.origin.y}
            width={floor.background.widthPx * floor.background.metersPerPixel}
            height={floor.background.heightPx * floor.background.metersPerPixel}
            opacity={floor.background.opacity}
            pointerEvents="none"
          />
        )}
        {showGrid && (
          <rect
            x={view.x - 100}
            y={view.y - 100}
            width={view.w + 200}
            height={view.h + 200}
            fill={placement ? "url(#placement-grid)" : "url(#grid)"}
            pointerEvents="none"
          />
        )}
        {rooms.map((r) => (
          <g
            key={r.id}
            transform={
              delta &&
              groupSelection.some((s) => s.kind === "room" && s.id === r.id)
                ? `translate(${delta.x} ${delta.y})`
                : undefined
            }
            onPointerDown={(e) => {
              if (tool === "select") {
                e.stopPropagation();
                const prior = useProjectStore.getState().selection;
                const group = !e.shiftKey && prior.some((s) => s.id === r.id);
                if (!group) select({ kind: "room", id: r.id }, e.shiftKey);
                if (!e.shiftKey) {
                  svg.current?.setPointerCapture(e.pointerId);
                  drag.current = {
                    type: "group",
                    pointerId: e.pointerId,
                    anchor: world(e.clientX, e.clientY),
                    view,
                    delta: { x: 0, y: 0 },
                    selection: group ? prior : [{ kind: "room", id: r.id }],
                  };
                }
              }
            }}
          >
            <polygon
              points={r.polygon.map((p) => `${p.x},${p.y}`).join(" ")}
              className={
                selection.some((s) => s.id === r.id)
                  ? "stanza-pianta scelta"
                  : "stanza-pianta"
              }
              strokeWidth={u * 1.5}
            />
            <text
              x={r.centroid.x}
              y={r.centroid.y - u * 15}
              fontSize={u * 14}
              textAnchor="middle"
              className="nome-stanza"
            >
              {r.name}
            </text>
            <text
              x={r.centroid.x}
              y={r.centroid.y + u * 5}
              fontSize={u * 12}
              textAnchor="middle"
              className="dato-stanza"
            >
              {formatNumber(r.netAreaM2)} m²
            </text>
            <text
              x={r.centroid.x}
              y={r.centroid.y + u * 24}
              fontSize={u * 12}
              textAnchor="middle"
              className="potenza-stanza"
            >
              {formatNumber(r.designLoadW / 1000)} kW
            </text>
          </g>
        ))}
        {walls.map((w) => {
          const a = previewPoint(w.start),
            b = previewPoint(w.end),
            chosen = selection.some((s) => s.id === w.id);
          const x = (a.x + b.x) / 2,
            y = (a.y + b.y) / 2;
          return (
            <g
              key={w.id}
              data-testid="wall"
              onPointerDown={(e) => {
                if (tool !== "select") return;
                e.stopPropagation();
                const prior = useProjectStore.getState().selection;
                const group =
                  !e.shiftKey &&
                  prior.length > 1 &&
                  prior.some((s) => s.id === w.id);
                if (!group) select({ kind: "wall", id: w.id }, e.shiftKey);
                if (w.locked) return;
                if (!e.shiftKey) {
                  svg.current?.setPointerCapture(e.pointerId);
                  drag.current = {
                    type: group ? "group" : "wall",
                    selection: group ? prior : undefined,
                    wallId: w.id,
                    pointerId: e.pointerId,
                    anchor: world(e.clientX, e.clientY),
                    view,
                    delta: { x: 0, y: 0 },
                  };
                }
              }}
            >
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                strokeWidth={Math.max(w.thickness, u * 7)}
                className="presa-muro"
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                strokeWidth={w.thickness}
                className={chosen ? "muro-pianta scelto" : "muro-pianta"}
              />
              {chosen &&
                [a, b].map((v, i) => (
                  <circle
                    key={i}
                    cx={v.x}
                    cy={v.y}
                    r={u * 5}
                    className="estremo-muro"
                    strokeWidth={u}
                  />
                ))}
              {showDimensions && (
                <text
                  x={x}
                  y={y - w.thickness / 2 - u * 10}
                  textAnchor="middle"
                  fontSize={u * 11}
                  className="quota-pianta"
                >
                  {formatNumber(
                    project ? wallMeasuredLength(project, w, "internal") : 0,
                  )}{" "}
                  m
                </text>
              )}
            </g>
          );
        })}
        {project?.openings
          .filter((o) => o.floorId === activeFloorId)
          .map((opening) => {
            const wall = walls.find((w) => w.id === opening.wallId);
            if (!wall) return null;
            const a = previewPoint(wall.start),
              b = previewPoint(wall.end);
            const length = distance(a, b);
            if (length < 1e-7) return null;
            const x = a.x + ((b.x - a.x) / length) * opening.offsetM;
            const y = a.y + ((b.y - a.y) / length) * opening.offsetM;
            const width = Math.min(
              opening.widthM,
              Math.max(0, length - opening.offsetM),
            );
            return (
              <g
                key={opening.id}
                data-testid="opening-2d"
                transform={`translate(${x} ${y}) rotate(${(Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI})`}
                onPointerDown={(e) => {
                  if (tool !== "select") return;
                  e.stopPropagation();
                  select({ kind: "wall", id: wall.id });
                }}
              >
                <title>
                  {opening.type === "door" ? "Porta" : "Finestra"} ·{" "}
                  {formatNumber(opening.widthM)} ×{" "}
                  {formatNumber(opening.heightM)} m
                </title>
                <line
                  x1={0}
                  x2={width}
                  y1={0}
                  y2={0}
                  stroke="var(--carta)"
                  strokeWidth={wall.thickness + 0.012}
                />
                {opening.type === "window" ? (
                  [-1, 1].map((sign) => (
                    <line
                      key={sign}
                      x1={0}
                      x2={width}
                      y1={(sign * wall.thickness) / 4}
                      y2={(sign * wall.thickness) / 4}
                      stroke="#4599ac"
                      strokeWidth={u * 1.2}
                    />
                  ))
                ) : (
                  <>
                    <line
                      x1={0}
                      x2={0}
                      y1={0}
                      y2={width}
                      stroke="#7b8a7d"
                      strokeWidth={u * 1.2}
                    />
                    <path
                      d={`M ${width} 0 A ${width} ${width} 0 0 1 0 ${width}`}
                      fill="none"
                      stroke="#7b8a7d"
                      strokeWidth={u}
                    />
                  </>
                )}
              </g>
            );
          })}
        {project?.ducts
          ?.filter((d) =>
            project.plenums.some(
              (pl) => pl.id === d.plenumId && pl.floorId === activeFloorId,
            ),
          )
          .map((d) => {
            const route = ductRoute(project, d);
            return (
              <polyline
                key={d.id}
                points={route.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="#2589ac"
                strokeWidth={Math.max(
                  u * 2,
                  (d.diameterMm ?? d.widthMm ?? 50) / 1000,
                )}
                opacity={0.4}
                pointerEvents="none"
              >
                <title>
                  {codes.get(d.id)} ·{" "}
                  {d.terminalId ? codes.get(d.terminalId) : "Macchina → plenum"}
                </title>
              </polyline>
            );
          })}
        {project?.radiators
          .filter((d) => d.floorId === activeFloorId)
          .map((d) => {
            const pos = previewDevice(d);
            return (
              <g
                key={d.id}
                data-testid="radiator-2d"
                transform={`translate(${pos.x} ${pos.y}) rotate(${(d.rotation * 180) / Math.PI})`}
                onPointerDown={(e) => beginDeviceDrag(e, d.id)}
              >
                <rect
                  x={-d.widthMm / 2000}
                  y={-d.depthMm / 2000}
                  width={d.widthMm / 1000}
                  height={d.depthMm / 1000}
                  strokeWidth={u * 1.5}
                  className={
                    selection.some((s) => s.id === d.id)
                      ? "radiatore-pianta scelto"
                      : "radiatore-pianta"
                  }
                />
                <text
                  x={0}
                  y={d.depthMm / 2000 + u * 13}
                  textAnchor="middle"
                  fontSize={u * 11}
                  className="quota-pianta"
                >
                  {codes.get(d.id)}
                </text>
              </g>
            );
          })}
        {project?.airTerminals
          .filter((t) => t.floorId === activeFloorId)
          .map((t) => {
            const pos = previewDevice(t),
              faceDepth =
                t.mounting === "ceiling" ? t.heightMm : (t.depthMm ?? 0),
              code = codes.get(t.id);
            return (
              <g
                key={t.id}
                data-testid={`terminal-${t.use}`}
                transform={`translate(${pos.x} ${pos.y}) rotate(${((drag.current?.deviceId === t.id && terminalPose ? terminalPose.rotation : t.rotation) * 180) / Math.PI})`}
                onPointerDown={(e) => beginDeviceDrag(e, t.id)}
              >
                {t.shape === "circle" && t.mounting === "ceiling" ? (
                  <circle
                    r={t.widthMm / 2000}
                    className={`terminale-pianta ${t.use} ${selection.some((s) => s.id === t.id) ? "scelto" : ""}`}
                    strokeWidth={u * 1.5}
                  />
                ) : (
                  <rect
                    x={-t.widthMm / 2000}
                    y={-faceDepth / 2000}
                    width={t.widthMm / 1000}
                    height={Math.max(faceDepth / 1000, u * 3)}
                    className={`terminale-pianta ${t.use} ${selection.some((s) => s.id === t.id) ? "scelto" : ""}`}
                    strokeWidth={u * 1.5}
                  />
                )}
                <text
                  x={0}
                  y={faceDepth / 2000 + u * 14}
                  textAnchor="middle"
                  fontSize={u * 11}
                  className="quota-pianta"
                >
                  {code}
                </text>
              </g>
            );
          })}
        {project?.hvacSystems
          .flatMap((system) => system.indoorUnits)
          .filter((d) => d.floorId === activeFloorId)
          .map((d) => {
            const pos = previewDevice(d);
            return (
              <g
                key={d.id}
                data-testid="split-2d"
                transform={`translate(${pos.x} ${pos.y}) rotate(${(d.rotation * 180) / Math.PI})`}
                onPointerDown={(e) => beginDeviceDrag(e, d.id)}
              >
                <rect
                  x={-d.widthMm / 2000}
                  y={-d.depthMm / 2000}
                  width={d.widthMm / 1000}
                  height={d.depthMm / 1000}
                  rx={0.025}
                  strokeWidth={u * 1.5}
                  fill={
                    selection.some((s) => s.id === d.id) ? "#b3ddef" : "#ffffff"
                  }
                  stroke="#365aa8"
                />
                <line
                  x1={-d.widthMm / 2000 + 0.04}
                  x2={d.widthMm / 2000 - 0.04}
                  y1={d.depthMm / 2000 - 0.035}
                  y2={d.depthMm / 2000 - 0.035}
                  stroke="#00aeef"
                  strokeWidth={u}
                />
                <text
                  x={0}
                  y={d.depthMm / 2000 + u * 13}
                  textAnchor="middle"
                  fontSize={u * 11}
                  className="quota-pianta"
                >
                  {codes.get(d.id)}
                </text>
              </g>
            );
          })}
        {project?.fanCoils
          ?.filter((u) => u.floorId === activeFloorId)
          .map((unit) => {
            const pos = previewDevice(unit),
              depth =
                unit.mounting === "ceiling" ? unit.heightMm : unit.depthMm;
            return (
              <g
                key={unit.id}
                data-testid="fan-coil-2d"
                transform={`translate(${pos.x} ${pos.y}) rotate(${(unit.rotation * 180) / Math.PI})`}
                onPointerDown={(e) => beginDeviceDrag(e, unit.id)}
              >
                <rect
                  x={-unit.widthMm / 2000}
                  y={-depth / 2000}
                  width={unit.widthMm / 1000}
                  height={depth / 1000}
                  fill="#eef2e7"
                  stroke={
                    selection.some((s) => s.id === unit.id)
                      ? "#00aeef"
                      : "#7a8966"
                  }
                  strokeWidth={u * 1.5}
                />
                <text
                  textAnchor="middle"
                  fontSize={u * 11}
                  y={depth / 2000 + u * 13}
                >
                  {codes.get(unit.id)}
                </text>
              </g>
            );
          })}
        {project?.hydronicSystems
          ?.filter((s) => s.outdoorUnit.floorId === activeFloorId)
          .map((system) => {
            const unit = system.outdoorUnit;
            const pos = previewDevice({ ...unit, roomId: "", wallId: null });
            return (
              <g key={system.id}>
                {system.fanCoilIds.map((id) => (
                  <polyline
                    key={id}
                    points={hydronicPipeRoute(project, system, id)
                      .map((p) => `${p.x},${p.y}`)
                      .join(" ")}
                    fill="none"
                    stroke="#a87357"
                    strokeWidth={u * 1.5}
                    strokeDasharray={`${u * 5} ${u * 3}`}
                    opacity={0.55}
                    pointerEvents="none"
                  />
                ))}
                <g
                  data-testid="heat-pump-2d"
                  transform={`translate(${pos.x} ${pos.y}) rotate(${(unit.rotation * 180) / Math.PI})`}
                  onPointerDown={(e) => beginDeviceDrag(e, unit.id)}
                >
                  <rect
                    x={-unit.widthMm / 2000}
                    y={-unit.depthMm / 2000}
                    width={unit.widthMm / 1000}
                    height={unit.depthMm / 1000}
                    fill="#f1e9dc"
                    stroke={
                      selection.some((s) => s.id === unit.id)
                        ? "#00aeef"
                        : "#9b7858"
                    }
                    strokeWidth={u * 1.5}
                  />
                  <path
                    d={`M ${-unit.widthMm / 3000} ${unit.depthMm / 2000} h ${unit.widthMm / 1500}`}
                    stroke="#374047"
                    strokeWidth={u * 4}
                    pointerEvents="none"
                  />
                  <text
                    textAnchor="middle"
                    fontSize={u * 11}
                    y={unit.depthMm / 2000 + u * 13}
                  >
                    {codes.get(unit.id)} · esterna
                  </text>
                </g>
              </g>
            );
          })}
        {[...(project?.plenums ?? []), ...(project?.pillars ?? [])]
          .filter((o) => o.floorId === activeFloorId)
          .map((o) => {
            const pos = previewDevice({
              ...o,
              roomId:
                "roomId" in o && typeof o.roomId === "string" ? o.roomId : "",
              wallId: null,
            });
            const plenum = "systemId" in o;
            return (
              <g
                key={o.id}
                data-testid={plenum ? "plenum-2d" : "pillar-2d"}
                transform={`translate(${pos.x} ${pos.y}) rotate(${(o.rotation * 180) / Math.PI})`}
                onPointerDown={(e) => beginDeviceDrag(e, o.id)}
              >
                <rect
                  x={-o.widthMm / 2000}
                  y={-o.depthMm / 2000}
                  width={o.widthMm / 1000}
                  height={o.depthMm / 1000}
                  fill={plenum ? "#d2f0f4" : "#929b9b"}
                  stroke={
                    selection.some((s) => s.id === o.id) ? "#00aeef" : "#43656e"
                  }
                  strokeWidth={u * 2}
                />
                <text
                  fontSize={u * 11}
                  textAnchor="middle"
                  y={o.depthMm / 2000 + u * 13}
                >
                  {codes.get(o.id)}
                </text>
              </g>
            );
          })}
        {anchor && cursor && (
          <>
            <line
              x1={anchor.x}
              y1={anchor.y}
              x2={cursor.point.x}
              y2={cursor.point.y}
              className="tratto-provvisorio"
              strokeWidth={u * 2}
              strokeDasharray={`${u * 5} ${u * 4}`}
              pointerEvents="none"
            />
            <text
              x={(anchor.x + cursor.point.x) / 2}
              y={(anchor.y + cursor.point.y) / 2 - u * 14}
              textAnchor="middle"
              fontSize={u * 13}
              className="quota-pianta"
            >
              {formatNumber(distance(anchor, cursor.point))} m
            </text>
          </>
        )}
        {cursor && tool !== "select" && (
          <circle
            cx={cursor.point.x}
            cy={cursor.point.y}
            r={u * 5}
            className="punto-snap"
            strokeWidth={u * 1.5}
            pointerEvents="none"
          />
        )}
        {chainStart && (
          <circle
            cx={chainStart.x}
            cy={chainStart.y}
            r={u * 7}
            className="punto-inizio"
            strokeWidth={u * 2}
            pointerEvents="none"
          />
        )}
        {measure && (
          <g pointerEvents="none">
            <line
              x1={measure[0].x}
              y1={measure[0].y}
              x2={measure[1].x}
              y2={measure[1].y}
              className="tratto-provvisorio"
              strokeWidth={u * 2}
            />
            <text
              x={(measure[0].x + measure[1].x) / 2}
              y={(measure[0].y + measure[1].y) / 2 - u * 14}
              fontSize={u * 14}
              textAnchor="middle"
              className="quota-pianta"
            >
              {formatNumber(distance(...measure))} m
            </text>
          </g>
        )}
      </svg>
      <div className="indicazione-editor">{instructions}</div>
      {calibrationDistance !== null && project && (
        <RecalibrationDialog
          key={`${project.id}-${activeFloorId}`}
          project={project}
          floorId={activeFloorId}
          measuredM={calibrationDistance}
          onClose={() => setCalibrationDistance(null)}
        />
      )}
      {tool === "wall" && (
        <label className="quota-esatta">
          Lunghezza esatta (m)
          <input
            aria-label="Lunghezza esatta nuovo muro"
            value={exact}
            onChange={(e) => setExact(e.target.value)}
            placeholder="Libera"
            inputMode="decimal"
          />
          <small>La direzione segue il cursore</small>
        </label>
      )}
      <div className="zoom-editor">
        <button
          className="bottone piccolo"
          aria-label="Riduci zoom"
          onClick={() => setView((v) => ({ ...v, w: v.w * 1.2, h: v.h * 1.2 }))}
        >
          <Minus />
        </button>
        <button
          className="bottone piccolo"
          aria-label="Adatta planimetria"
          onClick={fit}
        >
          <ArrowsOut />
        </button>
        <button
          className="bottone piccolo"
          aria-label="Aumenta zoom"
          onClick={() => setView((v) => ({ ...v, w: v.w / 1.2, h: v.h / 1.2 }))}
        >
          <Plus />
        </button>
      </div>
      <div className="stato-editor">
        Quote interne · Unità: metri · Griglia 50 cm
        {terminalPose && ` · ${terminalPose.label}`}
        {cursor && tool !== "select" ? ` · Snap: ${cursor.kind}` : ""}
      </div>
    </div>
  );
}
