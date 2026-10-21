import { addRectangle, createProject } from "../src/domain/project";
import { airTerminalCatalog } from "../src/domain/catalogs/air-terminals";
import { applyManualDuctedSystem } from "../src/domain/ducted/apply";
import { refreshDuctedBindings } from "../src/domain/ducted/refresh";
import { addOperatorTerminal } from "../src/domain/air-terminals/operator";
import {
  buildLinearPlan,
  saveLinearPlan,
} from "../src/domain/air-terminals/linear-meters";
import type { Project } from "../src/schemas/project";

/** Real catalogue points; arbitrary manual machine airflow is explicitly declared. */
export function guidedTerminalPoint(familyCode = "EDLS") {
  const family = airTerminalCatalog.families.find(
    (f) => f.familyCode === familyCode,
  )!;
  for (const variant of family.variants) {
    const operatingPointIndex = variant.operatingPoints.findIndex(
      (op) =>
        op.quality === "valid" &&
        (op.noiseDbA ?? op.noiseUpperBoundDbA ?? Infinity) <= 37 &&
        (!op.use || op.use === "supply"),
    );
    if (operatingPointIndex >= 0)
      return {
        familyCode,
        variantId: variant.id,
        operatingPointIndex,
        rate:
          variant.operatingPoints[operatingPointIndex].airflowPerMeterM3h ??
          variant.operatingPoints[operatingPointIndex].airflowM3h,
      };
  }
  throw new Error(`No verified linear operating point: ${familyCode}`);
}

export function guidedProjectFixture(requiredM = 4.2): Project {
  let p = createProject("Staiano — accettazione configurazione guidata");
  p = addRectangle(p, p.floors[0].id, {
    width: 8,
    length: 6,
    height: 2.7,
    name: "Soggiorno",
    origin: { x: 0, y: 0 },
  });
  const point = guidedTerminalPoint();
  p = applyManualDuctedSystem(p, [p.rooms[0].id], {
    manufacturer: "Macchina manuale di verifica",
    model: "Portata dichiarata 4,2 metri",
    maxAirflowM3h: point.rate * requiredM,
    widthMm: 900,
    heightMm: 250,
    depthMm: 700,
    dischargeConnection: {
      connectionWidthMm: 700,
      connectionHeightMm: 200,
      dimensionBasis: "ductOpening",
    },
  });
  const systemId = p.hvacSystems[0].id;
  const plan = buildLinearPlan(
    p,
    systemId,
    { supply: point },
    airTerminalCatalog.version,
  )!;
  p = saveLinearPlan(p, systemId, plan);
  return {
    ...p,
    floors: p.floors.map((f) => ({
      ...f,
      configurationWizard: { step: 0, status: "active", confirmedSteps: [] },
    })),
  };
}

export function addGuidedTerminal(
  p: Project,
  lengthMm: number,
  familyCode = "EDLS",
  mounting: "ceiling" | "wall" = "ceiling",
  systemIndex = 0,
) {
  const system = p.hvacSystems[systemIndex];
  return refreshDuctedBindings(
    addOperatorTerminal(p, {
      ...guidedTerminalPoint(familyCode),
      roomId: system.roomIds[0],
      systemId: system.id,
      use: "supply",
      mounting,
      lengthMm,
      // Nessun plenum implicito: il corpo separato si crea con lo strumento Plenum.
      // Explicit operator measurements, never inferred from nominal diameter.
      ...(familyCode === "EDSC-C"
        ? { manualDimensions: { widthMm: 500, heightMm: 500, depthMm: 200 } }
        : {}),
    }),
  );
}

export function threeRoomTerminalFixture() {
  let project = guidedProjectFixture(6);
  for (const [index, name] of ["Camera", "Studio"].entries()) {
    project = addRectangle(project, project.floors[0].id, {
      width: 5,
      length: 4,
      height: 2.7,
      name,
      origin: { x: 10 + index * 7, y: 0 },
    });
  }
  project.rooms = project.rooms.map((room, index) => ({
    ...room,
    designLoadW: [3000, 2000, 1000][index],
    supplyPoints: index === 1 ? 2 : 1,
  }));
  project = applyManualDuctedSystem(
    project,
    project.rooms.map((room) => room.id),
    project.hvacSystems[0].genericMachine!,
    project.hvacSystems[0].id,
  );
  const plan = buildLinearPlan(
    project,
    project.hvacSystems[0].id,
    { supply: guidedTerminalPoint() },
    airTerminalCatalog.version,
  )!;
  return saveLinearPlan(project, project.hvacSystems[0].id, plan);
}
