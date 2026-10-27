import { expect, it } from "vitest";
import type { Project } from "@/schemas/project";
import { presentationSteps } from "./customer-presentation";

const terminal = (id: string, use: "supply" | "return") => ({
  id,
  use,
  roomId: "r1",
  systemId: "s1",
  widthMm: 300,
  heightMm: 150,
  availableAirflowM3h: 120,
  noiseDbA: 30,
});

it("explains each installation and groups its terminals per room", () => {
  const project = {
    name: "Casa",
    rooms: [{ id: "r1", name: "Soggiorno" }],
    installations: [
      { id: "i1", name: "Impianto 1", type: "ducted", roomIds: ["r1"] },
    ],
    radiators: [],
    fanCoils: [],
    hvacSystems: [
      {
        id: "s1",
        installationId: "i1",
        manufacturer: "Daikin",
        name: "",
        capacityW: 5000,
        airflowM3h: 900,
      },
    ],
    airTerminals: [
      terminal("t1", "supply"),
      terminal("t2", "supply"),
      terminal("t3", "return"),
    ],
  } as unknown as Project;
  const [overview, step] = presentationSteps(project);
  expect(overview.facts).toEqual([
    { label: "Ambienti", value: "1" },
    { label: "Impianti", value: "1" },
  ]);
  expect(step.title).toBe("Impianto 1 · Canalizzato");
  expect(step.facts[0].value).toBe("Daikin · 5 kW · 900 m³/h");
  expect(step.terminals.map((t) => `${t.room}: ${t.label}`)).toEqual([
    "Soggiorno: 1 griglia di ripresa",
    "Soggiorno: 2 bocchette di mandata",
  ]);
  expect(step.terminals[1].detail).toContain("240 m³/h");
});
