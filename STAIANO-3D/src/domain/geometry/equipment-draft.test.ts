import { expect, it } from "vitest";
import { addRectangle, createProject, clearProjectSystems } from "../project";
import { projectSchema } from "@/schemas/project";
import { placeEquipmentDraft } from "./equipment-draft";
import { movePlacedDevice } from "./move-device";
import { duplicateSelection, removeSelection } from "./selection";

it.each(["radiator", "fanCoil", "split"] as const)(
  "preserves pending %s through persistence, move, copy and deletion",
  (type) => {
    const empty = createProject();
    const p = addRectangle(empty, empty.floors[0].id, {
      width: 8,
      length: 6,
      height: 2.7,
      name: "Stanza",
    });
    const pending = placeEquipmentDraft(p, p.rooms[0].id, { x: 3, y: 3 }, type);
    const draft = pending.equipmentDrafts![0];
    expect(
      projectSchema.parse(JSON.parse(JSON.stringify(pending))).equipmentDrafts,
    ).toEqual([draft]);
    expect(pending.installations).toEqual([]);
    expect(() =>
      placeEquipmentDraft(p, p.rooms[0].id, { x: -1, y: -1 }, type),
    ).toThrow();
    expect(() =>
      placeEquipmentDraft(p, p.rooms[0].id, { x: NaN, y: 3 }, type),
    ).toThrow();
    expect(() =>
      movePlacedDevice(pending, draft.id, { x: -1, y: -1 }),
    ).toThrow();
    const moved = movePlacedDevice(pending, draft.id, { x: 4, y: 3 });
    expect(moved.equipmentDrafts![0]).toMatchObject({
      id: draft.id,
      position: { x: 4, y: 3 },
    });
    const selection = [{ kind: "device" as const, id: draft.id }];
    expect(duplicateSelection(moved, selection).equipmentDrafts).toHaveLength(
      2,
    );
    expect(removeSelection(moved, selection).equipmentDrafts).toEqual([]);
    expect(clearProjectSystems(moved).equipmentDrafts).toEqual([]);
  },
);
