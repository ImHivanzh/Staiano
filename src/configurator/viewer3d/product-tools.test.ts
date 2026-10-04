import { describe, expect, it } from "vitest";
import { createProject, addRectangle } from "@/domain/project";
import { splitCatalog } from "@/domain/catalogs/splits";
import { sizeSplitSystems } from "@/domain/air-conditioning/size";
import { applySplitSystem } from "@/domain/air-conditioning/apply";

function fixture() {
  const project = createProject();
  return addRectangle(project, project.floors[0].id, {
    width: 5,
    length: 4,
    height: 2.7,
    name: "Ambiente",
  });
}

describe("catalogo 3D: scelta effettiva del modello split", () => {
  it("salva la combinazione approvata scelta, anche se non è la prima proposta", () => {
    const project = fixture();
    const roomId = project.rooms[0].id;
    const choices = sizeSplitSystems(project, [roomId], "Daikin", splitCatalog);
    expect(choices.length).toBeGreaterThan(1);
    const selected = choices.at(-1)!;
    const placed = applySplitSystem(
      project,
      [roomId],
      "Daikin",
      null,
      selected.combination.id,
    );
    expect(placed.hvacSystems[0].productId).toBe(selected.combination.id);
    expect(placed.hvacSystems[0].indoorUnits[0].productId).toBe(
      selected.assignments[0].indoor.id,
    );
  });
  it("rifiuta un modello estraneo senza ricadere su un altro modello", () => {
    const project = fixture();
    expect(() =>
      applySplitSystem(
        project,
        [project.rooms[0].id],
        "Daikin",
        null,
        "modello-non-verificato",
      ),
    ).toThrow(/Nessuna combinazione/);
    expect(project.hvacSystems).toHaveLength(0);
  });
  it("conserva il dimensionamento automatico dei pannelli già esistenti", () => {
    const project = fixture();
    const roomId = project.rooms[0].id;
    const recommended = sizeSplitSystems(
      project,
      [roomId],
      "Daikin",
      splitCatalog,
    )[0];
    const placed = applySplitSystem(project, [roomId], "Daikin", null);
    expect(placed.hvacSystems[0].productId).toBe(recommended.combination.id);
  });
});
