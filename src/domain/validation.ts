import type { Project } from "@/schemas/project";
import {
  area,
  distance,
  pointInPolygon,
  selfIntersects,
} from "./geometry/primitives";
import { overlappingPolygons } from "./geometry/rooms";
import { roomWallSpan } from "./geometry/placement";
import { radiatorProductAtVersion } from "./catalogs/radiators";
import { elementOutputAtDeltaT, radiatorWidth } from "./radiators/size";
import { airTerminalFamilyAtVersion } from "./catalogs/air-terminals";
import { hvacProductAtVersion } from "./catalogs/hvac";
import { ductedRoomAllocation } from "./ducted/apply";
import { footprintInsideRoom } from "./geometry/footprint";
import {
  legacyTerminalCheck,
  needsTerminalReconfiguration,
} from "./air-terminals/legacy";
import { validateSplitSystem } from "./air-conditioning/validate";
import {
  projectDeviceEnvelopes,
  deviceEnvelopeInsideRoom,
  deviceEnvelopesOverlap,
} from "./geometry/device-envelope";
import { deviceCodes } from "@/services/export/device-codes";
export type Check = {
  code: string;
  status: "valid" | "warning" | "invalid";
  message: string;
  entityId?: string;
};
export function validateProject(p: Project): Check[] {
  const checks: Check[] = [];
  const codes = deviceCodes(p);
  for (const f of p.floors)
    checks.push({
      code: "scale",
      status: f.scaleVerified ? "valid" : "invalid",
      message: `${f.name}: scala ${f.scaleVerified ? "verificata" : "da calibrare"}`,
      entityId: f.id,
    });
  const badWalls = p.walls.filter(
    (w) => distance(w.start, w.end) < 0.05 || w.thickness <= 0,
  );
  checks.push({
    code: "walls",
    status: badWalls.length ? "invalid" : "valid",
    message: badWalls.length
      ? `${badWalls.length} muri non validi`
      : `${p.walls.length} muri validi`,
  });
  const used = new Set(
    p.rooms
      .filter((r) => r.geometryStatus !== "unresolved")
      .flatMap((r) => r.wallIds),
  );
  const open = p.walls.filter((w) => !used.has(w.id));
  if (open.length)
    checks.push({
      code: "closure",
      status: "warning",
      message: `${open.length} muri senza stanza chiusa. Verificare contorni e intersezioni.`,
    });
  if (!p.rooms.length)
    checks.push({
      code: "rooms",
      status: "warning",
      message:
        "Nessuna stanza chiusa. Disegnare un contorno o creare un rettangolo.",
    });
  for (const r of p.rooms) {
    const valid =
      r.geometryStatus !== "unresolved" &&
      r.wallIds.length >= 3 &&
      area(r.polygon) > 0 &&
      !selfIntersects(r.polygon) &&
      r.heightM > 0;
    checks.push({
      code: "geometry",
      status: valid ? "valid" : "invalid",
      message: `${r.name || "Senza nome"}: geometria ${valid ? "valida" : r.geometryStatus === "unresolved" ? "da richiudere; ultimo contorno e apparecchi conservati" : "non valida"}`,
      entityId: r.id,
    });
    checks.push({
      code: "thermal",
      status:
        valid && Math.abs(r.designLoadW - r.netAreaM2 * r.heightM * 35) < 1e-5
          ? "valid"
          : "invalid",
      message: `${r.name}: fabbisogno convenzionale`,
      entityId: r.id,
    });
    if (!r.name.trim())
      checks.push({
        code: "name",
        status: "warning",
        message: "Stanza senza nome",
        entityId: r.id,
      });
    const radiators = p.radiators.filter((d) => d.roomId === r.id);
    const systemKinds = new Set<string>(
      p.hvacSystems.filter((s) => s.roomIds.includes(r.id)).map((s) => s.type),
    );
    if (radiators.length) systemKinds.add("radiator");
    if (
      systemKinds.size > 1 ||
      p.hvacSystems.filter((system) => system.roomIds.includes(r.id)).length > 1
    )
      checks.push({
        code: "multipleSystems",
        status: "warning",
        entityId: r.id,
        message: `${r.name}: più impianti presenti; verificare gli apparecchi da mantenere.`,
      });
    if (r.systemType === "radiator") {
      const outputW = radiators.reduce((sum, d) => sum + d.outputW, 0);
      checks.push({
        code: "power",
        status: outputW >= r.designLoadW ? "valid" : "invalid",
        message: `${r.name}: radiatori ${Math.round(outputW)} W / richiesti ${Math.round(r.designLoadW)} W`,
        entityId: r.id,
      });
    }
  }
  let overlap = 0;
  for (const opening of p.openings) {
    const wall = p.walls.find((w) => w.id === opening.wallId);
    const height =
      wall?.height ??
      (Math.max(
        0,
        ...p.rooms
          .filter((r) => r.wallIds.includes(opening.wallId))
          .map((r) => r.heightM),
      ) ||
        p.projectSettings.defaultHeightM);
    const valid =
      wall &&
      opening.offsetM + opening.widthM <=
        distance(wall.start, wall.end) + 1e-7 &&
      opening.heightM <= height + 1e-7;
    checks.push({
      code: "openingDimensions",
      status: valid ? "valid" : "invalid",
      entityId: opening.id,
      message: `${opening.type === "door" ? "Porta" : "Finestra"}: apertura ${valid ? "entro lunghezza e altezza della parete" : "fuori dall’ingombro della parete; correggere le quote"}.`,
    });
  }
  for (let i = 0; i < p.rooms.length; i++)
    for (let j = i + 1; j < p.rooms.length; j++)
      if (
        p.rooms[i].floorId === p.rooms[j].floorId &&
        overlappingPolygons(p.rooms[i].polygon, p.rooms[j].polygon)
      )
        overlap++;
  checks.push({
    code: "overlap",
    status: overlap ? "invalid" : "valid",
    message: overlap
      ? `${overlap} sovrapposizioni tra stanze`
      : "Nessuna sovrapposizione tra stanze",
  });
  for (const d of [
    ...p.radiators,
    ...p.airTerminals,
    ...p.hvacSystems.flatMap((s) => s.indoorUnits),
  ]) {
    const room = p.rooms.find((r) => r.id === d.roomId);
    checks.push({
      code: "placement",
      status:
        room && pointInPolygon(d.position, room.polygon) ? "valid" : "invalid",
      message: `${d.productId}: posizione in stanza`,
      entityId: d.id,
    });
    const wall = p.walls.find((w) => w.id === d.wallId);
    if (wall)
      checks.push({
        code: "dimensions",
        status:
          room && d.widthMm / 1000 <= (roomWallSpan(room, wall)?.lengthM ?? 0)
            ? "valid"
            : "invalid",
        message: `${d.productId}: ingombro su parete`,
        entityId: d.id,
      });
  }
  const envelopes = projectDeviceEnvelopes(p);
  for (const envelope of envelopes) {
    const room = p.rooms.find((r) => r.id === envelope.roomId);
    const ceiling = p.airTerminals.some(
      (t) => t.id === envelope.deviceId && t.mounting === "ceiling",
    );
    checks.push({
      code: "deviceEnvelope",
      status:
        room && deviceEnvelopeInsideRoom(envelope, room, ceiling)
          ? "valid"
          : "invalid",
      entityId: envelope.deviceId,
      message: `${codes.get(envelope.deviceId)}: ingombro completo entro la stanza e quota di installazione`,
    });
  }
  const collisions = new Map<string, { count: number; peers: string[] }>();
  for (let i = 0; i < envelopes.length; i++)
    for (let j = i + 1; j < envelopes.length; j++) {
      if (!deviceEnvelopesOverlap(envelopes[i], envelopes[j])) continue;
      for (const [current, other] of [
        [envelopes[i], envelopes[j]],
        [envelopes[j], envelopes[i]],
      ]) {
        const hit = collisions.get(current.deviceId) ?? { count: 0, peers: [] };
        hit.count++;
        if (hit.peers.length < 3) hit.peers.push(codes.get(other.deviceId)!);
        collisions.set(current.deviceId, hit);
      }
    }
  for (const [id, hit] of collisions)
    checks.push({
      code: "deviceCollision",
      status: "invalid",
      entityId: id,
      message: `${codes.get(id)}: ${hit.count} sovrapposizioni fisiche con ${hit.peers.join(", ")}${hit.count > hit.peers.length ? ` e altri ${hit.count - hit.peers.length} apparecchi` : ""}.`,
    });
  for (const system of p.hvacSystems.filter((s) => s.type === "split"))
    checks.push(...validateSplitSystem(p, system));
  for (const system of p.hvacSystems.filter((s) => s.type === "ducted")) {
    const product = hvacProductAtVersion(
        system.productId,
        system.catalogVersion,
      ),
      load = p.rooms
        .filter((r) => system.roomIds.includes(r.id))
        .reduce((n, r) => n + r.designLoadW, 0);
    checks.push({
      code: "machineCatalog",
      status: product?.pairingVerified ? "valid" : "invalid",
      message: `${product?.indoorModel ?? system.productId}: abbinamento da catalogo`,
      entityId: system.id,
    });
    checks.push({
      code: "machinePower",
      status:
        product &&
        product.coolingCapacityW >= load &&
        (product.heatingCapacityW ?? 0) >= load
          ? "valid"
          : "invalid",
      message: `${product?.indoorModel ?? system.productId}: capacità per carico ${Math.round(load)}W`,
      entityId: system.id,
    });
    checks.push({
      code: "machineAirflow",
      status: product?.airflowOptions.some(
        (f) => f.airflowM3h === system.airflowM3h,
      )
        ? "valid"
        : "invalid",
      message: `${system.productId}: portata da produttore`,
      entityId: system.id,
    });
    for (const roomId of system.roomIds) {
      const allocation = ductedRoomAllocation(p, roomId);
      if (!allocation) continue;
      for (const use of ["supply", "return"] as const) {
        const terms = p.airTerminals.filter(
            (t) =>
              t.roomId === roomId &&
              t.systemId === system.id &&
              t.use === use &&
              !needsTerminalReconfiguration(t),
          ),
          available = terms.reduce((n, t) => n + t.availableAirflowM3h, 0),
          required = terms.reduce((n, t) => n + t.requiredAirflowM3h, 0);
        checks.push({
          code: `${use}Airflow`,
          status:
            terms.length &&
            available >= allocation.airflowM3h &&
            Math.abs(required - allocation.airflowM3h) < 1e-6
              ? "valid"
              : "invalid",
          message: `${p.rooms.find((r) => r.id === roomId)?.name}: ${use === "supply" ? "mandata" : "ripresa"} ${Math.round(available)}m³/h / ${Math.round(allocation.airflowM3h)}m³/h`,
          entityId: roomId,
        });
      }
    }
  }
  for (const r of p.radiators) {
    const product = radiatorProductAtVersion(r.productId, r.catalogVersion);
    let expected: number | null = null;
    if (product)
      try {
        expected = elementOutputAtDeltaT(product, r.deltaTK) * r.elements;
      } catch {
        /* Unavailable data stays unverified. */
      }
    checks.push({
      code: "catalog",
      status:
        product && product.commercialElementCounts.includes(r.elements)
          ? "valid"
          : "invalid",
      message: `${r.productId}: configurazione a catalogo`,
      entityId: r.id,
    });
    checks.push({
      code: "output",
      status:
        expected !== null && Math.abs(expected - r.outputW) < 1e-5
          ? "valid"
          : "invalid",
      message: `${r.productId}: resa da formula produttore`,
      entityId: r.id,
    });
    checks.push({
      code: "deltaT",
      status:
        r.deltaTK === p.projectSettings.radiatorDeltaTK ? "valid" : "invalid",
      message: `${r.productId}: ΔT progetto ${p.projectSettings.radiatorDeltaTK} K`,
      entityId: r.id,
    });
    checks.push({
      code: "productDimensions",
      status:
        product &&
        Math.abs(r.widthMm - radiatorWidth(product, r.elements)) < 1e-5 &&
        r.heightMm === product.heightMm &&
        r.depthMm === product.depthMm
          ? "valid"
          : "invalid",
      message: `${r.productId}: dimensioni originali`,
      entityId: r.id,
    });
  }
  for (const t of p.airTerminals) {
    const legacyCheck = legacyTerminalCheck(t);
    if (legacyCheck) {
      checks.push(legacyCheck);
      continue;
    }
    const family = airTerminalFamilyAtVersion(t.family, t.catalogVersion),
      variant = family?.variants.find((v) => v.id === t.productId),
      op =
        t.operatingPointIndex === null
          ? undefined
          : variant?.operatingPoints[t.operatingPointIndex],
      noise = t.noiseDbA ?? t.noiseUpperBoundDbA;
    checks.push({
      code: "noise",
      status: noise === null ? "warning" : noise <= 37 ? "valid" : "invalid",
      message: `${t.productId}: ${noise === null ? "rumore non disponibile" : `${t.noiseLabel} dB(A)`}`,
      entityId: t.id,
    });
    checks.push({
      code: "terminalCatalog",
      status:
        op &&
        op.quality === "valid" &&
        op.noiseDbA === t.noiseDbA &&
        op.noiseUpperBoundDbA === t.noiseUpperBoundDbA &&
        op.pressureDropPa === t.pressureDropPa
          ? "valid"
          : "invalid",
      message: `${t.productId}: dati originali del punto selezionato`,
      entityId: t.id,
    });
    const expected = op
      ? family?.isLinearPerMeter
        ? ((op.airflowPerMeterM3h ?? 0) * t.widthMm) / 1000
        : op.airflowM3h
      : null;
    checks.push({
      code: "terminalCapacity",
      status:
        expected !== null &&
        Math.abs(expected - t.availableAirflowM3h) < 1e-5 &&
        t.availableAirflowM3h >= t.requiredAirflowM3h
          ? "valid"
          : "invalid",
      message: `${t.productId}: portata sufficiente e verificata`,
      entityId: t.id,
    });
    const room = p.rooms.find((r) => r.id === t.roomId);
    if (t.mounting === "ceiling" && room)
      checks.push({
        code: "terminalFootprint",
        status: footprintInsideRoom(
          room,
          t.position,
          t.widthMm / 1000,
          t.heightMm / 1000,
          t.rotation,
        )
          ? "valid"
          : "invalid",
        message: `${t.productId}: ingombro entro il contorno stanza`,
        entityId: t.id,
      });
    if (t.depthMm === null)
      checks.push({
        code: "terminalDepth",
        status: "warning",
        message: `${t.productId}: ingombro assiale completo non disponibile`,
        entityId: t.id,
      });
    if (
      op?.referenceLengthM &&
      Math.abs(t.widthMm / 1000 - op.referenceLengthM) > 1e-7
    )
      checks.push({
        code: "acousticReference",
        status: "warning",
        message: `${t.productId}: rumore riferito a ${op.referenceLengthM}m; linea reale ${t.widthMm / 1000}m da verificare`,
        entityId: t.id,
      });
  }
  return checks;
}
