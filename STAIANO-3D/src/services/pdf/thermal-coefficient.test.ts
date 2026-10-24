import { expect, it } from "vitest";
import {
  addRectangle,
  createProject,
  recomputeProject,
} from "@/domain/project";
import { renderDossierPdf } from "./render";
import { buildDossier } from "./dossier";

it("riporta il coefficiente e il carico effettivi nel dossier completo e sintetico", async () => {
  const initial = createProject("Coefficiente personalizzato", 42.75);
  const project = addRectangle(initial, initial.floors[0].id, {
    width: 5,
    length: 4,
    height: 3,
    name: "Sala",
  });
  project.rooms[0].ceilingHeightM = 2.5;
  const changed = recomputeProject(project);
  const data = buildDossier(changed);
  expect(data.totals.loadW).toBe(data.totals.volumeM3 * 42.75);
  expect(
    data.checks
      .filter((check) => check.code === "thermal")
      .every((check) => check.status === "valid"),
  ).toBe(true);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  for (const variant of ["complete", "summary"] as const) {
    const task = pdfjs.getDocument({
      data: await renderDossierPdf(changed, { variant }),
    });
    const document = await task.promise;
    try {
      const pages = [];
      for (let i = 1; i <= document.numPages; i++) {
        const content = await (await document.getPage(i)).getTextContent();
        pages.push(
          content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" "),
        );
      }
      const text = pages.join(" ");
      expect(text).toContain("42,75 W/m³");
      expect(text).not.toContain("35 W/m³");
    } finally {
      await task.destroy();
    }
  }
});
