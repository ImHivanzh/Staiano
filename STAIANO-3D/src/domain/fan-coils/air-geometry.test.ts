import { expect, it } from "vitest";
import { projectSchema } from "@/schemas/project";
import { useProjectStore } from "../../stores/project-store";
import { createProject, addRectangle } from "../project";
import { applyFanCoil, updateFanCoil } from "./apply";
import {
  ensureFanCoilAirSystem,
  setFanCoilAirDischarge,
  syncFanCoilAirSystems,
} from "./air";
import { addOperatorTerminal } from "../air-terminals/operator";
import { guidedTerminalPoint } from "../../../tests/guided-fixture";
import { connectFanCoilAirOnPlan } from "./connect";
import {
  placeSupplyPlenum,
  machinePlenum,
  addMachinePlenum,
} from "../ducted/placement";
import { connectionSelection } from "../../configurator/viewer3d/connection-selection";
import {
  insertPlenum,
  connectPlenum,
  syncAttachedPlenums,
} from "../ducted/attached-plenums";

it.each(["wall", "ceiling"] as const)(
  "keeps the %s fan-coil air system in the real body axes and elevation",
  (mounting) => {
    const empty = createProject();
    let p = addRectangle(empty, empty.floors[0].id, {
      width: 8,
      length: 6,
      height: 2.7,
      name: "Sala",
    });
    p.rooms[0].ceilingHeightM = 2.2;
    p = applyFanCoil(p, p.rooms[0].id, "aermec-fcz200po", { mounting });
    const unit = p.fanCoils![0];
    // Un corpo ad incasso a soffitto non scende sotto il controsoffitto.
    const shift = mounting === "ceiling" ? 0.1 : -0.1;
    p = updateFanCoil(p, unit.id, {
      elevationM: mounting === "ceiling" ? 2.2 : 1.1,
    });
    const created = ensureFanCoilAirSystem(p, unit.id);
    p = created.project;
    const system = p.hvacSystems.find((s) => s.id === created.systemId)!;
    const expected = {
      widthMm: unit.widthMm,
      heightMm: mounting === "ceiling" ? unit.depthMm : unit.heightMm,
      depthMm: mounting === "ceiling" ? unit.heightMm : unit.depthMm,
    };
    expect(system.genericMachine).toMatchObject(expected);
    expect(system.indoorUnits[0]).toMatchObject(expected);
    p = setFanCoilAirDischarge(p, unit.id, {
      connectionWidthMm: 400,
      connectionHeightMm: 150,
      dimensionBasis: "ductOpening",
    });
    p = addOperatorTerminal(p, {
      ...guidedTerminalPoint(),
      roomId: p.rooms[0].id,
      systemId: null,
      use: "supply",
      mounting: "ceiling",
      lengthMm: 1000,
    });
    expect(() =>
      connectFanCoilAirOnPlan(p, p.airTerminals[0].id, unit.id),
    ).toThrow(/plenum di mandata/);
    const terminal = p.airTerminals[0];
    const inserted = insertPlenum(p, terminal.roomId, terminal.position);
    p = connectPlenum(inserted, inserted.plenums.at(-1)!.id, terminal.id);
    p = connectFanCoilAirOnPlan(p, terminal.id, unit.id);
    expect(projectSchema.safeParse(p).success).toBe(true);
    expect(
      p.plenums.find((plenum) => plenum.attachmentId === terminal.id)?.systemId,
    ).toBe(system.id);
    const viaClick = addMachinePlenum(p, unit.id);
    expect(viaClick.plenums).toHaveLength(2);
    p = viaClick;
    const locked = {
      ...p,
      fanCoils: p.fanCoils!.map((u) => ({ ...u, locked: true })),
    };
    expect(() => addMachinePlenum(locked, unit.id)).toThrow(/Sblocca/);
    const free = insertPlenum(p, unit.roomId, { x: 4, y: 3 });
    const freePlenum = free.plenums.at(-1)!;
    const pair = connectionSelection(free, freePlenum.id, unit.id);
    expect(pair?.plenumId).toBe(freePlenum.id);
    const connected = connectPlenum(free, freePlenum.id, unit.id);
    expect(
      connected.plenums.find((plenum) => plenum.id === freePlenum.id)
        ?.attachmentId,
    ).toBe(system.indoorUnits[0].id);
    expect(() =>
      connectPlenum(
        { ...locked, plenums: free.plenums },
        freePlenum.id,
        unit.id,
      ),
    ).toThrow(/Sblocca/);
    p = placeSupplyPlenum(p, system.id);
    const physical = p.fanCoils![0];
    const body = machinePlenum(p, system.id, "supply")!;
    expect(body).not.toBeNull();
    expect(body.elevationM).toBeCloseTo(
      physical.elevationM +
        (mounting === "ceiling" ? physical.depthMm / 2000 : 0),
    );
    expect(
      Math.hypot(
        body.position.x - physical.position.x,
        body.position.y - physical.position.y,
      ),
    ).toBeCloseTo((expected.depthMm + body.depthMm) / 2000);
    const source = p.plenums.find(
      (plenum) => plenum.attachmentId === undefined && plenum.use === "supply",
    )!;
    const machinePlenumId = source.id;
    const manual = {
      ...p,
      plenums: p.plenums.map((plenum) =>
        plenum.id === machinePlenumId
          ? {
              ...source,
              status: "manual" as const,
              attachmentId: system.indoorUnits[0].id,
              elevationM: body.elevationM! + 0.03,
            }
          : plenum,
      ),
    };
    const changed = syncFanCoilAirSystems(
      updateFanCoil(manual, unit.id, {
        elevationM: physical.elevationM + shift,
      }),
    );
    const followed = syncAttachedPlenums(changed, manual);
    expect(
      followed.plenums.find((plenum) => plenum.id === machinePlenumId)!
        .elevationM,
    ).toBeCloseTo(
      manual.plenums.find((plenum) => plenum.id === machinePlenumId)!
        .elevationM! + shift,
    );
    expect(
      syncAttachedPlenums(followed, manual).plenums.find(
        (plenum) => plenum.id === machinePlenumId,
      )!.elevationM,
    ).toBe(
      followed.plenums.find((plenum) => plenum.id === machinePlenumId)!
        .elevationM,
    );
    const explicit = {
      ...changed,
      plenums: changed.plenums.map((pl) => ({ ...pl, elevationM: 1.8 })),
    };
    expect(
      syncAttachedPlenums(explicit, manual).plenums.find(
        (plenum) => plenum.id === machinePlenumId,
      )!.elevationM,
    ).toBe(1.8);
    useProjectStore.setState({ readOnly: false });
    useProjectStore.getState().load(manual);
    useProjectStore.getState().commit((current) =>
      updateFanCoil(current, unit.id, {
        elevationM: physical.elevationM + shift,
      }),
    );
    expect(useProjectStore.getState().error).toBeNull();
    expect(
      useProjectStore
        .getState()
        .project!.plenums.find((plenum) => plenum.id === machinePlenumId)!
        .elevationM,
    ).toBeCloseTo(
      manual.plenums.find((plenum) => plenum.id === machinePlenumId)!
        .elevationM! + shift,
    );
    useProjectStore.getState().undo();
    expect(
      useProjectStore
        .getState()
        .project!.plenums.find((plenum) => plenum.id === machinePlenumId)!
        .elevationM,
    ).toBe(
      manual.plenums.find((plenum) => plenum.id === machinePlenumId)!
        .elevationM,
    );
    useProjectStore.getState().redo();
    expect(
      useProjectStore
        .getState()
        .project!.plenums.find((plenum) => plenum.id === machinePlenumId)!
        .elevationM,
    ).toBeCloseTo(
      manual.plenums.find((plenum) => plenum.id === machinePlenumId)!
        .elevationM! + shift,
    );
    const moved = updateFanCoil(p, unit.id, {
      elevationM: physical.elevationM + shift,
    });
    const refreshed = syncFanCoilAirSystems(moved);
    expect(
      refreshed.hvacSystems.find((s) => s.id === system.id)!.indoorUnits[0].id,
    ).toBe(system.indoorUnits[0].id);
    expect(
      machinePlenum(refreshed, system.id, "supply")!.elevationM,
    ).toBeCloseTo(body.elevationM! + shift);
  },
);
