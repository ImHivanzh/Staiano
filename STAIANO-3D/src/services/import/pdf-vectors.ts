import type { Point } from "@/schemas/project";
import type { PlanSegment } from "./plan-types";

type Matrix = [number, number, number, number, number, number];
export function multiplyMatrices(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
function point(x: number, y: number, m: Matrix): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** PDF.js 6 DrawOPS packed paths, matching the installed renderer format. */
export function extractPdfVectors(
  list: { fnArray: number[]; argsArray: unknown[][] },
  ops: Record<string, number>,
  viewportTransform: number[],
): { segments: PlanSegment[]; warnings: string[] } {
  const segments: PlanSegment[] = [];
  const warnings = new Set<string>();
  const viewport = viewportTransform as Matrix;
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  let style = { color: "#000000", width: 1, dash: [] as number[] };
  const stack: { matrix: Matrix; style: typeof style }[] = [];
  let pathIndex = 0;
  let curved = false;
  const strokeOps = new Set([
    ops.stroke,
    ops.closeStroke,
    ops.fillStroke,
    ops.eoFillStroke,
    ops.closeFillStroke,
    ops.closeEOFillStroke,
  ]);
  function add(a: Point, b: Point) {
    if (segments.length >= 30000)
      throw new Error(
        "PDF con troppi tracciati. Importare come sfondo oppure semplificare il PDF.",
      );
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.02) return;
    const full = fullMatrix();
    if ([a.x, a.y, b.x, b.y].every(Number.isFinite))
      segments.push({
        id: String(segments.length),
        layer: "Tracciati PDF",
        start: a,
        end: b,
        kind: "tracciato PDF",
        pdfStyle: {
          ...style,
          width:
            (style.width *
              Math.hypot(
                full[3] * (b.x - a.x) - full[2] * (b.y - a.y),
                full[0] * (b.y - a.y) - full[1] * (b.x - a.x),
              )) /
            Math.hypot(b.x - a.x, b.y - a.y),
          path: pathIndex,
          curved,
        },
      });
  }
  const fullMatrix = () => multiplyMatrices(viewport, matrix);
  const save = () =>
    stack.push({
      matrix: [...matrix],
      style: { ...style, dash: [...style.dash] },
    });
  const restore = () => {
    const state = stack.pop();
    matrix = state?.matrix ?? [1, 0, 0, 1, 0, 0];
    style = state?.style ?? { color: "#000000", width: 1, dash: [] };
  };
  for (let index = 0; index < list.fnArray.length; index++) {
    const op = list.fnArray[index],
      args = list.argsArray[index];
    if (op === ops.save) save();
    else if (op === ops.restore) restore();
    else if (op === ops.setLineWidth)
      style = { ...style, width: Number(args[0]) };
    else if (op === ops.setDash)
      style = { ...style, dash: Array.from(args[0] as ArrayLike<number>) };
    else if (op === ops.setGState)
      for (const [key, value] of args[0] as [string, unknown][]) {
        if (key === "LW") style = { ...style, width: Number(value) };
        if (key === "D")
          style = {
            ...style,
            dash: Array.from((value as [ArrayLike<number>, number])[0]),
          };
      }
    else if (
      op === ops.setStrokeRGBColor ||
      op === ops.setStrokeGray ||
      op === ops.setStrokeCMYKColor
    ) {
      // PDF.js 6 emits normalized CSS colors; older operator lists use numbers.
      const color =
        typeof args[0] === "string"
          ? args[0]
          : (() => {
              const values = args.map(Number);
              const channels =
                op === ops.setStrokeGray
                  ? [values[0], values[0], values[0]]
                  : op === ops.setStrokeCMYKColor
                    ? values
                        .slice(0, 3)
                        .map((v) => 1 - Math.min(1, v + values[3]))
                    : values;
              return `#${channels
                .map((v) =>
                  Math.round(v * 255)
                    .toString(16)
                    .padStart(2, "0"),
                )
                .join("")}`;
            })();
      style = { ...style, color };
    } else if (op === ops.transform)
      matrix = multiplyMatrices(matrix, args as Matrix);
    else if (op === ops.paintFormXObjectBegin) {
      save();
      const transform = args[0] as Matrix | null;
      if (transform) matrix = multiplyMatrices(matrix, transform);
      warnings.add(
        "Tracciati in gruppi PDF: verificare eventuali ritagli e maschere nel disegno.",
      );
    } else if (op === ops.paintFormXObjectEnd) restore();
    else if (op === ops.clip || op === ops.eoClip)
      warnings.add(
        "Il PDF contiene ritagli: verificare manualmente i tracciati selezionati.",
      );
    else if (op === ops.constructPath && strokeOps.has(args[0] as number)) {
      const packed = (args[1] as unknown[])?.[0];
      if (!Array.isArray(packed) && !ArrayBuffer.isView(packed)) continue;
      const path = Array.from(packed as ArrayLike<number>);
      pathIndex++;
      curved = false;
      let current: Point | null = null,
        start: Point | null = null;
      const full = multiplyMatrices(viewport, matrix);
      for (let p = 0; p < path.length;) {
        const draw = path[p++];
        if (draw === 0) {
          curved = false;
          current = point(path[p++], path[p++], full);
          start = current;
        } else if (draw === 1) {
          const next = point(path[p++], path[p++], full);
          if (current) add(current, next);
          current = next;
        } else if (draw === 2) {
          curved = true;
          const c1 = point(path[p++], path[p++], full),
            c2 = point(path[p++], path[p++], full),
            end = point(path[p++], path[p++], full);
          if (current) {
            const begin: Point = current;
            let previous: Point = current;
            for (let i = 1; i <= 16; i++) {
              const t = i / 16,
                u = 1 - t;
              const next: Point = {
                x:
                  u * u * u * begin.x +
                  3 * u * u * t * c1.x +
                  3 * u * t * t * c2.x +
                  t * t * t * end.x,
                y:
                  u * u * u * begin.y +
                  3 * u * u * t * c1.y +
                  3 * u * t * t * c2.y +
                  t * t * t * end.y,
              };
              add(previous, next);
              previous = next;
            }
            current = end;
          }
          warnings.add("Curve PDF approssimate in segmenti.");
        } else if (draw === 3) {
          curved = true;
          const control = point(path[p++], path[p++], full),
            end = point(path[p++], path[p++], full);
          if (current) {
            const begin: Point = current;
            let previous: Point = current;
            for (let i = 1; i <= 16; i++) {
              const t = i / 16,
                u = 1 - t;
              const next: Point = {
                x: u * u * begin.x + 2 * u * t * control.x + t * t * end.x,
                y: u * u * begin.y + 2 * u * t * control.y + t * t * end.y,
              };
              add(previous, next);
              previous = next;
            }
            current = end;
          }
          warnings.add("Curve PDF approssimate in segmenti.");
        } else if (draw === 4) {
          if (current && start) add(current, start);
          current = start;
        } else {
          warnings.add("Tracciato PDF non supportato ignorato.");
          break;
        }
      }
    }
  }
  return { segments, warnings: [...warnings] };
}
