import { mkdir, readFile, writeFile } from "node:fs/promises";
import { renderDossierPdf } from "../../src/services/pdf/render";
import { pdfQaFixture } from "./pdf-fixture";

const directory = "output/pdf";
await mkdir(directory, { recursive: true });
const project = pdfQaFixture();
const logoSvg = await readFile("public/logo.svg", "utf8");
const generatedAt = new Date();
const path = `${directory}/staiano-guided-dossier.pdf`;
await writeFile(
  path,
  await renderDossierPdf(project, {
    generatedAt,
    logoSvg,
  }),
);
const summaryPath = `${directory}/staiano-guided-dossier-sintetico.pdf`;
await writeFile(
  summaryPath,
  await renderDossierPdf(project, {
    generatedAt,
    logoSvg,
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
