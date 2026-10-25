import type { Project, Selection } from "@/schemas/project";
import { drywallGeometries } from "@/domain/geometry/drywall";

export function DrywallLayer({
  project,
  floorId,
  width,
  onSelect,
  enabled,
}: {
  project: Project;
  floorId: string;
  width: number;
  onSelect: (selection: Selection) => void;
  enabled: boolean;
}) {
  return (
    <g>
      {project.walls
        .filter((w) => w.floorId === floorId && w.drywall)
        .map((wall) => {
          return (
            <g key={wall.id}>
              {drywallGeometries(project, wall).map((geometry) => (
                <g
                  key={geometry.roomId}
                  data-testid="drywall-2d"
                  onPointerDown={(event) => {
                    if (!enabled) return;
                    event.stopPropagation();
                    onSelect({ kind: "wall", id: wall.id });
                  }}
                >
                  <title>
                    Cartongesso · {(geometry.offsetM * 100).toFixed(1)} cm ·
                    {project.rooms.find((room) => room.id === geometry.roomId)
                      ?.name ?? "lato muro"}
                  </title>
                  <polygon
                    points={geometry.polygon
                      .map((p) => `${p.x},${p.y}`)
                      .join(" ")}
                    fill="#d6edf0"
                    fillOpacity={0.35}
                    stroke="#6f9ca4"
                    strokeWidth={width}
                    strokeDasharray={`${width * 5} ${width * 4}`}
                  />
                  <line
                    x1={geometry.front.start.x}
                    y1={geometry.front.start.y}
                    x2={geometry.front.end.x}
                    y2={geometry.front.end.y}
                    stroke="#527e86"
                    strokeWidth={width * 2}
                  />
                </g>
              ))}
            </g>
          );
        })}
    </g>
  );
}
