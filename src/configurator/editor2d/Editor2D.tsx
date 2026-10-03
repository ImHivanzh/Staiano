"use client";
import { useEffect, useRef, useState } from "react";
import type { Point } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { addWall, moveWall, recomputeProject } from "@/domain/project";
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
import { ArrowsOut, Minus, Plus } from "@phosphor-icons/react";

type View = { x: number; y: number; w: number; h: number };
type Drag = {
  type: "pan" | "wall" | "device";
  pointerId: number;
  anchor: Point;
  view: View;
  wallId?: string;
  deviceId?: string;
  delta: Point;
};
export function Editor2D() {
  const {
    project,
    activeFloorId,
    tool,
    snap,
    showGrid,
    showDimensions,
    selection,
    commit,
    select,
  } = useProjectStore();
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
  const [size, setSize] = useState({ width: 900, height: 700 });
  const walls = project?.walls.filter((w) => w.floorId === activeFloorId) ?? [],
    rooms = project?.rooms.filter((r) => r.floorId === activeFloorId) ?? [];
  const floor = project?.floors.find((f) => f.id === activeFloorId);
  const u = Math.max(view.w / size.width, view.h / size.height);
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  function fit() {
    const b = bounds(walls.flatMap((w) => [w.start, w.end]));
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
      const real = Number(
        window
          .prompt("Distanza reale tra i due punti, in metri (es. 4,23)")
          ?.replace(",", "."),
      );
      if (real > 0 && distance(anchor, hit) > 0.01 && floor?.background) {
        const factor = real / distance(anchor, hit),
          origin = floor.background.origin;
        const transform = (v: Point) =>
          add(origin, scale(subtract(v, origin), factor));
        commit((p) =>
          recomputeProject({
            ...p,
            floors: p.floors.map((f) =>
              f.id === activeFloorId && f.background
                ? {
                    ...f,
                    scaleVerified: true,
                    background: {
                      ...f.background,
                      metersPerPixel: f.background.metersPerPixel * factor,
                    },
                  }
                : f,
            ),
            walls: p.walls.map((w) =>
              w.floorId === activeFloorId
                ? { ...w, start: transform(w.start), end: transform(w.end) }
                : w,
            ),
          }),
        );
        useProjectStore.getState().setTool("select");
      } else if (real !== 0)
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
        setDelta(d.delta);
      }
      return;
    }
    setCursor(target(e));
  }
  function onUp(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (d?.type === "device" && d.deviceId && project) {
      const item = project.radiators.find((r) => r.id === d.deviceId);
      if (item && distance(d.delta, { x: 0, y: 0 }) > 0.001)
        commit((p) =>
          movePlacedDevice(p, d.deviceId!, add(item.position, d.delta)),
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
    if (svg.current?.hasPointerCapture(e.pointerId))
      svg.current.releasePointerCapture(e.pointerId);
  }
  const selectedWall = walls.find((w) => w.id === drag.current?.wallId);
  const previewPoint = (p: Point) =>
    delta &&
    selectedWall &&
    (samePoint(p, selectedWall.start) || samePoint(p, selectedWall.end))
      ? add(p, delta)
      : p;
  const instructions =
    tool === "wall"
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
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          drag.current = null;
          setDelta(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={`pianta strumento-${tool}`}
      >
        <defs>
          <pattern
            id="grid"
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
            fill="url(#grid)"
            pointerEvents="none"
          />
        )}
        {rooms.map((r) => (
          <g
            key={r.id}
            onPointerDown={(e) => {
              if (tool === "select") {
                e.stopPropagation();
                select({ kind: "room", id: r.id }, e.shiftKey);
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
                select({ kind: "wall", id: w.id }, e.shiftKey);
                if (!e.shiftKey) {
                  svg.current?.setPointerCapture(e.pointerId);
                  drag.current = {
                    type: "wall",
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
                  {formatNumber(distance(a, b))} m
                </text>
              )}
            </g>
          );
        })}
        {project?.radiators
          .filter((d) => d.floorId === activeFloorId)
          .map((d, i) => {
            const pos =
              drag.current?.deviceId === d.id && delta
                ? add(d.position, delta)
                : d.position;
            return (
              <g
                key={d.id}
                data-testid="radiator-2d"
                transform={`translate(${pos.x} ${pos.y}) rotate(${(d.rotation * 180) / Math.PI})`}
                onPointerDown={(e) => {
                  if (tool !== "select") return;
                  e.stopPropagation();
                  select({ kind: "device", id: d.id });
                  svg.current?.setPointerCapture(e.pointerId);
                  drag.current = {
                    type: "device",
                    deviceId: d.id,
                    pointerId: e.pointerId,
                    anchor: world(e.clientX, e.clientY),
                    view,
                    delta: { x: 0, y: 0 },
                  };
                }}
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
                  R{i + 1}
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
        Unità: metri · Griglia 50 cm
        {cursor && tool !== "select" ? ` · Snap: ${cursor.kind}` : ""}
      </div>
    </div>
  );
}
