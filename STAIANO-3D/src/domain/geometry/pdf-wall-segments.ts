import type { ParsedPlan, PlanSegment } from "@/services/import/plan-types";
import { distance } from "./primitives";

/** PDF style is evidence, never a blanket ban on colored or thin architecture. */
export function pdfWallSegments(
  plan: ParsedPlan,
  includeThin = false,
): PlanSegment[] {
  if (plan.sourceType !== "pdf" || !plan.segments.some((s) => s.pdfStyle))
    return plan.segments;
  const straight = plan.segments.filter(
    (s) => !s.pdfStyle?.curved && !s.pdfStyle?.dash.length,
  );
  const neutral = (s: PlanSegment) => {
    const c = s.pdfStyle?.color ?? "#000000";
    const rgb = /^#[0-9a-f]{6}$/i.test(c)
      ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
      : [0, 0, 0];
    return Math.max(...rgb) - Math.min(...rgb) < 24;
  };
  const weights = new Map<number, number>();
  const maxSide = Math.max(
    plan.background?.widthPx ?? Infinity,
    plan.background?.heightPx ?? Infinity,
  );
  for (const s of straight) {
    const len = distance(s.start, s.end),
      width = s.pdfStyle?.width ?? 0;
    if (!neutral(s) || width <= 0 || len < 12 || len > maxSide * 0.75) continue;
    const key = Math.round(width * 100) / 100;
    weights.set(key, (weights.get(key) ?? 0) + len);
  }
  const dominant = [...weights].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const structural = straight.filter(
    (s) => neutral(s) && (s.pdfStyle?.width ?? 0) >= dominant * 0.98,
  );
  const hasStructure = structural.length >= 8;
  const xs = structural.flatMap((s) => [s.start.x, s.end.x]),
    ys = structural.flatMap((s) => [s.start.y, s.end.y]);
  const bounds = {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
  const pageArea =
    (plan.background?.widthPx ?? 0) * (plan.background?.heightPx ?? 0);
  const area = (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
  const crop =
    hasStructure &&
    pageArea > 0 &&
    area > pageArea * 0.05 &&
    area < pageArea * 0.8;
  const margin =
    Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top) * 0.05;
  return straight.filter((s) => {
    const style = s.pdfStyle;
    if (!style) return true;
    if (/^#f[0-9a-f]f[0-9a-f]f[0-9a-f]$/i.test(style.color)) return false;
    if (
      crop &&
      [s.start, s.end].some(
        (p) =>
          p.x < bounds.left - margin ||
          p.x > bounds.right + margin ||
          p.y < bounds.top - margin ||
          p.y > bounds.bottom + margin,
      )
    )
      return false;
    // Fine colored dimensions and page frames are retained in the original layer.
    if (
      hasStructure &&
      dominant > 0 &&
      (!includeThin || !neutral(s)) &&
      style.width < dominant * 0.65
    )
      return false;
    return true;
  });
}
