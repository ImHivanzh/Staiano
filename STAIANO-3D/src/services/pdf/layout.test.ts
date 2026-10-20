import { expect, it } from "vitest";
import { pdfQaFixture } from "../../../scripts/verification/pdf-fixture";
import { renderDossierPdf } from "./render";

it("centres cover measurements and their labels, aligns numeric table columns and keeps rows clear of headers", async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: await renderDossierPdf(pdfQaFixture()),
  });
  const doc = await task.promise;
  try {
    const cover = (await (await doc.getPage(1)).getTextContent()).items.filter(
      (i) => "str" in i,
    );
    const measures = ["4", "77,48", "218,35", "7,642"].map((value) =>
      cover.find((i) => i.str === value)!,
    );
    expect(measures.every(Boolean)).toBe(true);
    const centers = measures.map((i) => i.transform[4] + i.width / 2);
    expect(centers[1] - centers[0]).toBeCloseTo(centers[2] - centers[1], 1);
    expect(centers[2] - centers[1]).toBeCloseTo(centers[3] - centers[2], 1);
    for (let index = 0; index < measures.length; index++) {
      const labels = cover.filter(
        (i) =>
          Math.abs(i.transform[5] - (measures[index].transform[5] - 19)) <
            0.2 && Math.abs(i.transform[4] + i.width / 2 - centers[index]) < 60,
      );
      expect(labels.length).toBeGreaterThan(0);
      const left = Math.min(...labels.map((i) => i.transform[4])),
        right = Math.max(...labels.map((i) => i.transform[4] + i.width));
      expect((left + right) / 2).toBeCloseTo(centers[index], 1);
    }
    const items = (await (await doc.getPage(2)).getTextContent()).items.filter(
      (i) => "str" in i,
    );
    const header = items.find((i) => i.str === "Netta m²")!,
      cell = items.find((i) => i.str === "15,96")!;
    expect(header).toBeDefined();
    expect(cell).toBeDefined();
    expect(cell.transform[4] + cell.width / 2).toBeCloseTo(
      header.transform[4] + header.width / 2,
      1,
    );
    expect(header.transform[5] - cell.transform[5]).toBeGreaterThan(20);
    const texts: string[] = [];
    for (let page = 1; page <= doc.numPages; page++)
      texts.push(
        (await (await doc.getPage(page)).getTextContent()).items
          .map((i) => ("str" in i ? i.str : ""))
          .join(" "),
      );
    expect(texts.join(" ")).not.toMatch(/\bMACCHINA\b/);
    for (const text of texts.filter((t) =>
      t.includes("Plenum - viste tecniche"),
    ))
      expect(text).toMatch(/Mitsubishi Electric|Daikin/);
  } finally {
    await task.destroy();
  }
});
