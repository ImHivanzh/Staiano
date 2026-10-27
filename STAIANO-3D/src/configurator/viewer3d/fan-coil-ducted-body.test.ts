import { expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import { applyFanCoil } from "@/domain/fan-coils/apply";
import { FanCoilMeshes } from "./FanCoilMeshes";
import { DuctedMachineBody } from "./DuctedMachineBody";

it.each(["wall", "ceiling"] as const)(
  "uses the ducted body for FCZ PO on %s",
  (mounting) => {
    let project = createProject();
    project = addRectangle(project, project.floors[0].id, {
      width: 8,
      length: 6,
      height: 2.7,
      name: "Sala",
    });
    project.rooms[0].ceilingHeightM = 2.2;
    project = applyFanCoil(project, project.rooms[0].id, "aermec-fcz200po", {
      mounting,
    });
    const unit = project.fanCoils![0];
    const scene = FanCoilMeshes({
      project,
      activeFloorId: unit.floorId,
      selection: [],
      onSelect: () => {},
    });
    const device = scene.props.children[0];
    const wrapper = device.props.children.type(device.props.children.props);
    const body = wrapper.props.children;
    expect(body.type).toBe(DuctedMachineBody);
    expect(body.props.item).toMatchObject({
      widthMm: unit.widthMm,
      heightMm: mounting === "ceiling" ? unit.depthMm : unit.heightMm,
      depthMm: mounting === "ceiling" ? unit.heightMm : unit.depthMm,
    });
    expect(wrapper.props.rotation).toEqual(
      mounting === "ceiling" ? [-Math.PI / 2, 0, 0] : [0, 0, 0],
    );
  },
);
