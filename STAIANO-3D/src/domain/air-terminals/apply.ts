import {
  airTerminalFaceWidthMm,
  terminalBodyDepthMm,
  terminalFaceDimensions,
  preferredEdlsProfile,
} from "./geometry";
import type { Point, Project } from "@/schemas/project";
import {
  airTerminalCatalog,
  airTerminalMountings,
} from "@/domain/catalogs/air-terminals";
import type { AirTerminalSolution } from "./size";
import { newId } from "@/domain/project";
import { ceilingHeightAt } from "@/domain/geometry/ceilings";
import { bounds, distance } from "@/domain/geometry/primitives";
import {
  footprintCorners,
  footprintInsideRoom,
  convexFootprintsOverlap,
} from "@/domain/geometry/footprint";
import {
  roomWallSpan,
  positionAlongRoomWall,
} from "@/domain/geometry/placement";
type AirTerminal = Project["airTerminals"][number];
/** Persist every physical unit and the exact catalogue operating point. */
export function applyAirTerminalSolution(
  project: Project,
  roomId: string,
  systemId: string | null,
  use: "supply" | "return",
  familyCode: string,
  solution: AirTerminalSolution,
  mounting: "wall" | "ceiling",
  mode: "replace" | "append" = "replace",
  dimensions?: { widthMm: number; heightMm: number; depthMm: number | null },
): Project {
  const room = project.rooms.find((r) => r.id === roomId),
    family = airTerminalCatalog.families.find(
      (f) => f.familyCode === familyCode,
    ),
    variant = family?.variants.find((v) => v.id === solution.variant.id);
  if (
    !room ||
    room.geometryStatus === "unresolved" ||
    !project.floors.find((f) => f.id === room.floorId)?.scaleVerified
  )
    throw new Error("Stanza e scala verificate necessarie.");
  if (
    !family ||
    !variant ||
    !family.use.includes(use) ||
    (airTerminalMountings(family)
      ? !airTerminalMountings(family)!.includes(mounting)
      : !dimensions &&
        (!terminalFaceDimensions(family, variant).widthMm ||
          !terminalFaceDimensions(family, variant).heightMm))
  )
    throw new Error("Famiglia o montaggio non compatibili.");
  if (
    systemId &&
    !project.hvacSystems.some(
      (s) =>
        s.id === systemId && s.type === "ducted" && s.roomIds.includes(roomId),
    )
  )
    throw new Error("Sistema canalizzato non associato alla stanza.");
  const opIndex = variant.operatingPoints.findIndex(
    (p) => p === solution.operatingPoint,
  );
  if (opIndex < 0)
    throw new Error("Punto di funzionamento non presente nel catalogo.");
  const face = terminalFaceDimensions(family, variant);
  const widthMm =
      dimensions?.widthMm ??
      (solution.commercialLengthM !== null
        ? solution.commercialLengthM * 1000
        : face.widthMm),
    heightMm = dimensions?.heightMm ?? face.heightMm;
  if (!widthMm || !heightMm)
    throw new Error("Ingombro frontale non disponibile dal catalogo.");
  const faceWidthMm = dimensions
    ? widthMm
    : widthMm + (family.linearFaceLengthOffsetMm ?? 0);
  const depthMm = dimensions
      ? dimensions.depthMm
      : terminalBodyDepthMm(family, variant),
    existing = project.airTerminals.filter(
      (t) =>
        mode === "append" ||
        t.roomId !== roomId ||
        t.use !== use ||
        t.systemId !== systemId,
    ),
    added: AirTerminal[] = [];
  const footprint = (t: AirTerminal) =>
    footprintCorners(
      t.position,
      airTerminalFaceWidthMm(t) / 1000,
      (t.mounting === "ceiling" ? t.heightMm : (t.depthMm ?? 0)) / 1000,
      t.rotation,
    );
  const candidates: {
    position: Point;
    rotation: number;
    wallId: string | null;
  }[] = [];
  if (mounting === "ceiling") {
    const box = bounds(room.polygon),
      longest = room.polygon
        .map((a, i) => ({ a, b: room.polygon[(i + 1) % room.polygon.length] }))
        .sort((a, b) => distance(b.a, b.b) - distance(a.a, a.b))[0];
    const rotation = Math.atan2(
      longest.b.y - longest.a.y,
      longest.b.x - longest.a.x,
    );
    candidates.push({ position: room.centroid, rotation, wallId: null });
    for (let y = box.minY + 0.25; y < box.maxY; y += 0.25)
      for (let x = box.minX + 0.25; x < box.maxX; x += 0.25) {
        candidates.push({ position: { x, y }, rotation, wallId: null });
        if (candidates.length > 20000)
          throw new Error(
            "Stanza troppo grande per il posizionamento automatico. Ridurre la geometria.",
          );
      }
  } else {
    for (const wall of project.walls.filter((w) =>
      room.wallIds.includes(w.id),
    )) {
      const span = roomWallSpan(room, wall);
      if (!span) continue;
      const rotation = Math.atan2(
        span.end.y - span.start.y,
        span.end.x - span.start.x,
      );
      for (
        let offset = faceWidthMm / 2000 + 0.1;
        offset <= span.lengthM - faceWidthMm / 2000 - 0.1;
        offset += 0.1
      )
        candidates.push({
          position: positionAlongRoomWall(
            room,
            wall,
            offset,
            (depthMm ?? 0) / 1000,
          ),
          rotation,
          wallId: wall.id,
        });
    }
  }
  const wallElevationM = Math.min(2.2, room.heightM - heightMm / 2000 - 0.05);
  if (mounting === "wall" && wallElevationM <= heightMm / 2000)
    throw new Error("Altezza stanza insufficiente per il terminale.");
  for (let pointIndex = 0; pointIndex < solution.numberOfPoints; pointIndex++)
    for (
      let unitIndex = 0;
      unitIndex < solution.quantityPerPoint;
      unitIndex++
    ) {
      const candidate = candidates.find((c) => {
        if (
          mounting === "ceiling" &&
          !footprintInsideRoom(
            room,
            c.position,
            faceWidthMm / 1000,
            heightMm / 1000,
            c.rotation,
          )
        )
          return false;
        const target = footprintCorners(
          c.position,
          faceWidthMm / 1000 + 0.05,
          (mounting === "ceiling" ? heightMm : (depthMm ?? 0)) / 1000 + 0.05,
          c.rotation,
        );
        return ![...existing, ...added]
          .filter((t) => t.roomId === roomId && t.mounting === mounting)
          .some((t) => convexFootprintsOverlap(target, footprint(t)));
      });
      if (!candidate)
        throw new Error(
          "I terminali richiesti non rientrano nello spazio libero della stanza. Modificare punti o misura.",
        );
      const op = solution.operatingPoint;
      added.push({
        id: newId(),
        roomId,
        floorId: room.floorId,
        wallId: candidate.wallId,
        position: candidate.position,
        rotation: candidate.rotation,
        widthMm,
        heightMm,
        depthMm,
        productId: variant.id,
        catalogVersion: airTerminalCatalog.version,
        use,
        requiredAirflowM3h:
          solution.requiredAirflowPerPointM3h / solution.quantityPerPoint,
        availableAirflowM3h:
          solution.availableAirflowPerPointM3h / solution.quantityPerPoint,
        noiseDbA: op.noiseDbA,
        noiseUpperBoundDbA: op.noiseUpperBoundDbA,
        noiseLabel: op.noiseLabel,
        theoreticalLengthM: solution.theoreticalLengthM,
        family: familyCode,
        systemId,
        mounting,
        shape:
          family.shape ?? (variant.nominalDiameterMm ? "circle" : "rectangle"),
        elevationM:
          mounting === "ceiling"
            ? ceilingHeightAt(project, room, candidate.position)
            : wallElevationM,
        operatingPointIndex: opIndex,
        pressureDropPa: op.pressureDropPa,
        throwM: op.throwM,
        openingMm: op.openingMm ?? null,
        pointIndex,
        unitIndex,
        legacyUnverified: false,
        locked: false,
        decisionOrigin: "calculated",
        style:
          family.familyCode === "EGA6" ? "Chiusura PUSH (a richiesta)" : "",
        color: family.familyCode === "EDLS" ? "RAL9016" : "",
        ...(family.familyCode === "EDLS"
          ? {
              commercialOptions: {
                fixingBridges: true,
                continuityKit: true,
                profileCode: preferredEdlsProfile(
                  variant.slotWidthMm,
                  "RAL9016",
                  use,
                ),
                colorCode: "RAL9016",
              },
            }
          : {}),
        finish: "",
        productCode: "",
        plenumId: null,
        ...(dimensions ? { manualDimensions: true } : {}),
      });
    }
  const installationId = project.hvacSystems.find(
    (system) => system.id === systemId,
  )?.installationId;
  return {
    ...project,
    airTerminals: [...existing, ...added],
    rooms: project.rooms.map((r) =>
      r.id === roomId && mode === "replace" && !installationId
        ? {
            ...r,
            [use === "supply" ? "supplyPoints" : "returnPoints"]:
              solution.numberOfPoints,
          }
        : r,
    ),
    installations: project.installations.map((item) =>
      item.id === installationId && mode === "replace"
        ? {
            ...item,
            roomAirPoints: {
              ...item.roomAirPoints,
              [roomId]: {
                supply:
                  item.roomAirPoints?.[roomId]?.supply ?? room.supplyPoints,
                return:
                  item.roomAirPoints?.[roomId]?.return ?? room.returnPoints,
                [use]: solution.numberOfPoints,
              },
            },
          }
        : item,
    ),
    catalogVersions: {
      ...project.catalogVersions,
      Ecoclima: airTerminalCatalog.version,
    },
  };
}
