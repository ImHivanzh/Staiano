import { mkdir, readFile, writeFile } from "node:fs/promises";
import { renderDossierPdf } from "../src/services/pdf/render";
import { dossierFixture } from "../src/services/pdf/fixture";
await mkdir("output/pdf", { recursive: true });
await writeFile(
  "output/pdf/staiano-dossier-verifica.pdf",
  await renderDossierPdf(dossierFixture(), {
    logoSvg: await readFile("public/logo.svg", "utf8"),
  }),
);
console.log("PDF di verifica: output/pdf/staiano-dossier-verifica.pdf");
