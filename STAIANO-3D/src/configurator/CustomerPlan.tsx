"use client";
import { useMemo } from "react";
import type { Project } from "@/schemas/project";
import { roomTone, roomToneColors } from "@/domain/room-tone";
import { formatNumber } from "@/utils/format";
import styles from "./CustomerView.module.css";

const radiansToDegrees = (value: number) => (value * 180) / Math.PI;

/** Planimetria di sola lettura per il cliente: ambienti, muri, aperture e apparecchi, senza strumenti. */
export function CustomerPlan({
  project,
  floorId,
}: {
  project: Project;
  floorId: string;
}) {
  const plan = useMemo(() => {
    const rooms = project.rooms.filter(
      (room) => room.floorId === floorId && room.geometryStatus === "closed",
    );
    const walls = project.walls.filter((wall) => wall.floorId === floorId);
    const points = [
      ...rooms.flatMap((room) => room.polygon),
      ...walls.flatMap((wall) => [wall.start, wall.end]),
    ];
    if (!points.length) return null;
    const margin = 0.5;
    const minX = Math.min(...points.map((p) => p.x)) - margin;
    const minY = Math.min(...points.map((p) => p.y)) - margin;
    const width = Math.max(...points.map((p) => p.x)) + margin - minX;
    const height = Math.max(...points.map((p) => p.y)) + margin - minY;
    const devices = [
      ...project.radiators.map((item) => ({ item, kind: "radiator" })),
      ...project.airTerminals.map((item) => ({
        item,
        kind: item.use === "return" ? "return" : "supply",
      })),
      ...project.hvacSystems.flatMap((system) =>
        system.indoorUnits.map((item) => ({ item, kind: "unit" })),
      ),
    ].filter(({ item }) => item.floorId === floorId);
    const openings = project.openings.flatMap((opening) => {
      const wall = walls.find((item) => item.id === opening.wallId);
      if (!wall) return [];
      const length = Math.hypot(
        wall.end.x - wall.start.x,
        wall.end.y - wall.start.y,
      );
      if (length < 1e-6) return [];
      const ux = (wall.end.x - wall.start.x) / length,
        uy = (wall.end.y - wall.start.y) / length;
      const widthM = Math.min(
        opening.widthM,
        Math.max(0, length - opening.offsetM),
      );
      return [
        {
          id: opening.id,
          type: opening.type,
          x: wall.start.x + ux * opening.offsetM,
          y: wall.start.y + uy * opening.offsetM,
          angle: radiansToDegrees(Math.atan2(uy, ux)),
          width: widthM,
          thickness: wall.thickness,
        },
      ];
    });
    return { rooms, walls, devices, openings, minX, minY, width, height };
  }, [project, floorId]);
  if (!plan) return null;
  const font = Math.max(plan.width, plan.height) / 26;
  return (
    <aside className={styles.plan} aria-label="Planimetria del piano">
      <svg
        viewBox={`${plan.minX} ${plan.minY} ${plan.width} ${plan.height}`}
        role="img"
        aria-label="Pianta con ambienti e apparecchi"
      >
        {plan.rooms.map((room) => (
          <polygon
            key={room.id}
            points={room.polygon.map((p) => `${p.x},${p.y}`).join(" ")}
            fill={roomToneColors[roomTone(room.name, room.usage)].soft}
          />
        ))}
        {plan.walls.map((wall) => (
          <line
            key={wall.id}
            x1={wall.start.x}
            y1={wall.start.y}
            x2={wall.end.x}
            y2={wall.end.y}
            stroke="#36495c"
            strokeWidth={wall.thickness}
            strokeLinecap="square"
          />
        ))}
        {plan.openings.map((opening) => (
          <g
            key={opening.id}
            transform={`translate(${opening.x} ${opening.y}) rotate(${opening.angle})`}
          >
            {opening.type === "window" ? (
              <rect
                y={-opening.thickness / 2}
                width={opening.width}
                height={opening.thickness}
                fill="#e4f3f8"
                stroke="#3f8fa6"
                strokeWidth={font / 14}
              />
            ) : (
              <>
                <rect
                  y={-opening.thickness / 2 - font / 40}
                  width={opening.width}
                  height={opening.thickness + font / 20}
                  fill="#fbfcfd"
                />
                <path
                  d={`M 0 0 L ${opening.width} 0 A ${opening.width} ${opening.width} 0 0 1 0 ${opening.width} Z`}
                  fill="rgb(95 112 100 / 10%)"
                  stroke="#7b8a7d"
                  strokeWidth={font / 16}
                />
              </>
            )}
          </g>
        ))}
        {plan.devices.map(({ item, kind }) => (
          <rect
            key={item.id}
            x={-item.widthMm / 2000}
            y={-Math.max(item.depthMm ?? 0, 120) / 2000}
            width={item.widthMm / 1000}
            height={Math.max(item.depthMm ?? 0, 120) / 1000}
            rx={font / 10}
            transform={`translate(${item.position.x} ${item.position.y}) rotate(${radiansToDegrees(item.rotation)})`}
            className={styles.planDevice}
            data-kind={kind}
          />
        ))}
        {plan.rooms.map((room) => {
          const label = room.centroid;
          return (
            <g key={room.id} textAnchor="middle" className={styles.planLabel}>
              <text x={label.x} y={label.y - font * 0.15} fontSize={font}>
                {room.name}
              </text>
              <text
                x={label.x}
                y={label.y + font * 0.95}
                fontSize={font * 0.78}
                className={styles.planArea}
              >
                {formatNumber(room.netAreaM2)} m²
              </text>
            </g>
          );
        })}
      </svg>
      <ul className={styles.planLegend} aria-label="Legenda">
        <li data-kind="unit">Unità interne</li>
        <li data-kind="supply">Mandata</li>
        <li data-kind="return">Ripresa</li>
        <li data-kind="radiator">Radiatori</li>
      </ul>
    </aside>
  );
}
