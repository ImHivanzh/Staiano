import { describe, it, expect } from "vitest";
import { extractPdfVectors } from "./pdf-vectors";

it("conserva colore, spessore trasformato, tratteggio e ripristino dello stato PDF", () => {
  const ops = {
    save: 1,
    restore: 2,
    transform: 3,
    constructPath: 4,
    stroke: 5,
    setLineWidth: 6,
    setDash: 7,
    setStrokeRGBColor: 8,
  };
  const path = () => [5, [new Float32Array([0, 0, 0, 1, 100, 0])]];
  const result = extractPdfVectors(
    {
      fnArray: [6, 8, 1, 3, 6, 7, 8, 4, 2, 4],
      argsArray: [
        [2],
        ["#000000"],
        [],
        [2, 0, 0, 2, 10, 20],
        [3],
        [[2, 4], 0],
        ["#ff0000"],
        path(),
        [],
        path(),
      ],
    },
    ops,
    [1, 0, 0, 1, 0, 0],
  );
  expect(result.segments[0]).toMatchObject({
    start: { x: 10, y: 20 },
    end: { x: 210, y: 20 },
    pdfStyle: {
      color: "#ff0000",
      width: 6,
      dash: [2, 4],
      path: 1,
      curved: false,
    },
  });
  expect(result.segments[1].pdfStyle).toMatchObject({
    color: "#000000",
    width: 2,
    dash: [],
    path: 2,
  });
});

describe("tracciati curvi", () => {
  it("misura lo spessore normale alla linea anche con scala non uniforme e GState", () => {
    const ops = { transform: 1, setGState: 2, constructPath: 3, stroke: 4 };
    const result = extractPdfVectors(
      {
        fnArray: [1, 2, 3],
        argsArray: [
          [2, 0, 0, 3, 0, 0],
          [
            [
              ["LW", 2],
              ["D", [[3, 2], 0]],
            ],
          ],
          [4, [new Float32Array([0, 0, 0, 1, 10, 0, 0, 0, 0, 1, 0, 10])]],
        ],
      },
      ops,
      [1, 0, 0, 1, 0, 0],
    );
    expect(result.segments[0].pdfStyle?.width).toBe(6);
    expect(result.segments[1].pdfStyle?.width).toBe(4);
    expect(result.segments[1].pdfStyle?.dash).toEqual([3, 2]);
  });
  it("distingue l'arco dal successivo tratto dritto senza eliminarlo dall'originale", () => {
    const ops = { constructPath: 1, stroke: 2 };
    const result = extractPdfVectors(
      {
        fnArray: [1],
        argsArray: [
          [
            2,
            [
              new Float32Array([
                0, 0, 0, 2, 10, 0, 10, 10, 20, 10, 0, 30, 30, 1, 50, 30,
              ]),
            ],
          ],
        ],
      },
      ops,
      [1, 0, 0, 1, 0, 0],
    );
    expect(result.segments.filter((s) => s.pdfStyle?.curved)).toHaveLength(16);
    expect(result.segments.at(-1)?.pdfStyle?.curved).toBe(false);
  });
});
