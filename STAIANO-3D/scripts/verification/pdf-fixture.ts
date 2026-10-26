import { dossierFixture } from "../../src/services/pdf/fixture";
import { addRectangle } from "../../src/domain/project";
import { applyDuctedSystem } from "../../src/domain/ducted/apply";
import { applyAirTerminalSolution } from "../../src/domain/air-terminals/apply";
import { sizeAirTerminal } from "../../src/domain/air-terminals/size";
import { airTerminalCatalog } from "../../src/domain/catalogs/air-terminals";
import { placeSupplyPlenum } from "../../src/domain/ducted/placement";
import { generateDuctRoutes } from "../../src/domain/ducted/routes";
import {
  fanCoilCatalog,
  compatibleFanCoilControls,
} from "../../src/domain/catalogs/fan-coils";
import { applyFanCoil } from "../../src/domain/fan-coils/apply";
import { heatPumpCatalog } from "../../src/domain/catalogs/heat-pumps";

/** Two independent machines with saved plenums, routes and an original M7 control. */
export function pdfQaFixture() {
  let project = dossierFixture();
  project.name = "Staiano 3D - due macchine, canalizzazione e M7";
  project = addRectangle(project, project.floors[0].id, {
    width: 6,
    length: 5,
    height: 2.9,
    name: "Studio canalizzato",
  });
  const studio = project.rooms.find(
    (room) => room.name === "Studio canalizzato",
  )!;
  project = applyDuctedSystem(project, [studio.id], "Daikin", null);
  const system = project.hvacSystems.find((candidate) =>
    candidate.roomIds.includes(studio.id),
  )!;
  for (const [code, use] of [
    ["EDLS", "supply"],
    ["EGQ", "return"],
  ] as const) {
    const family = airTerminalCatalog.families.find(
      (candidate) => candidate.familyCode === code,
    )!;
    const solution = sizeAirTerminal(system.airflowM3h!, 1, family, use)[0];
    if (!solution) throw new Error(`Missing verified QA solution: ${code}`);
    project = applyAirTerminalSolution(
      project,
      studio.id,
      system.id,
      use,
      code,
      solution,
      "ceiling",
    );
  }
  for (const machine of project.hvacSystems) {
    project = placeSupplyPlenum(project, machine.id);
    project = generateDuctRoutes(project, machine.id);
  }
  project = addRectangle(project, project.floors[0].id, {
    width: 5,
    length: 4,
    height: 2.8,
    name: "Saletta ventilconvettore",
  });
  const room = project.rooms.find(
    (candidate) => candidate.name === "Saletta ventilconvettore",
  )!;
  const product = fanCoilCatalog.products.find(
    (candidate) =>
      candidate.manufacturer === "Innova" &&
      compatibleFanCoilControls(candidate).length > 0,
  )!;
  const control = compatibleFanCoilControls(product)[0];
  if (!product || !control)
    throw new Error("Missing original Innova/M7 catalog pairing");
  project = applyFanCoil(project, room.id, product.id, {
    controllerId: control.id,
  });
  const pump = heatPumpCatalog.products.find(
    (candidate) => candidate.manufacturer === "Chaffoteaux",
  )!;
  if (!pump) throw new Error("Missing catalog-backed hydronic QA pump");
  return {
    ...project,
    hydronicSystems: [
      {
        id: "pdf-qa-hydronic",
        name: "Circuito saletta",
        productId: pump.id,
        catalogVersion: heatPumpCatalog.version,
        operatingPointIndex: 0,
        roomIds: [room.id],
        fanCoilIds: [project.fanCoils![0].id],
        outdoorUnit: {
          id: "pdf-qa-pump-outdoor",
          floorId: room.floorId,
          position: { x: -2, y: -1 },
          rotation: 0,
          widthMm: pump.widthMm,
          heightMm: pump.heightMm,
          depthMm: pump.depthMm,
          elevationM: 0.15,
          locked: false,
        },
        pipeWaypoints: [
          {
            fanCoilId: project.fanCoils![0].id,
            points: [
              { x: -2, y: -1 },
              { x: -2, y: 1 },
            ],
          },
        ],
      },
    ],
    catalogVersions: {
      ...project.catalogVersions,
      HEAT_PUMP: heatPumpCatalog.version,
    },
  };
}
