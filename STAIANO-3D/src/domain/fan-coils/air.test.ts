import { describe, expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import { projectSchema, type Project } from "@/schemas/project";
import { applyFanCoil } from "@/domain/fan-coils/apply";
import { ensureInstallations } from "@/domain/installations";
import {
  ensureFanCoilAirSystem,
  fanCoilAirSystem,
  removeFanCoilAirSystem,
  setFanCoilAirDischarge,
  syncFanCoilAirSystems,
} from "./air";
import { connectFanCoilAirOnPlan } from "./connect";
import { refreshDuctedBindings } from "@/domain/ducted/refresh";
import {
  configurationBlock,
  connectHydronicOnPlan,
  hydronicRoomIds,
  hydronicTargets,
  pendingConnections,
} from "@/domain/ducted/plan-connections";
import { connectionSelection } from "@/configurator/viewer3d/connection-selection";
import { addOperatorTerminal } from "@/domain/air-terminals/operator";
import { guidedTerminalPoint } from "../../../tests/guided-fixture";
import { calculateSupplyPlenum } from "@/domain/ducted/plenum";
import { connectPlenum, insertPlenum } from "@/domain/ducted/attached-plenums";

function fixture(): Project {
  let project = createProject("FCZ PO canalizzata");
  project = addRectangle(project, project.floors[0].id, {
    width: 8,
    length: 6,
    height: 2.7,
    name: "Salone",
  });
  project = addRectangle(project, project.floors[0].id, {
    width: 5,
    length: 4,
    height: 2.7,
    name: "Camera",
    origin: { x: 10, y: 0 },
  });
  project.rooms[0].ceilingHeightM = 2.2;
  project = applyFanCoil(project, project.rooms[0].id, "aermec-fcz200po", {
    mounting: "ceiling",
  });
  return ensureInstallations(project);
}

function vent(project: Project, roomId: string): Project {
  return addOperatorTerminal(project, {
    ...guidedTerminalPoint(),
    roomId,
    systemId: null,
    use: "supply",
    mounting: "ceiling",
    lengthMm: 1000,
  });
}

function addSupplyPlenum(project: Project, terminalId: string): Project {
  const terminal = project.airTerminals.find((item) => item.id === terminalId)!;
  const inserted = insertPlenum(project, terminal.roomId, terminal.position);
  return connectPlenum(inserted, inserted.plenums.at(-1)!.id, terminalId);
}

describe("ventilconvettore canalizzabile", () => {
  it("collega il plenum anche se la scheda non pubblica la portata alla massima velocità (FCZ xx1P)", () => {
    let project = fixture();
    project = {
      ...project,
      fanCoils: [],
      installations: [],
      hvacSystems: [],
    };
    project = applyFanCoil(project, project.rooms[0].id, "aermec-fcz201p", {
      mounting: "ceiling",
    });
    const unit = project.fanCoils![0];
    const free = insertPlenum(project, unit.roomId, unit.position);
    const connected = connectPlenum(free, free.plenums.at(-1)!.id, unit.id);
    expect(fanCoilAirSystem(connected, unit.id)?.airflowM3h).toBe(220);
    // La plenum aderisce alla macchina: distanza centro-centro pari alle mezze profondità.
    const plenum = connected.plenums.at(-1)!;
    const mirror = fanCoilAirSystem(connected, unit.id)!.indoorUnits[0];
    expect(
      Math.hypot(plenum.position.x - mirror.position.x, plenum.position.y - mirror.position.y),
    ).toBeCloseTo((mirror.depthMm + plenum.depthMm) / 2000);
  });
  it("collega un plenum al ventilconvettore prima di creare la distribuzione aria", () => {
    const project = fixture();
    const unit = project.fanCoils![0];
    const free = insertPlenum(project, unit.roomId, unit.position);
    const plenum = free.plenums.at(-1)!;
    expect(connectionSelection(free, plenum.id, unit.id)?.plenumId).toBe(plenum.id);
    const connected = connectPlenum(free, plenum.id, unit.id);
    const system = fanCoilAirSystem(connected, unit.id)!;
    expect(connected.plenums.at(-1)?.attachmentId).toBe(system.indoorUnits[0].id);
    expect(projectSchema.safeParse(connected).success).toBe(true);
  });
  it("crea la distribuzione aeraulica dal punto di funzionamento del catalogo", () => {
    const project = fixture();
    const unit = project.fanCoils![0];
    const { project: created, systemId } = ensureFanCoilAirSystem(
      project,
      unit.id,
    );
    const system = created.hvacSystems.find((item) => item.id === systemId)!;
    expect(system.type).toBe("ducted");
    expect(system.fanCoilId).toBe(unit.id);
    expect(system.dataOrigin).toBe("fanCoil");
    expect(system.manufacturer).toBe("Aermec");
    expect(system.airflowM3h).toBe(254);
    expect(system.capacityW).toBe(1440);
    expect(system.indoorUnits[0].position).toEqual(unit.position);
    expect(system.indoorUnits[0].id).not.toBe(unit.id);
    expect(projectSchema.safeParse(created).success).toBe(true);
    expect(
      created.installations.find((i) => i.id === system.installationId)?.type,
    ).toBe("ducted");
  });

  it("collega la bocchetta al ventilconvettore e la pompa alla stessa unità", () => {
    let project = fixture();
    const unit = project.fanCoils![0];
    const room = project.rooms[1];
    project = vent(project, room.id);
    const terminal = project.airTerminals.at(-1)!;
    expect(connectionSelection(project, unit.id, terminal.id)).toMatchObject({
      fanCoilId: unit.id,
      terminalId: terminal.id,
    });
    expect(() =>
      connectFanCoilAirOnPlan(project, terminal.id, unit.id),
    ).toThrow(/plenum di mandata/);
    project = addSupplyPlenum(project, terminal.id);
    project = connectFanCoilAirOnPlan(project, terminal.id, unit.id);
    const system = fanCoilAirSystem(project, unit.id)!;
    const connected = project.airTerminals.find((t) => t.id === terminal.id)!;
    expect(connected.systemId).toBe(system.id);
    expect(connected.installationId).toBe(system.installationId);
    expect(project.ductedDrafts).toHaveLength(0);
    const pump = {
      id: crypto.randomUUID(),
      floorId: unit.floorId,
      position: { x: -2, y: 3 },
    };
    project.heatPumpDrafts = [pump];
    expect(configurationBlock(project, pump.id)).toMatch(/Collega/);
    project = connectHydronicOnPlan(project, unit.id, pump.id);
    expect(hydronicTargets(project, pump.id).map((t) => t.id)).toEqual([
      unit.id,
    ]);
    expect(hydronicRoomIds(project, pump.id).sort()).toEqual(
      [unit.roomId, room.id].sort(),
    );
    expect(configurationBlock(project, pump.id)).toBeNull();
    expect(
      pendingConnections(project).some((line) =>
        line.id.startsWith(`${pump.id}-`),
      ),
    ).toBe(true);
    expect(projectSchema.safeParse(project).success).toBe(true);
  });

  it("segue velocità e posizione dell'unità senza duplicare l'apparecchio", () => {
    let project = fixture();
    const unit = project.fanCoils![0];
    project = {
      ...project,
      fanCoils: project.fanCoils!.map((item) =>
        item.id === unit.id ? { ...item, operatingPointIndex: 0 } : item,
      ),
    };
    project = ensureFanCoilAirSystem(project, unit.id).project;
    project = {
      ...project,
      fanCoils: project.fanCoils!.map((item) =>
        item.id === unit.id
          ? {
              ...item,
              operatingPointIndex: 0,
              position: { x: 2, y: 2 },
            }
          : item,
      ),
    };
    project = refreshDuctedBindings(project);
    const system = fanCoilAirSystem(project, unit.id)!;
    expect(system.airflowM3h).toBe(254);
    expect(system.capacityW).toBe(1440);
    expect(system.genericMachine?.maxAirflowM3h).toBe(254);
    expect(system.indoorUnits).toHaveLength(1);
    expect(system.indoorUnits[0].position).toEqual({ x: 2, y: 2 });
    expect(project.hvacSystems.filter((s) => s.fanCoilId).length).toBe(1);
    expect(projectSchema.safeParse(project).success).toBe(true);
  });

  it("richiede l'attacco di mandata dichiarato per quotare il plenum", () => {
    let project = fixture();
    const unit = project.fanCoils![0];
    const room = project.rooms[1];
    project = vent(project, room.id);
    project = ensureFanCoilAirSystem(project, unit.id).project;
    project = addSupplyPlenum(project, project.airTerminals.at(-1)!.id);
    project = connectFanCoilAirOnPlan(
      project,
      project.airTerminals.at(-1)!.id,
      unit.id,
    );
    expect(
      calculateSupplyPlenum(project, fanCoilAirSystem(project, unit.id)!.id)
        .machineGeometry?.inlet,
    ).toBeNull();
    project = setFanCoilAirDischarge(project, unit.id, {
      connectionWidthMm: 400,
      connectionHeightMm: 180,
    });
    const system = fanCoilAirSystem(project, unit.id)!;
    expect(calculateSupplyPlenum(project, system.id).machineModel).toBe(
      "FCZ200PO",
    );
    const geometry = calculateSupplyPlenum(
      project,
      fanCoilAirSystem(project, unit.id)!.id,
    ).machineGeometry;
    expect(geometry?.inlet?.connectionWidthMm).toBe(400);
    expect(geometry?.inlet?.connectionHeightMm).toBe(180);
    expect(projectSchema.safeParse(project).success).toBe(true);
  });

  it("rimuove la distribuzione aeraulica lasciando le bocchette in pianta", () => {
    let project = fixture();
    const unit = project.fanCoils![0];
    project = vent(project, project.rooms[1].id);
    project = addSupplyPlenum(project, project.airTerminals.at(-1)!.id);
    project = connectFanCoilAirOnPlan(
      project,
      project.airTerminals.at(-1)!.id,
      unit.id,
    );
    project = removeFanCoilAirSystem(project, unit.id);
    expect(fanCoilAirSystem(project, unit.id)).toBeUndefined();
    const terminal = project.airTerminals.at(-1)!;
    expect(terminal.systemId).toBeNull();
    expect(terminal.plenumId).toBeNull();
    expect(projectSchema.safeParse(project).success).toBe(true);
  });

  it("rimuove la distribuzione quando l'unità non esiste più", () => {
    let project = fixture();
    const unit = project.fanCoils![0];
    project = ensureFanCoilAirSystem(project, unit.id).project;
    project = {
      ...project,
      fanCoils: project.fanCoils!.filter((item) => item.id !== unit.id),
    };
    project = syncFanCoilAirSystems(project);
    expect(project.hvacSystems.some((s) => s.fanCoilId)).toBe(false);
    const parsed = projectSchema.parse(project);
    expect(parsed.fanCoils).toEqual([]);
  });
});
