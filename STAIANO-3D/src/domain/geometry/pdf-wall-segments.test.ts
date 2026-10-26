import { describe, it, expect } from "vitest";
import type { ParsedPlan, PlanSegment } from "@/services/import/plan-types";
import { pdfWallSegments } from "./pdf-wall-segments";
const line = (
  id: string,
  y: number,
  width = 2,
  color = "#000000",
  curved = false,
): PlanSegment => ({
  id,
  layer: "Tracciati PDF",
  kind: "tracciato PDF",
  start: { x: 100, y },
  end: { x: 400, y },
  pdfStyle: { color, width, dash: [], path: Number(id) || 1, curved },
});
const plan = (segments: PlanSegment[]) =>
  ({
    sourceType: "pdf",
    segments,
    background: { widthPx: 600, heightPx: 500 },
  }) as ParsedPlan;
describe("indizi di stile dei PDF", () => {
  it("filtra quote sottili e cartiglio mantenendo pareti colorate e contorni sottili nell'immagine", () => {
    const structure = Array.from({ length: 10 }, (_, i) =>
      line(String(i), 100 + i * 25),
    );
    const p = plan([
      ...structure,
      line("dimension", 140, 0.3, "#ff0000"),
      line("colored-wall", 200, 2, "#0000ff"),
      line("thin-wall", 220, 0.3),
      line("frame", 20, 1),
      line("arc", 230, 2, "#000000", true),
    ]);
    const ids = pdfWallSegments(p).map((s) => s.id);
    expect(ids).toContain("colored-wall");
    expect(ids).not.toContain("dimension");
    expect(ids).not.toContain("frame");
    expect(ids).not.toContain("arc");
    expect(pdfWallSegments(p, true).map((s) => s.id)).toContain("thin-wall");
    expect(p.segments).toHaveLength(15);
  });
  it("non elimina un disegno composto soltanto da pareti sottili colorate", () => {
    const p = plan(
      Array.from({ length: 4 }, (_, i) =>
        line(String(i), 100 + i * 25, 0.2, "#ff0000"),
      ),
    );
    expect(pdfWallSegments(p)).toHaveLength(4);
  });
});
