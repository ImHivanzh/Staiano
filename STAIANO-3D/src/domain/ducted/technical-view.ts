import type { Project } from "@/schemas/project";
import { hvacProductAtVersion } from "@/domain/catalogs/hvac";
import { calculateSupplyPlenum } from "./plenum";
import { placedPlenumGeometry } from "./placement";

type Vertex = [number, number, number];
type XY = [number, number];
export type TechnicalDrawing = {
  polygons: { points: XY[]; color: string }[];
  lines: XY[][];
  labels: { point: XY; text: string }[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  portCount: number;
};

/** Orthographic projection of the actual dimensioned 3D assembly, printable vectors. */
export function plenumTechnicalDrawing(
  project: Project,
  systemId: string,
  view: "isometric" | "top" | "front" = "isometric",
): TechnicalDrawing | null {
  const result = calculateSupplyPlenum(project, systemId);
  const plenum = project.plenums.find(
    (pl) => pl.systemId === systemId && pl.use === "supply",
  );
  const geometry = plenum
    ? placedPlenumGeometry(project, plenum)
    : result.machineGeometry;
  if (
    !geometry?.bodyWidthMm ||
    !geometry.bodyHeightMm ||
    !geometry.totalDepthMm ||
    !geometry.inlet
  )
    return null;
  const projectVertex = (p: Vertex): XY =>
    view === "front"
      ? [p[0], p[1]]
      : view === "top"
        ? [p[0], -p[2]]
        : [((p[0] - p[2]) * Math.sqrt(3)) / 2, p[1] - (p[0] + p[2]) / 2];
  const polygons: TechnicalDrawing["polygons"] = [],
    lines: XY[][] = [],
    labels: TechnicalDrawing["labels"] = [];
  const polygon = (vertices: Vertex[], color: string) =>
    polygons.push({ points: vertices.map(projectVertex), color });
  const box = (
    w: number,
    h: number,
    d: number,
    at: Vertex,
    angle = 0,
    color = "#b8ccd5",
  ) => {
    const vertex = (x: number, y: number, z: number): Vertex => [
      at[0] + x * Math.cos(angle) - z * Math.sin(angle),
      at[1] + y,
      at[2] + x * Math.sin(angle) + z * Math.cos(angle),
    ];
    const corners = [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ].map(([x, y, z]) => vertex((x * w) / 2, (y * h) / 2, (z * d) / 2));
    for (const face of [
      [4, 5, 6, 7],
      [1, 2, 6, 5],
      [3, 7, 6, 2],
    ])
      polygon(
        face.map((i) => corners[i]),
        color,
      );
  };
  const system = project.hvacSystems.find((s) => s.id === systemId)!;
  const machine = system.indoorUnits[0];
  const dims =
    system.genericMachine ??
    hvacProductAtVersion(system.productId, system.catalogVersion);
  if (view !== "front" && dims?.widthMm && dims.heightMm && dims.depthMm) {
    let center: Vertex = [0, 0, -dims.depthMm / 2];
    if (plenum && machine) {
      const x = (machine.position.x - plenum.position.x) * 1000,
        z = (machine.position.y - plenum.position.y) * 1000;
      const room = project.rooms.find((r) => r.id === machine.roomId)!;
      const elevation = room.heightM - machine.heightMm / 2000 - 0.05;
      center = [
        x * Math.cos(plenum.rotation) + z * Math.sin(plenum.rotation),
        (elevation - (plenum.elevationM ?? 2)) * 1000,
        -x * Math.sin(plenum.rotation) +
          z * Math.cos(plenum.rotation) +
          plenum.depthMm / 2,
      ];
    }
    box(
      dims.widthMm,
      dims.heightMm,
      dims.depthMm,
      center,
      machine && plenum ? machine.rotation - plenum.rotation : 0,
      "#dbe3e6",
    );
    labels.push({
      point: projectVertex([
        center[0],
        center[1] + dims.heightMm / 2 + 60,
        center[2],
      ]),
      text: "MACCHINA",
    });
  }
  const w = geometry.bodyWidthMm,
    h = geometry.bodyHeightMm,
    transition = geometry.transitionDepthMm ?? 0,
    depth = geometry.boxDepthMm ?? 0;
  const inletW = geometry.inlet.connectionWidthMm,
    inletH = geometry.inlet.connectionHeightMm;
  if (transition > 0) {
    polygon(
      [
        [-inletW / 2, inletH / 2, 0],
        [inletW / 2, inletH / 2, 0],
        [w / 2, h / 2, transition],
        [-w / 2, h / 2, transition],
      ],
      "#bfced5",
    );
    polygon(
      [
        [inletW / 2, -inletH / 2, 0],
        [inletW / 2, inletH / 2, 0],
        [w / 2, h / 2, transition],
        [w / 2, -h / 2, transition],
      ],
      "#a6bdc9",
    );
  }
  box(w, h, depth, [0, 0, transition + depth / 2]);
  labels.push({
    point: projectVertex([0, h / 2 + 60, transition + depth / 2]),
    text: "PLENUM",
  });
  const portRows = [
    ...new Set(geometry.ports.map((port) => port.centerMm[1])),
  ].sort((a, b) => b - a);
  for (const port of geometry.ports) {
    const [x, y, z] = port.centerMm;
    const ring = (at: number) =>
      Array.from({ length: 33 }, (_, i): Vertex => [
        x + (Math.cos((i * Math.PI) / 16) * port.diameterMm) / 2,
        y + (Math.sin((i * Math.PI) / 16) * port.diameterMm) / 2,
        at,
      ]);
    const back = ring(z),
      front = ring(z + port.collarLengthMm);
    for (let i = 0; i < 32; i += 4)
      polygon([back[i], back[i + 4], front[i + 4], front[i]], "#dce8ec");
    polygon(front, "#eef5f7");
    lines.push(back.map(projectVertex), front.map(projectVertex));
    const outlet = projectVertex([x, y, z + port.collarLengthMm]);
    // Top projection collapses vertical rows: separate their numbered callouts.
    const labelPoint: XY =
      view === "top"
        ? [outlet[0], outlet[1] - 55 - portRows.indexOf(y) * 45]
        : projectVertex([x, y, z + port.collarLengthMm + 5]);
    if (view === "top") lines.push([outlet, labelPoint]);
    labels.push({ point: labelPoint, text: String(port.number) });
  }
  const points = [
    ...polygons.flatMap((p) => p.points),
    ...lines.flat(),
    ...labels.map((l) => l.point),
  ];
  return {
    polygons,
    lines,
    labels,
    portCount: geometry.ports.length,
    bounds: {
      minX: Math.min(...points.map((p) => p[0])) - 60,
      maxX: Math.max(...points.map((p) => p[0])) + 60,
      minY: Math.min(...points.map((p) => p[1])) - 60,
      maxY: Math.max(...points.map((p) => p[1])) + 60,
    },
  };
}
