import { mkdir, writeFile } from "node:fs/promises";
import { renderDossierPdf } from "../../src/services/pdf/render";
import { pdfQaFixture } from "./pdf-fixture";

const directory = "output/pdf";
await mkdir(directory, { recursive: true });
const project = pdfQaFixture();
const path = `${directory}/staiano-guided-dossier.pdf`;
await writeFile(
  path,
  await renderDossierPdf(project, {
    generatedAt: new Date("2026-10-07T10:00:00Z"),
  }),
);
const summaryPath = `${directory}/staiano-guided-dossier-sintetico.pdf`;
await writeFile(
  summaryPath,
  await renderDossierPdf(project, {
    generatedAt: new Date("2026-10-07T10:00:00Z"),
    variant: "summary",
  }),
);
console.log(
  JSON.stringify({
    path,
    summaryPath,
    machines: project.hvacSystems.length,
    plenums: project.plenums.length,
    ducts: project.ducts?.length,
    fanCoils: project.fanCoils?.length,
    hydronicSystems: project.hydronicSystems?.length,
  }),
);
