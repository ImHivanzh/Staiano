import type { Project, Selection } from "@/schemas/project";
import {
  area,
  distance,
  pointInPolygon,
  selfIntersects,
  projection,
} from "./geometry/primitives";
import { overlappingPolygons } from "./geometry/rooms";
import { roomWallSpan } from "./geometry/placement";
import { radiatorProductAtVersion } from "./catalogs/radiators";
import { elementOutputAtDeltaT, radiatorWidth } from "./radiators/size";
import { airTerminalFamilyAtVersion } from "./catalogs/air-terminals";
import { hvacProductAtVersion } from "./catalogs/hvac";
import { maximumAirflowOption } from "./catalogs/hvac-airflow";
import { ductedRoomAllocation } from "./ducted/apply";
import { ductedMaximumAirflow } from "./ducted/machine";
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
import { systemLinearBalances } from "./air-terminals/linear-meters";
import { calculateSupplyPlenum } from "./ducted/plenum";
import { placedPlenumGeometry } from "./ducted/placement";
import { pillarFootprint } from "./geometry/pillars";
import {
  convexFootprintsOverlap,
  footprintCorners,
} from "./geometry/footprint";
import { ductRoute } from "./ducted/routes";
import { validateHydronicSystem } from "./hydronic/validation";
import {
  fanCoilProductAtVersion,
  fanCoilControlAtVersion,
  controllerBoardFor,
} from "./catalogs/fan-coils";
export type Check = {
  code: string;
  status: "valid" | "warning" | "invalid";
  message: string;
  entityId?: string;
};
export type CheckFilterStatus = "problems" | "invalid" | "warning" | "all";

