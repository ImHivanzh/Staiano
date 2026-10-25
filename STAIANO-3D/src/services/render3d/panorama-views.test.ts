import { describe, expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import { projectPanoramaViews } from "./panorama-views";

function twoFloorProject() {
  let project = createProject("Panoramiche per stanza");
  const ground = project.floors[0];
  project = addRectangle(project, ground.id, {
    width: 4,
    length: 5,
    height: 2.7,
    name: "Ingresso",
    origin: { x: 0, y: 0 },
  });
  const upper = {
    ...ground,
    id: "upper",
    name: "Piano primo",
    elevationM: 2.8,
  };
  project = { ...project, floors: [...project.floors, upper] };
  return addRectangle(project, upper.id, {
    width: 4,
    length: 5,
    height: 2.7,
    name: "Camera",
    origin: { x: 0, y: 0 },
  });
}

describe("render 3D del dossier", () => {
  it("keeps floor panoramas and adds one room view per room across floors", () => {
    const project = twoFloorProject(),
      views = projectPanoramaViews(project, { includeRooms: true });
    expect(views).toHaveLength(4);
    expect(
      views.filter((view) => !view.room).map((view) => view.floorId),
    ).toEqual(project.floors.map((floor) => floor.id));
    expect(
      views.filter((view) => view.room).map((view) => view.room!.name),
    ).toEqual(["Ingresso", "Camera"]);
  });

  it("keeps the room filter for a single selected-room render", () => {
    const project = twoFloorProject(),
      room = project.rooms[0],
      views = projectPanoramaViews(project, {
        floorId: room.floorId,
        roomId: room.id,
        includeRooms: true,
      });
    expect(views.map((view) => view.room?.id)).toEqual([undefined, room.id]);
  });
});
