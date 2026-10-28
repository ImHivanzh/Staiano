"use client";
import { useMemo } from "react";
import type { Room } from "@/schemas/project";

/** Larghezza della cornice, del filo d'ombra e spessore, metri. */
const BAND = 0.2;
const GAP = 0.03;
const THICK = 0.08;

const inside = (polygon: Room["polygon"], x: number, y: number) => {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (
      a.y > y !== b.y > y &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    )
      hit = !hit;
  }
  return hit;
};

/**
 * Controsoffitto del video social: una cornice bianca lungo il perimetro, appena sotto il bordo dei muri,
 * con un filo d'ombra sul lato interno. Si legge subito come controsoffitto e lascia la stanza aperta:
 * dall'alto gli apparecchi restano nitidi, senza veli né superfici che sporcano la vista.
 */
export function SocialCeiling({ room }: { room: Room }) {
  const edges = useMemo(
    () =>
      room.polygon.flatMap((a, i) => {
        const b = room.polygon[(i + 1) % room.polygon.length];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (length < 0.05) return [];
        const dx = (b.x - a.x) / length;
        const dz = (b.y - a.y) / length;
        const mx = (a.x + b.x) / 2;
        const mz = (a.y + b.y) / 2;
        // Verso l'interno della stanza, anche per poligoni non convessi.
        const inward = inside(room.polygon, mx - dz * 0.05, mz + dx * 0.05)
          ? 1
          : -1;
        // Con θ = -atan2(dz, dx) l'asse z locale coincide con la normale (-dz, dx): l'interno è `inward`.
        const angle = -Math.atan2(dz, dx);
        const side = inward;
        return [{ length, mx, mz, angle, side }];
      }),
    [room.polygon],
  );
  // Più bassa del bordo dei muri: dall'alto si legge come gradino, non come muro più spesso.
  const y = room.heightM - 0.2 - THICK / 2;
  return (
    <group>
      {edges.map((edge, i) => (
        <group
          key={i}
          position={[edge.mx, y, edge.mz]}
          rotation={[0, edge.angle, 0]}
        >
          <mesh
            position={[0, 0, (edge.side * BAND) / 2]}
            raycast={() => undefined}
          >
            <boxGeometry args={[edge.length, THICK, BAND]} />
            <meshStandardMaterial color="#e9e4d9" roughness={0.9} />
          </mesh>
          <mesh
            position={[0, -THICK / 2 - GAP / 2, edge.side * BAND]}
            raycast={() => undefined}
          >
            <boxGeometry args={[edge.length, GAP, GAP]} />
            <meshBasicMaterial color="#7f95a3" />
          </mesh>
        </group>
      ))}
    </group>
  );
}
