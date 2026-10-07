import { describe, expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import { radiatorProducts } from "@/domain/catalogs/radiators";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { sizeRadiators } from "@/domain/radiators/size";
import { applyRadiatorSolution } from "@/domain/radiators/apply";
import { sizeAirTerminal } from "@/domain/air-terminals/size";
import { applyAirTerminalSolution } from "@/domain/air-terminals/apply";
import { pointInPolygon } from "./primitives";
import { positionAlongRoomWall, roomWallSpan } from "./placement";
import {
  deviceEnvelope,
  deviceEnvelopeInsideRoom,
  deviceEnvelopesOverlap,
  projectDeviceEnvelopes,
} from "./device-envelope";

function fixture() {
  let p = createProject();
  p = addRectangle(p, p.floors[0].id, {
    width: 5,
    length: 4,
    height: 2.7,
    name: "Locale",
  });
  const room = p.rooms[0];
  const radiatorSolution = sizeRadiators(
    room.designLoadW,
    radiatorProducts.filter((v) => v.id === "global-vip-600"),
    50,
    { manufacturer: "Global", family: "VIP", numberOfRadiators: 1 },
  )[0];
  p = applyRadiatorSolution(p, room.id, radiatorSolution, null);
  const family = airTerminalCatalog.families.find(
    (f) => f.familyCode === "EDLS",
  )!;
  const terminalSolution = sizeAirTerminal(200, 1, family, "supply")[0];
  return applyAirTerminalSolution(
    p,
    room.id,
    null,
    "supply",
    family.familyCode,
    terminalSolution,
    "ceiling",
  );
}

describe("ingombri dispositivi con quota verticale", () => {
  it("usa le dimensioni fisiche VIP ed EDLS, mantenendo il radiatore sotto la bocchetta", () => {
    const p = fixture(),
      radiator = p.radiators[0],
      terminal = p.airTerminals[0];
    terminal.position = { ...radiator.position };
    terminal.rotation = radiator.rotation;
    const r = deviceEnvelope(p, radiator.id)!,
      t = deviceEnvelope(p, terminal.id)!;
    expect(r.minZ).toBe(0.1);
    expect(r.maxZ).toBeCloseTo(0.79);
    expect(t.minZ).toBe(p.rooms[0].heightM);
    expect(t.maxZ).toBeCloseTo(t.minZ + terminal.depthMm! / 1000);
    expect(deviceEnvelopesOverlap(r, t)).toBe(false);
    terminal.position = { ...p.rooms[0].centroid };
    expect(
      deviceEnvelopeInsideRoom(
        deviceEnvelope(p, terminal.id)!,
        p.rooms[0],
        true,
      ),
    ).toBe(true);
  });
  it("rileva apparecchi realmente sovrapposti sulla stessa parete", () => {
    const p = fixture(),
      radiator = p.radiators[0],
      terminal = p.airTerminals[0];
    terminal.mounting = "wall";
    terminal.position = { ...radiator.position };
    terminal.rotation = radiator.rotation;
    terminal.elevationM = 0.1 + radiator.heightMm / 2000;
    const r = deviceEnvelope(p, radiator.id)!,
      t = deviceEnvelope(p, terminal.id)!;
    expect(t.minZ).toBeCloseTo(terminal.elevationM - terminal.heightMm / 2000);
    expect(deviceEnvelopesOverlap(r, t)).toBe(true);
    expect(deviceEnvelopesOverlap(r, { ...t, floorId: "altro-piano" })).toBe(
      false,
    );
    expect(
      deviceEnvelopesOverlap(r, { ...t, minZ: r.maxZ, maxZ: r.maxZ + 0.1 }),
    ).toBe(false);
  });
  it("il centro interno alla stanza non nasconde larghezza sporgente o altezza eccessiva", () => {
    const p = fixture(),
      radiator = p.radiators[0],
      room = p.rooms[0];
    const minX = Math.min(...room.polygon.map((point) => point.x));
    radiator.position = { x: minX + 0.01, y: room.centroid.y };
    radiator.rotation = 0;
    expect(pointInPolygon(radiator.position, room.polygon)).toBe(true);
    expect(
      deviceEnvelopeInsideRoom(deviceEnvelope(p, radiator.id)!, room),
    ).toBe(false);
    radiator.position = { ...room.centroid };
    radiator.heightMm = room.heightM * 1000;
    expect(
      deviceEnvelopeInsideRoom(deviceEnvelope(p, radiator.id)!, room),
    ).toBe(false);
  });
  it("non inventa un ingombro completo quando quota, posa o profondità sono ignote", () => {
    const p = fixture(),
      terminal = p.airTerminals[0];
    terminal.depthMm = null;
    expect(deviceEnvelope(p, terminal.id)).toBeNull();
    expect(projectDeviceEnvelopes(p)).toHaveLength(1);
    terminal.depthMm = 60;
    terminal.elevationM = null;
    expect(deviceEnvelope(p, terminal.id)).toBeNull();
    terminal.elevationM = 2.7;
    terminal.mounting = "unknown";
    expect(deviceEnvelope(p, terminal.id)).toBeNull();
    terminal.mounting = "ceiling";
    terminal.legacyUnverified = true;
    expect(deviceEnvelope(p, terminal.id)).toBeNull();
  });
  it("split usa la stessa quota del modello 3D, sopra il radiatore", () => {
    const p = fixture(),
      room = p.rooms[0],
      radiator = p.radiators[0];
    const unit = {
      id: "fixture-split",
      roomId: room.id,
      floorId: room.floorId,
      wallId: radiator.wallId,
      position: { ...radiator.position },
      rotation: radiator.rotation,
      widthMm: 900,
      heightMm: 300,
      depthMm: 230,
      productId: "fixture-indoor",
      catalogVersion: "fixture",
      locked: false,
    };
    p.hvacSystems.push({
      id: "fixture-system",
      type: "split",
      manufacturer: "Fixture",
      productId: "fixture-pair",
      roomIds: [room.id],
      capacityW: 2500,
      airflowM3h: null,
      catalogVersion: "fixture",
      indoorUnits: [unit],
      compatibilityStatus: "unverifiable",
      linearPlan: null,
    });
    const s = deviceEnvelope(p, unit.id)!;
    expect(s.minZ).toBeCloseTo(room.heightM - 0.1 - unit.heightMm / 1000);
    expect(s.maxZ).toBeCloseTo(room.heightM - 0.1);
    expect(deviceEnvelopesOverlap(s, deviceEnvelope(p, radiator.id)!)).toBe(
      false,
    );
    expect(deviceEnvelopeInsideRoom(s, room)).toBe(false);
    // Reusing a shallower radiator's center makes this split protrude into the wall.
    const wall = p.walls.find((w) => w.id === unit.wallId)!;
    unit.position = positionAlongRoomWall(
      room,
      wall,
      roomWallSpan(room, wall)!.lengthM / 2,
      unit.depthMm / 1000,
    );
    expect(deviceEnvelopeInsideRoom(deviceEnvelope(p, unit.id)!, room)).toBe(
      true,
    );
  });
});
