import { execFileSync } from "node:child_process";
import { PerspectiveCamera, Vector3 } from "three";
import type { Project } from "../src/schemas/project";
import { pointInPolygon } from "../src/domain/geometry/primitives";
import { roomLabelPoint } from "../src/domain/geometry/room-label";
import { test, expect } from "./browser-test";

test("nome e dimensioni del corridoio a L restano nel locale in 2D e 3D", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const project: Project = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
    import {createProject,addWall} from './src/domain/project.ts';
    let p=createProject('Corridoio a L');
    const outline=[{x:0,y:0},{x:10,y:0},{x:10,y:1.4},{x:1.4,y:1.4},{x:1.4,y:8},{x:0,y:8}];
    for(let i=0;i<outline.length;i++)p=addWall(p,p.floors[0].id,outline[i],outline[(i+1)%outline.length]);
    p=addWall(p,p.floors[0].id,{x:10,y:1.4},{x:10,y:8});
    p=addWall(p,p.floors[0].id,{x:10,y:8},{x:1.4,y:8});
    p.rooms.forEach(r=>r.name=r.polygon.length>4?'Corridoio':'Stanza adiacente');
    console.log(JSON.stringify(p));
  `,
      ],
      { encoding: "utf8" },
    ),
  );
  const corridor = project.rooms.find((room) => room.name === "Corridoio")!;
  expect(corridor).toBeTruthy();
  expect(pointInPolygon(corridor.centroid, corridor.polygon)).toBe(false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "corridoio.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const name = page.locator(".nome-stanza").filter({ hasText: /^Corridoio$/ });
  await expect(name).toBeVisible();
  const labels = await name
    .locator("..")
    .locator("text")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        x: Number(node.getAttribute("x")),
        y: Number(node.getAttribute("y")),
      })),
    );
  expect(labels).toHaveLength(3);
  for (const point of labels)
    expect(pointInPolygon(point, corridor.polygon)).toBe(true);
  await page.screenshot({ path: info.outputPath("corridoio-2d.png") });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const canvas = page.getByTestId("viewer-3d").locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true", {
    timeout: 30000,
  });
  const label = page.getByRole("button", {
    name: "Seleziona Corridoio nel 3D",
    exact: true,
  });
  await expect(label).toBeVisible();
  await expect
    .poll(async () => {
      const box = await canvas.boundingBox(),
        tag = await label.boundingBox();
      if (!box || !tag) return Infinity;
      const camera = new PerspectiveCamera(
        Number(await canvas.getAttribute("data-camera-fov")),
        box.width / box.height,
        0.01,
        1000,
      );
      camera.position.fromArray(
        (await canvas.getAttribute("data-camera-position"))!
          .split(",")
          .map(Number),
      );
      camera.quaternion.fromArray(
        (await canvas.getAttribute("data-camera-quaternion"))!
          .split(",")
          .map(Number),
      );
      camera.updateMatrixWorld();
      const anchor = roomLabelPoint(corridor.polygon),
        expected = new Vector3(anchor.x, 0.03, anchor.y).project(camera);
      return Math.hypot(
        tag.x + tag.width / 2 - (box.x + ((expected.x + 1) * box.width) / 2),
        tag.y + tag.height / 2 - (box.y + ((1 - expected.y) * box.height) / 2),
      );
    })
    .toBeLessThan(3);
  await page.screenshot({ path: info.outputPath("corridoio-3d.png") });
});
