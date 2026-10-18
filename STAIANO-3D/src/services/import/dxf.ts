import DxfParser, {
  type IDxf,
  type IEntity,
  type IInsertEntity,
  type ILwpolylineEntity,
  type IArcEntity,
  type ILineEntity,
  type ITextEntity,
  type IMtextEntity,
  type IDimensionEntity,
} from "dxf-parser";
import type { Point } from "@/schemas/project";
import type { ParsedPlan, PlanAnnotation, PlanSegment } from "./plan-types";

type Matrix = [number, number, number, number, number, number];
const identity: Matrix = [1, 0, 0, 1, 0, 0];
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
function transform(p: Point, m: Matrix): Point {
  return {
    x: m[0] * p.x + m[2] * p.y + m[4],
    y: -(m[1] * p.x + m[3] * p.y + m[5]),
  };
}
const units: Record<number, [string, number]> = {
  1: ["pollici", 0.0254],
  2: ["piedi", 0.3048],
  4: ["millimetri", 0.001],
  5: ["centimetri", 0.01],
  6: ["metri", 1],
  7: ["chilometri", 1000],
  10: ["iarde", 0.9144],
  14: ["decimetri", 0.1],
};

/** ASCII DXF only. Curves become explicit chord segments; original entities remain auditable. */
export function parseDxf(
  text: string,
  filename = "planimetria.dxf",
  sizeBytes = text.length,
): ParsedPlan {
  if (text.startsWith("AutoCAD Binary DXF"))
    throw new Error(
      "DXF binario non supportato. Esportare DXF ASCII dal programma CAD.",
    );
  if (text.length > 32 * 1024 * 1024)
    throw new Error("DXF troppo grande. Limite 32 MB.");
  if (!/\bSECTION\b/.test(text) || !/\bEOF\b/.test(text))
    throw new Error("Il file non contiene un DXF ASCII completo.");
  let dxf: IDxf | null;
  try {
    dxf = new DxfParser().parseSync(text);
  } catch {
    throw new Error(
      "DXF non leggibile. Esportare una copia DXF ASCII 2D e riprovare.",
    );
  }
  if (!dxf) throw new Error("DXF senza geometrie leggibili.");
  return extractDxf(dxf, filename, sizeBytes);
}