export function filterProjectChecks(
  project: Project,
  checks: Check[],
  filter: { status: CheckFilterStatus; floorId: string; roomId: string },
): Check[] {
  const generalCodes = ["walls", "closure", "rooms", "overlap"];
  const rank = { invalid: 0, warning: 1, valid: 2 };
  return checks
    .filter((check) => {
      if (filter.status === "problems" && check.status === "valid")
        return false;
      if (
        !["all", "problems"].includes(filter.status) &&
        check.status !== filter.status
      )
        return false;
      if (
        (!filter.floorId && !filter.roomId) ||
        generalCodes.includes(check.code)
      )
        return true;
      const target = resolveCheckTarget(project, check.entityId);
      if (!target) return true;
      const duct = project.ducts?.find((item) => item.id === check.entityId);
      const system =
        project.hvacSystems.find(
          (item) => item.id === check.entityId || item.id === duct?.systemId,
        ) ??
        project.hydronicSystems?.find(
          (item) =>
            item.id === check.entityId ||
            item.outdoorUnit.id === check.entityId,
        );
      const device = [
        ...project.radiators,
        ...project.airTerminals,
        ...(project.fanCoils ?? []),
        ...project.plenums,
        ...(project.pillars ?? []),
        ...project.hvacSystems.flatMap((item) => item.indoorUnits),
      ].find((item) => item.id === target.selection?.id);
      const relatedRooms = project.rooms.filter((room) =>
        system
          ? system.roomIds.includes(room.id)
          : target.selection?.kind === "room"
            ? room.id === target.selection.id
            : target.selection?.kind === "wall"
              ? room.wallIds.includes(target.selection.id)
              : device && "roomId" in device && device.roomId
                ? device.roomId === room.id
                : room.floorId === target.floorId,
      );
      if (
        filter.floorId &&
        target.floorId !== filter.floorId &&
        !relatedRooms.some((room) => room.floorId === filter.floorId)
      )
        return false;
      return (
        !filter.roomId || relatedRooms.some((room) => room.id === filter.roomId)
      );
    })
    .toSorted((a, b) => rank[a.status] - rank[b.status]);
}
export function validateProject(p: Project): Check[] {
  const checks: Check[] = [];
  const codes = deviceCodes(p);
  for (const draft of p.equipmentDrafts ?? [])
    checks.push({
      code: "equipment-incomplete",
      status: "warning",
      entityId: draft.roomId,
      message: `${draft.type === "radiator" ? "Radiatore" : draft.type === "fanCoil" ? "Ventilconvettore" : "Split"} da configurare: escluso da calcoli e computi.`,
    });
  for (const draft of p.heatPumpDrafts ?? [])
    checks.push({
      code: "heat-pump-incomplete",
      status: "warning",
      entityId: draft.id,
      message: "Pompa di calore da configurare: esclusa da calcoli e computi.",
    });
  for (const draft of p.ductedDrafts ?? [])
    checks.push({
      code: "ducted-incomplete",
      status: "warning",
      entityId: draft.roomId,
      message: `${draft.kind === "machine" ? "Macchina canalizzata" : "Bocchetta"} da configurare: esclusa da calcoli e computi.`,
    });
  for (const system of p.hydronicSystems ?? []) {
    const result = validateHydronicSystem(p, system);
    checks.push({
      code: "hydronicCapacity",
      status: result.capacityCovered ? "valid" : "warning",
      entityId: system.outdoorUnit.id,
      message: `${codes.get(system.id)}: pompa caldo ${Math.round(result.heatingW)} W / freddo ${Math.round(result.coolingW)} W; fabbisogno ${Math.round(result.designLoadW)} W alle condizioni selezionate.`,
    });
    checks.push(
      ...result.warnings.map((message) => ({
        code: "hydronicCheck",
        status: "warning" as const,
        entityId: system.outdoorUnit.id,
        message: `${codes.get(system.id)}: ${message}`,
      })),
    );
  }
  for (const unit of p.fanCoils ?? []) {
    const product = fanCoilProductAtVersion(
      unit.productId,
      unit.catalogVersion,
    );
    const point = product?.operatingPoints[unit.operatingPointIndex];
    checks.push({
      code: "fanCoilCatalog",
      status: point ? "valid" : "warning",
      entityId: unit.id,
      message: `${codes.get(unit.id)}: ${product?.manufacturer ?? ""} ${product?.model ?? unit.productId}, punto ${point?.label ?? "da verificare"}.`,
    });
    if (!point || point.noiseDbA === null || point.noiseDbA > 37)
      checks.push({
        code: "fanCoilNoise",
        status: "warning",
        entityId: unit.id,
        message: `${codes.get(unit.id)}: ${point?.noiseDbA == null ? "rumore non disponibile" : `rumore ${point.noiseDbA} dB(A), oltre il limite 37`}.`,
      });
    if (unit.controllerId) {
      const control = fanCoilControlAtVersion(
        unit.controllerId,
        unit.catalogVersion,
      );
      if (
        !control ||
        !product ||
        controllerBoardFor(product, control) !== unit.controllerBoard
      )
        checks.push({
          code: "fanCoilControl",
          status: "warning",
          entityId: unit.id,
          message: `${codes.get(unit.id)}: comando e scheda non abbinabili secondo la fonte originale.`,
        });
    }
  }
  for (const f of p.floors)
    checks.push({
      code: "scale",
      status: f.scaleVerified ? "valid" : "invalid",
      message: `${f.name}: scala ${f.scaleVerified ? "verificata" : "da calibrare"}`,
      entityId: f.id,
    });
  for (const f of p.floors) {
    if (f.importAnalysis?.candidates?.some((c) => c.status === "pending"))
      checks.push({
        code: "recognitionPending",
        status: "warning",
        entityId: f.id,
        message: `${f.name}: elementi geometrici ancora da confermare.`,
      });
    if (f.configurationWizard && f.configurationWizard.status !== "complete")
      checks.push({
        code: "wizardPending",
        status: "warning",
        entityId: f.id,
        message: `${f.name}: verifica guidata non completata; editor e salvataggio restano disponibili.`,
      });
  }
  const badWalls = p.walls.filter(
    (w) => distance(w.start, w.end) < 0.05 || w.thickness <= 0,
  );
  checks.push({
    code: "walls",
    status: badWalls.length ? "invalid" : "valid",
    entityId: badWalls[0]?.id,
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
      entityId: open[0].id,
      message: `${open.length} muri senza stanza chiusa. Verificare contorni e intersezioni.`,
    });
  if (!p.rooms.length)
    checks.push({
      code: "rooms",
      status: "warning",
      entityId: p.floors[0]?.id,
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
        valid &&
        Math.abs(
          r.designLoadW -
            (r.conditioningExclusion ? 0 : r.netAreaM2 * r.heightM * 35),
        ) < 1e-5
          ? "valid"
          : "invalid",
      message: `${r.name}: ${r.conditioningExclusion ? "ambiente non climatizzato: " + r.conditioningExclusion.reason : "fabbisogno convenzionale"}`,
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
    const configured =
      r.systemType === "radiator"
        ? radiators.length > 0
        : r.systemType === "fanCoil"
          ? !!p.fanCoils?.some((unit) => unit.roomId === r.id)
          : p.hvacSystems.some(
              (system) =>
                system.type === r.systemType &&
                system.roomIds.includes(r.id) &&
                system.indoorUnits.some(
                  (unit) => system.type === "ducted" || unit.roomId === r.id,
                ),
            );
    checks.push({
      code: "systemConfiguration",
      status: configured || r.conditioningExclusion ? "valid" : "warning",
      entityId: r.id,
      message: `${r.name || "Senza nome"}: ${r.conditioningExclusion ? "escluso dalla climatizzazione — " + r.conditioningExclusion.reason : configured ? "impianto configurato; verificare potenze e posa nei controlli dedicati" : "impianto da completare: scegliere e inserire gli apparecchi"}.`,
    });
    if (
      r.conditioningExclusion &&
      (radiators.length ||
        p.airTerminals.some((unit) => unit.roomId === r.id) ||
        p.fanCoils?.some((unit) => unit.roomId === r.id) ||
        p.hvacSystems.some((system) => system.roomIds.includes(r.id)) ||
        p.hydronicSystems?.some((system) => system.roomIds.includes(r.id)))
    )
      checks.push({
        code: "excludedRoomEquipment",
        status: "warning",
        entityId: r.id,
        message: `${r.name}: ambiente non climatizzato con apparecchi o impianti ancora associati; verificare e scollegare quelli non previsti. I dati sono conservati.`,
      });
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
        status: "valid",
        entityId: r.id,
        message: `${r.name}: impianti distinti presenti nella vista complessiva.`,
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
      opening.heightM +
        (opening.type === "window" ? (opening.sillHeightM ?? 0) : 0) <=
        height + 1e-7;
    checks.push({
      code: "openingDimensions",
      status: valid ? "valid" : "invalid",
      entityId: opening.id,
      message: `${opening.type === "door" ? "Porta" : "Finestra"}: apertura ${valid ? "entro lunghezza e altezza della parete" : "fuori dall’ingombro della parete; correggere le quote"}.`,
    });
    if (opening.type === "window" && opening.sillHeightM === null)
      checks.push({
        code: "openingElevation",
        status: "warning",
        entityId: opening.id,
        message:
          "Finestra: quota davanzale da verificare; il 3D non inventa l’altezza della posa.",
      });
  }
  let overlapRoomId: string | undefined;
  for (let i = 0; i < p.rooms.length; i++)
    for (let j = i + 1; j < p.rooms.length; j++)
      if (
        p.rooms[i].floorId === p.rooms[j].floorId &&
        overlappingPolygons(p.rooms[i].polygon, p.rooms[j].polygon)
      ) {
        overlap++;
        overlapRoomId ??= p.rooms[i].id;
      }
  checks.push({
    code: "overlap",
    status: overlap ? "invalid" : "valid",
    entityId: overlapRoomId,
    message: overlap
      ? `${overlap} sovrapposizioni tra stanze`
      : "Nessuna sovrapposizione tra stanze",
  });
  for (const d of [
    ...p.radiators,
    ...(p.fanCoils ?? []),
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
    const ceiling =
      p.airTerminals.some(
        (t) => t.id === envelope.deviceId && t.mounting === "ceiling",
      ) ||
      !!p.fanCoils?.some(
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
    for (const balance of systemLinearBalances(p, system.id))
      checks.push({
        code: "linearMeters",
        status: balance.status === "deficit" ? "warning" : "valid",
        entityId: system.id,
        message: `${system.name || codes.get(system.id)} ${balance.use === "supply" ? "mandata" : "ripresa"}: richiesti ${balance.requiredM.toFixed(2)} m, installati ${balance.installedM.toFixed(2)} m, margine ${balance.marginM >= 0 ? "+" : ""}${balance.marginM.toFixed(2)} m.${
          balance.use === "supply" &&
          balance.rooms.some((room) => room.status === "deficit")
            ? ` Mandata da completare in: ${balance.rooms
                .filter((room) => room.status === "deficit")
                .map((room) => room.roomName)
                .join(", ")}.`
            : ""
        }${balance.mixedModels ? ` Modelli misti: capacità ${balance.availableAirflowM3h.toFixed(1)} / ${balance.airflowM3h.toFixed(1)} m³/h; metri riferiti a ${balance.familyCode}.` : ""}`,
      });
    const product = hvacProductAtVersion(
        system.productId,
        system.catalogVersion,
      ),
      load = p.rooms
        .filter((r) => system.roomIds.includes(r.id))
        .reduce((n, r) => n + r.designLoadW, 0);
    if (system.genericMachine) {
      const manual = system.genericMachine;
      checks.push({
        code: "machineCatalog",
        status: "warning",
        entityId: system.id,
        message: `${manual.manufacturer} ${manual.model}: macchina inserita manualmente; dati dichiarati dall’operatore.`,
      });
      checks.push({
        code: "machinePower",
        entityId: system.id,
        status:
          manual.coolingCapacityW === undefined ||
          manual.heatingCapacityW === undefined
            ? "warning"
            : manual.coolingCapacityW >= load && manual.heatingCapacityW >= load
              ? "warning"
              : "invalid",
        message:
          manual.coolingCapacityW === undefined ||
          manual.heatingCapacityW === undefined
            ? "Macchina inserita manualmente; potenza non dichiarata. Verificare copertura del carico termico."
            : `${manual.model}: potenze dichiarate dall’operatore, copertura del carico ${Math.round(load)} W da verificare.`,
      });
      checks.push({
        code: "machineAirflow",
        entityId: system.id,
        status:
          ductedMaximumAirflow(system) === system.airflowM3h
            ? "warning"
            : "invalid",
        message: `${manual.model}: portata massima dichiarata dall’operatore ${manual.maxAirflowM3h} m³/h.`,
      });
    } else {
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
        status:
          maximumAirflowOption(product)?.airflowM3h === system.airflowM3h
            ? "valid"
            : "invalid",
        message: `${system.productId}: portata massima da produttore`,
        entityId: system.id,
      });
    }
    for (const roomId of system.roomIds) {
      const allocation = ductedRoomAllocation(p, roomId, system.installationId);
      if (!allocation) continue;
      for (const use of ["supply"] as const) {
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
    const returnCapacity = p.airTerminals
      .filter(
        (terminal) =>
          terminal.systemId === system.id &&
          terminal.use === "return" &&
          !needsTerminalReconfiguration(terminal),
      )
      .reduce((sum, terminal) => sum + terminal.availableAirflowM3h, 0);
    const machineAirflow = ductedMaximumAirflow(system);
    checks.push({
      code: "returnAirflow",
      status:
        machineAirflow !== null && returnCapacity >= machineAirflow
          ? "valid"
          : "invalid",
      message: `${system.name || codes.get(system.id)}: ripresa totale ${Math.round(returnCapacity)} m³/h / ${machineAirflow === null ? "portata macchina da verificare" : `${Math.round(machineAirflow)} m³/h macchina`}`,
      entityId: system.id,
    });
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
        r.deltaTK ===
        (p.installations.find((item) => item.id === r.installationId)
          ?.radiatorDeltaTK ?? p.projectSettings.radiatorDeltaTK)
          ? "valid"
          : "invalid",
      message: `${r.productId}: ΔT impianto ${p.installations.find((item) => item.id === r.installationId)?.radiatorDeltaTK ?? p.projectSettings.radiatorDeltaTK} K`,
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
    if (t.manualDimensions)
      checks.push({
        code: "terminalManualDimensions",
        status: "warning",
        entityId: t.id,
        message: `${codes.get(t.id)}: ingombro dichiarato dall’operatore; dimensioni frontali non disponibili nella fonte di catalogo.`,
      });
    if (!t.systemId || !t.plenumId)
      checks.push({
        code: "terminalConnection",
        status: "warning",
        entityId: t.id,
        message: `${codes.get(t.id)}: ${!t.systemId ? "macchina" : "plenum"} non collegato.`,
      });
    if (t.mounting === "wall" && t.wallId) {
      const wall = p.walls.find((w) => w.id === t.wallId);
      if (wall) {
        const angle = Math.atan2(
          wall.end.y - wall.start.y,
          wall.end.x - wall.start.x,
        );
        const along =
          (t.position.x - wall.start.x) * Math.cos(angle) +
          (t.position.y - wall.start.y) * Math.sin(angle);
        const half =
          (t.widthMm / 2000) * Math.abs(Math.cos(t.rotation - angle)) +
          ((t.depthMm ?? 0) / 2000) * Math.abs(Math.sin(t.rotation - angle));
        if (along - half < 0 || along + half > distance(wall.start, wall.end))
          checks.push({
            code: "terminalCorner",
            status: "warning",
            entityId: t.id,
            message: `${codes.get(t.id)}: bocchetta oltre un angolo o la parete disponibile.`,
          });
        const perpendicular = distance(
          t.position,
          projection(t.position, wall.start, wall.end),
        );
        if (
          Math.abs(
            perpendicular -
              (wall.thickness / 2 + (t.depthMm ?? 0) / 2000 + 0.02),
          ) > 0.04 ||
          Math.abs(Math.sin(t.rotation - angle)) > 0.02
        )
          checks.push({
            code: "terminalWall",
            status: "warning",
            entityId: t.id,
            message: `${codes.get(t.id)}: posa fuori dalla faccia interna o orientamento non allineato alla parete.`,
          });
        for (const opening of p.openings.filter((o) => o.wallId === wall.id)) {
          if (
            along + half <= opening.offsetM ||
            along - half >= opening.offsetM + opening.widthM
          )
            continue;
          const bottom = opening.type === "door" ? 0 : opening.sillHeightM;
          const low = (t.elevationM ?? 0) - t.heightMm / 2000,
            high = (t.elevationM ?? 0) + t.heightMm / 2000;
          if (
            bottom === null ||
            Math.min(high, bottom + opening.heightM) > Math.max(low, bottom)
          )
            checks.push({
              code: "terminalOpening",
              status: "warning",
              entityId: t.id,
              message: `${codes.get(t.id)}: ${bottom === null ? "possibile " : ""}sovrapposizione con ${opening.type === "door" ? "porta" : "finestra"}${bottom === null ? "; quota davanzale mancante" : ""}.`,
            });
        }
      }
    }
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
      status:
        noise === null
          ? "warning"
          : t.use === "return" || noise <= 37
            ? "valid"
            : "invalid",
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
  for (const plenum of p.plenums) {
    const result = calculateSupplyPlenum(p, plenum.systemId);
    const geometry = placedPlenumGeometry(p, plenum);
    const footprint = footprintCorners(
      plenum.position,
      plenum.widthMm / 1000,
      plenum.depthMm / 1000,
      plenum.rotation,
    );
    const room = p.rooms.find((r) => r.id === plenum.roomId);
    if (
      !room ||
      !footprint.every((point) => pointInPolygon(point, room.polygon)) ||
      (plenum.elevationM ?? 0) - plenum.heightMm / 2000 < 0 ||
      (plenum.elevationM ?? 0) + plenum.heightMm / 2000 > room.heightM
    )
      checks.push({
        code: "plenumEnvelope",
        status: "warning",
        entityId: plenum.id,
        message: `${codes.get(plenum.id)}: ingombro plenum da verificare rispetto alla stanza.`,
      });
    if (
      !geometry?.ports.length ||
      geometry.ports.length !== result.branches.length
    )
      checks.push({
        code: "plenumConnections",
        status: "warning",
        entityId: plenum.id,
        message: `${codes.get(plenum.id)}: ${result.branches.length} attacchi richiesti, ${geometry?.ports.length ?? 0} con geometria verificata.`,
      });
    if (
      geometry?.ports.some(
        (port) =>
          Math.abs(port.centerMm[0]) + port.diameterMm / 2 >
            plenum.widthMm / 2 ||
          Math.abs(port.centerMm[1]) + port.diameterMm / 2 >
            plenum.heightMm / 2,
      ) ||
      plenum.depthMm <
        (result.machineGeometry?.transitionDepthMm ?? 0) +
          (result.machineGeometry?.settings.collarLengthMm ?? 0)
    )
      checks.push({
        code: "plenumDimensions",
        status: "warning",
        entityId: plenum.id,
        message: `${codes.get(plenum.id)}: dimensioni incompatibili con transizione o attacchi del plenum.`,
      });
  }
  for (const pillar of p.pillars ?? []) {
    const footprint = pillarFootprint(pillar);
    if (
      !p.rooms.some(
        (r) =>
          r.floorId === pillar.floorId &&
          footprint.every((point) => pointInPolygon(point, r.polygon)),
      )
    )
      checks.push({
        code: "pillarEnvelope",
        status: "warning",
        entityId: pillar.id,
        message: `${codes.get(pillar.id)}: pilastro esterno alla geometria utile; verificare posizione e misure.`,
      });
    for (const e of envelopes.filter((e) => e.floorId === pillar.floorId))
      if (
        e.minZ < pillar.heightMm / 1000 &&
        convexFootprintsOverlap(footprint, e.cornersXY)
      )
        checks.push({
          code: "pillarCollision",
          status: "warning",
          entityId: e.deviceId,
          message: `${codes.get(e.deviceId)}: interferenza con ${codes.get(pillar.id)}.`,
        });
    if (
      (p.pillars ?? []).some(
        (other) =>
          other.id !== pillar.id &&
          other.floorId === pillar.floorId &&
          convexFootprintsOverlap(footprint, pillarFootprint(other)),
      )
    )
      checks.push({
        code: "pillarOverlap",
        status: "invalid",
        entityId: pillar.id,
        message: `${codes.get(pillar.id)}: pilastri sovrapposti; correggere prima di usare area e calcoli.`,
      });
  }
  for (const duct of p.ducts ?? []) {
    const route = ductRoute(p, duct);
    if (route.length < 2)
      checks.push({
        code: "ductConnection",
        status: "warning",
        entityId: duct.id,
        message: `${codes.get(duct.id)}: attacco o collegamento non disponibile; rigenerare la proposta.`,
      });
    const floorId = p.plenums.find((pl) => pl.id === duct.plenumId)?.floorId;
    if (
      route.some(
        (point) =>
          point.elevationM < 0 ||
          !p.rooms.some(
            (r) =>
              r.floorId === floorId &&
              pointInPolygon(point, r.polygon) &&
              point.elevationM <= r.heightM,
          ),
      )
    )
      checks.push({
        code: "ductEnvelope",
        status: "warning",
        entityId: duct.id,
        message: `${codes.get(duct.id)}: percorso fuori dalla geometria interna o sopra la quota disponibile.`,
      });
  }
  return checks;
}

export function projectProgress(project: Project, checks: Check[]) {
  const geometryCodes = [
    "scale",
    "walls",
    "closure",
    "rooms",
    "geometry",
    "overlap",
    "openingDimensions",
    "openingElevation",
    "recognitionPending",
  ];
  const geometryVerified =
    project.rooms.length > 0 &&
    checks
      .filter((check) => geometryCodes.includes(check.code))
      .every((check) => check.status === "valid");
  const errors = checks.filter((check) => check.status === "invalid").length;
  const warnings = checks.filter((check) => check.status === "warning").length;
  const missingSystems = checks.filter(
    (check) => check.code === "systemConfiguration" && check.status !== "valid",
  ).length;
  return {
    geometryVerified,
    status: errors ? "invalid" : warnings ? "warning" : "valid",
    label: errors
      ? "Errori da correggere"
      : !project.rooms.length
        ? "Ambienti da definire"
        : missingSystems
          ? `Impianti da completare: ${missingSystems}`
          : warnings
            ? "Revisione tecnica richiesta"
            : "Pronto per dossier preliminare",
  };
}

export function resolveCheckTarget(
  project: Project,
  entityId: string | undefined,
): { floorId: string; selection: Selection | null } | null {
  if (!entityId) return null;
  const floor = project.floors.find((item) => item.id === entityId);
  if (floor) return { floorId: floor.id, selection: null };
  const room = project.rooms.find((item) => item.id === entityId);
  if (room)
    return { floorId: room.floorId, selection: { kind: "room", id: room.id } };
  const opening = project.openings.find((item) => item.id === entityId);
  const wall = project.walls.find(
    (item) => item.id === (opening?.wallId ?? entityId),
  );
  if (wall)
    return { floorId: wall.floorId, selection: { kind: "wall", id: wall.id } };
  const duct = project.ducts?.find((item) => item.id === entityId);
  const system = project.hvacSystems.find(
    (item) => item.id === entityId || item.id === duct?.systemId,
  );
  const deviceId =
    (duct && project.plenums.some((plenum) => plenum.id === duct.plenumId)
      ? duct.plenumId
      : system?.indoorUnits[0]?.id) ?? entityId;
  const device = [
    ...project.radiators,
    ...project.airTerminals,
    ...(project.fanCoils ?? []),
    ...project.plenums,
    ...(project.pillars ?? []),
    ...project.hvacSystems.flatMap((item) => item.indoorUnits),
    ...(project.hydronicSystems ?? []).map((item) => item.outdoorUnit),
  ].find((item) => item.id === deviceId);
  if (device)
    return {
      floorId: device.floorId,
      selection: { kind: "device", id: device.id },
    };
  const servedRoom = project.rooms.find((item) =>
    system?.roomIds.includes(item.id),
  );
  if (servedRoom)
    return {
      floorId: servedRoom.floorId,
      selection: { kind: "room", id: servedRoom.id },
    };
  return null;
}
