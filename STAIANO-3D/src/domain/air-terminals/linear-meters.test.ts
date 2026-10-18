import { describe, expect, it } from "vitest";
import {
  threeRoomTerminalFixture,
  guidedTerminalPoint,
} from "../../../tests/guided-fixture";
import { airTerminalCatalog } from "../catalogs/air-terminals";
import { addOperatorTerminal } from "./operator";
import { systemLinearBalances } from "./linear-meters";
import { acceptTerminalProposal } from "./proposal";
import { terminalDistribution } from "./distribution";
import { sizeAirTerminal } from "./size";
import { validateProject } from "../validation";
import type { Project } from "@/schemas/project";

function add(project: Project, roomIndex: number, lengthMm: number) {
  return addOperatorTerminal(project, {
    ...guidedTerminalPoint(),
    roomId: project.rooms[roomIndex].id,
    systemId: project.hvacSystems[0].id,
    use: "supply",
    mounting: "ceiling",
    lengthMm,
  });
}

describe("linear meters in every served room", () => {
  it("splits six meters into 3, 2 and 1, independently of point count", () => {
    const project = threeRoomTerminalFixture();
    const plan = project.hvacSystems[0].linearPlan!;
    expect(plan.requiredSupplyM).toBeCloseTo(6);
    expect(plan.distribution.map((row) => row.suggestedM)).toEqual([3, 2, 1]);
    const family = airTerminalCatalog.families.find(
      (f) => f.familyCode === "EDLS",
    )!;
    const point = guidedTerminalPoint();
    const variant = family.variants.find((v) => v.id === point.variantId)!;
    const choice = sizeAirTerminal(
      plan.airflowM3h,
      1,
      {
        ...family,
        variants: [
          {
            ...variant,
            operatingPoints: [
              variant.operatingPoints[point.operatingPointIndex],
            ],
          },
        ],
      },
      "supply",
    )[0];
    const result = terminalDistribution(
      project,
      project.hvacSystems[0].id,
      family,
      choice,
      "supply",
    )!;
    expect(result.rows.map((row) => row.theoreticalLengthM)).toEqual([3, 2, 1]);
    expect(result.rows.map((row) => row.points)).toEqual([1, 2, 1]);
    expect(
      result.rows.reduce((sum, row) => sum + row.theoreticalLengthM!, 0),
    ).toBeCloseTo(result.theoreticalLengthM!);
  });

  it("six meters in one room do not cover the two empty rooms", () => {
    const project = add(threeRoomTerminalFixture(), 0, 6000);
    const balance = systemLinearBalances(project, project.hvacSystems[0].id)[0];
    expect(balance).toMatchObject({
      installedM: 6,
      marginM: 0,
      status: "deficit",
    });
    expect(balance.rooms.map((room) => room.status)).toEqual([
      "ok",
      "deficit",
      "deficit",
    ]);
    expect(balance.rooms.map((room) => room.terminalCount)).toEqual([1, 0, 0]);
    expect(validateProject(project)).toContainEqual(
      expect.objectContaining({
        code: "linearMeters",
        status: "warning",
        message: expect.stringContaining("Camera, Studio"),
      }),
    );
  });

  it("one vent in each room is insufficient when lengths cover the wrong shares", () => {
    let project = threeRoomTerminalFixture();
    for (const [index, length] of [2000, 2000, 2000].entries())
      project = add(project, index, length);
    expect(
      systemLinearBalances(project, project.hvacSystems[0].id)[0].rooms.map(
        (room) => room.status,
      ),
    ).toEqual(["deficit", "ok", "ok"]);
    project = add(project, 0, 1000);
    expect(
      systemLinearBalances(project, project.hvacSystems[0].id)[0].status,
    ).toBe("ok");
  });

  it("updates room requirements from live loads and machine flow without changing vents", () => {
    let project = threeRoomTerminalFixture();
    for (const [index, length] of [3000, 2000, 1000].entries())
      project = add(project, index, length);
    const terminals = structuredClone(project.airTerminals);
    project.rooms[2].designLoadW = 5000;
    project.hvacSystems[0].genericMachine!.maxAirflowM3h *= 2;
    const balance = systemLinearBalances(project, project.hvacSystems[0].id)[0];
    expect(balance.requiredM).toBeCloseTo(12);
    expect(balance.rooms.map((room) => room.requiredM)).toEqual([3.6, 2.4, 6]);
    expect(project.airTerminals).toEqual(terminals);
  });

  it("accepts a proposal with commercial vents in all three rooms", () => {
    const project = threeRoomTerminalFixture();
    const accepted = acceptTerminalProposal(
      project,
      project.hvacSystems[0].id,
      "ceiling",
      { style: "", color: "", finish: "" },
    );
    expect(
      new Set(accepted.airTerminals.map((terminal) => terminal.roomId)).size,
    ).toBe(3);
    expect(
      systemLinearBalances(accepted, project.hvacSystems[0].id)[0].status,
    ).toBe("ok");
  });

  it("omits excluded rooms and does not crash on unfinished room loads", () => {
    const project = threeRoomTerminalFixture();
    project.rooms[2].conditioningExclusion = {
      reason: "Ripostiglio non climatizzato",
    };
    let balance = systemLinearBalances(project, project.hvacSystems[0].id)[0];
    expect(balance.rooms.map((room) => room.roomName)).toEqual([
      "Soggiorno",
      "Camera",
    ]);
    expect(
      balance.rooms.reduce((sum, room) => sum + room.requiredM, 0),
    ).toBeCloseTo(6);
    project.rooms[0].designLoadW = 0;
    balance = systemLinearBalances(project, project.hvacSystems[0].id)[0];
    expect(balance.rooms).toEqual([]);
    expect(balance.status).toBe("deficit");
  });
});
