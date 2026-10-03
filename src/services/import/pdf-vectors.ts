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
  const stack: Matrix[] = [];
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
    if ([a.x, a.y, b.x, b.y].every(Number.isFinite))
      segments.push({
        id: String(segments.length),
        layer: "Tracciati PDF",
        start: a,
        end: b,
        kind: "tracciato PDF",
      });
  }
  for (let index = 0; index < list.fnArray.length; index++) {
    const op = list.fnArray[index],
      args = list.argsArray[index];
    if (op === ops.save) stack.push([...matrix]);
    else if (op === ops.restore) matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (op === ops.transform)
      matrix = multiplyMatrices(matrix, args as Matrix);
    else if (op === ops.paintFormXObjectBegin) {
      stack.push([...matrix]);
      const transform = args[0] as Matrix | null;
      if (transform) matrix = multiplyMatrices(matrix, transform);
      warnings.add(
        "Tracciati in gruppi PDF: verificare eventuali ritagli e maschere nel disegno.",
      );
    } else if (op === ops.paintFormXObjectEnd)
      matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (op === ops.clip || op === ops.eoClip)
      warnings.add(
        "Il PDF contiene ritagli: verificare manualmente i tracciati selezionati.",
      );
    else if (op === ops.constructPath && strokeOps.has(args[0] as number)) {
      const packed = (args[1] as unknown[])?.[0];
      if (!Array.isArray(packed) && !ArrayBuffer.isView(packed)) continue;
      const path = Array.from(packed as ArrayLike<number>);
      let current: Point | null = null,
        start: Point | null = null;
      const full = multiplyMatrices(viewport, matrix);
      for (let p = 0; p < path.length;) {
        const draw = path[p++];
        if (draw === 0) {
          current = point(path[p++], path[p++], full);
          start = current;
        } else if (draw === 1) {
          const next = point(path[p++], path[p++], full);
          if (current) add(current, next);
          current = next;
        } else if (draw === 2) {
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
