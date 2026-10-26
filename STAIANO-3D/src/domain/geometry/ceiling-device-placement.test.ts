import { expect, it } from "vitest";
import { addRectangle, createProject, updateRoom } from "../project";
import { addOperatorTerminal } from "../air-terminals/operator";
import { guidedTerminalPoint } from "../../../tests/guided-fixture";
import { movePlacedDevice } from "./move-device";
import { applyFanCoil } from "../fan-coils/apply";
import { refreshDuctedBindings } from "../ducted/refresh";

function fixture() {
  const empty = createProject();
  const p = addRectangle(empty, empty.floors[0].id, {
    width: 8,
    length: 6,
    height: 2.7,
    name: "Sala",
  });
  return updateRoom(p, p.rooms[0].id, { ceilingHeightM: 2.4 });
}

function terminal(p: ReturnType<typeof fixture>) {
  return addOperatorTerminal(p, {
    ...guidedTerminalPoint(),
    roomId: p.rooms[0].id,
    systemId: null,
    use: "supply",
    mounting: "ceiling",
    lengthMm: 1000,
    color: "RAL9016",
  });
}

it("places a new ceiling terminal at the finished plane without needing a later refresh", () => {
  const placed = terminal(fixture());
  expect(placed.airTerminals[0].elevationM).toBe(2.4);
  expect(refreshDuctedBindings(placed).airTerminals[0].elevationM).toBe(2.4);
});

it("moves a ceiling terminal at the finished plane, retaining the saved point", () => {
  const placed = terminal(fixture());
  const unit = placed.airTerminals[0];
  const moved = movePlacedDevice(placed, unit.id, { x: 4, y: 4.5 });
  expect(moved.airTerminals[0]).toMatchObject({
    id: unit.id,
    position: { x: 4, y: 4.5 },
    elevationM: 2.4,
    productId: unit.productId,
    operatingPointIndex: unit.operatingPointIndex,
  });
});

it("places a concealed ceiling fan coil in the void while retaining its published minimum face height", () => {
  const p = fixture();
  const placed = applyFanCoil(
    p,
    p.rooms[0].id,
    "innova-airleaf-sli-200-2t",
    {
      mounting: "ceiling",
    },
  );
  expect(placed.fanCoils![0].elevationM).toBe(2.5);
  expect(placed.fanCoils![0].depthMm).toBe(126);
});

it("uses a lower local band on insertion and the central ceiling after moving outside it", () => {
  let p = fixture();
  p = updateRoom(p, p.rooms[0].id, {
    ceilingBands: [
      {
        id: "lower",
        name: "Fascia",
        wallId: p.rooms[0].wallIds[0],
        offsetM: 0,
        lengthM: 8,
        depthM: 4,
        elevationM: 2.2,
      },
    ],
  });
  const placed = terminal(p);
  expect(placed.airTerminals[0].elevationM).toBe(2.2);
  const moved = movePlacedDevice(placed, placed.airTerminals[0].id, {
    x: 4,
    y: 5,
  });
  expect(moved.airTerminals[0].elevationM).toBe(2.4);
});