export function extractDxf(
  dxf: IDxf,
  filename: string,
  sizeBytes: number,
): ParsedPlan {
  const segments: PlanSegment[] = [],
    annotations: PlanAnnotation[] = [];
  const warnings = new Set<string>();
  const ignored = new Map<string, number>();
  let visited = 0;
  function line(a: Point, b: Point, m: Matrix, layer: string, kind: string) {
    const start = transform(a, m),
      end = transform(b, m);
    if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) {
      warnings.add("Coordinate non finite ignorate.");
      return;
    }
    if (Math.hypot(end.x - start.x, end.y - start.y) < 1e-8) return;
    if (segments.length >= 30000)
      throw new Error(
        "Troppe geometrie DXF. Selezionare/esportare solo i layer utili (massimo 30.000 segmenti).",
      );
    segments.push({ id: String(segments.length), start, end, layer, kind });
  }
  function arc(
    center: Point,
    radius: number,
    start: number,
    sweep: number,
    m: Matrix,
    layer: string,
  ) {
    if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(sweep))
      return;
    const n = Math.max(
      2,
      Math.min(128, Math.ceil(Math.abs(sweep) / (Math.PI / 36))),
    );
    let a = {
      x: center.x + radius * Math.cos(start),
      y: center.y + radius * Math.sin(start),
    };
    for (let i = 1; i <= n; i++) {
      const angle = start + (sweep * i) / n;
      const b = {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      };
      line(a, b, m, layer, "arco approssimato");
      a = b;
    }
    warnings.add(
      "Archi e curve sono convertiti in segmenti: verificare e correggere manualmente.",
    );
  }
  function visit(
    entity: IEntity,
    m: Matrix,
    inherited: string,
    ancestors: string[],
  ) {
    if (++visited > 50000)
      throw new Error(
        "DXF troppo complesso: ridurre entità e blocchi prima di importare.",
      );
    if (entity.inPaperSpace) {
      warnings.add(
        "Entità dello spazio carta ignorate; importato spazio modello.",
      );
      return;
    }
    const layer =
      !entity.layer || entity.layer === "0" ? inherited : entity.layer;
    const e = entity as IEntity & {
      extrusionDirectionZ?: number;
      extrusionDirection?: { x: number; y: number; z: number };
    };
    if (
      (e.extrusionDirectionZ !== undefined && e.extrusionDirectionZ !== 1) ||
      (e.extrusionDirection &&
        (e.extrusionDirection.z !== 1 ||
          e.extrusionDirection.x !== 0 ||
          e.extrusionDirection.y !== 0))
    ) {
      warnings.add(
        "Entità con piano di estrusione non XY ignorate. Esportare una planimetria CAD 2D.",
      );
      return;
    }
    if (entity.type === "LINE") {
      const v = (entity as ILineEntity).vertices;
      if (v?.length >= 2) line(v[0], v[1], m, layer, "linea");
    } else if (entity.type === "LWPOLYLINE" || entity.type === "POLYLINE") {
      const poly = entity as ILwpolylineEntity,
        v = poly.vertices ?? [];
      for (let i = 0; i < v.length - (poly.shape ? 0 : 1); i++) {
        const a = v[i],
          b = v[(i + 1) % v.length],
          bulge = a.bulge ?? 0;
        if (Math.abs(bulge) < 1e-10) line(a, b, m, layer, "polilinea");
        else {
          const dx = b.x - a.x,
            dy = b.y - a.y,
            chord = Math.hypot(dx, dy);
          const center = {
            x: (a.x + b.x) / 2 - (dy * (1 - bulge * bulge)) / (4 * bulge),
            y: (a.y + b.y) / 2 + (dx * (1 - bulge * bulge)) / (4 * bulge),
          };
          arc(
            center,
            (chord * (1 + bulge * bulge)) / (4 * Math.abs(bulge)),
            Math.atan2(a.y - center.y, a.x - center.x),
            4 * Math.atan(bulge),
            m,
            layer,
          );
        }
      }
    } else if (entity.type === "ARC" || entity.type === "CIRCLE") {
      const a = entity as IArcEntity;
      let sweep =
        entity.type === "CIRCLE" ? Math.PI * 2 : a.endAngle - a.startAngle;
      if (sweep <= 0) sweep += Math.PI * 2;
      arc(a.center, a.radius, a.startAngle ?? 0, sweep, m, layer);
    } else if (entity.type === "INSERT") {
      const insert = entity as IInsertEntity,
        block = dxf.blocks?.[insert.name];
      if (!block) {
        warnings.add(`Blocco mancante: ${insert.name}.`);
        return;
      }
      if (ancestors.includes(insert.name) || ancestors.length >= 12) {
        warnings.add("Blocchi ricorsivi o troppo annidati ignorati.");
        return;
      }
      const angle = ((insert.rotation ?? 0) * Math.PI) / 180,
        sx = insert.xScale ?? 1,
        sy = insert.yScale ?? 1,
        c = Math.cos(angle),
        s = Math.sin(angle);
      const rows = insert.rowCount ?? 1,
        cols = insert.columnCount ?? 1;
      if (rows * cols > 1000) {
        warnings.add("Matrice di blocchi troppo grande ignorata.");
        return;
      }
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++) {
          const x =
            col * (insert.columnSpacing ?? 0) - (block.position?.x ?? 0) * sx;
          const y =
            row * (insert.rowSpacing ?? 0) - (block.position?.y ?? 0) * sy;
          const local: Matrix = [
            c * sx,
            s * sx,
            -s * sy,
            c * sy,
            (insert.position?.x ?? 0) + c * x - s * y,
            (insert.position?.y ?? 0) + s * x + c * y,
          ];
          for (const child of block.entities ?? [])
            visit(child, multiply(m, local), layer, [
              ...ancestors,
              insert.name,
            ]);
        }
    } else if (entity.type === "TEXT" || entity.type === "MTEXT") {
      const t = entity as ITextEntity & IMtextEntity;
      const pos = t.startPoint ?? t.position;
      if (pos && annotations.length < 2000)
        annotations.push({
          layer,
          text: String(t.text ?? "")
            .replace(/\\P/g, " ")
            .slice(0, 300),
          position: transform(pos, m),
        });
    } else if (entity.type === "DIMENSION") {
      const dim = entity as IDimensionEntity;
      if (dim.anchorPoint && annotations.length < 2000)
        annotations.push({
          layer,
          text: dim.text || `Quota CAD: ${dim.actualMeasurement}`,
          position: transform(dim.anchorPoint, m),
          measuredValue: dim.actualMeasurement,
        });
      warnings.add(
        "Quote CAD mostrate come riferimento; non determinano automaticamente la scala.",
      );
    } else ignored.set(entity.type, (ignored.get(entity.type) ?? 0) + 1);
  }
  for (const entity of dxf.entities ?? []) visit(entity, identity, "0", []);
  if (ignored.size)
    warnings.add(
      `Entità non convertite: ${[...ignored].map(([type, count]) => `${type} (${count})`).join(", ")}.`,
    );
  if (!segments.length)
    throw new Error(
      "Il file è stato letto ma non contiene linee, polilinee o archi 2D utilizzabili.",
    );
  const layerNames = new Set([
    ...segments.map((s) => s.layer),
    ...annotations.map((a) => a.layer),
  ]);
  const unit = units[Number(dxf.header?.$INSUNITS)];
  if (!unit)
    warnings.add(
      "Unità DXF non determinate: selezionare le unità o calibrare su una misura reale.",
    );
  return {
    sourceType: "dxf",
    filename,
    mimeType: "application/dxf",
    sizeBytes,
    segments,
    annotations,
    layers: [...layerNames].map((name) => ({
      name,
      count: segments.filter((s) => s.layer === name).length,
      visible:
        dxf.tables?.layer?.layers?.[name]?.visible !== false &&
        dxf.tables?.layer?.layers?.[name]?.frozen !== true,
    })),
    warnings: [...warnings],
    suggestedMetersPerUnit: unit?.[1] ?? null,
    unitLabel: unit?.[0] ?? "non dichiarate",
    background: null,
  };
}
