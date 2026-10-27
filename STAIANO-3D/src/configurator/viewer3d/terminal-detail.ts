import type { AirTerminalFamily } from "@/domain/catalogs/air-terminal-schema";
import { linearTerminalSlots, type DetailPart } from "./device-detail";

/** Family silhouettes reconstructed from the manufacturer's descriptions, not performance data. */
export function terminalPattern(family: AirTerminalFamily | null) {
  const name =
    `${family?.familyCode ?? ""} ${family?.name ?? ""}`.toLowerCase();
  if (family?.type === "linear") return "slots";
  if (/elicoidale/.test(name)) return "swirl";
  if (/forellinat/.test(name)) return "perforated";
  if (/multi.ugell|microugell/.test(name)) return "jets";
  if (/^edu/.test(name)) return "nozzle";
  // Foto Ecoclima: diffusori a pale radiali regolabili (EDRC, EDRCS, EDRF, EDRFB, EDFDS).
  if (/^(edr[cf]|edfds)/.test(name)) return "vanes";
  if (/coni|singolo cono|geometria/.test(name)) return "cones";
  if (family?.type === "valve" || /^edsc|piastra di fondo chiusa/.test(name))
    return "valve";
  if (/maglia|rete/.test(name)) return "grid";
  // Foto Ecoclima: bocchette a doppia deflessione, barre orizzontali e verticali.
  if (/^(eba|ebv|ebcv|ebia)$/.test(family?.familyCode?.toLowerCase() ?? ""))
    return "grid";
  if (family?.type === "diffuser")
    return family.shape === "circle" ? "cones" : "four-way";
  return "slats";
}

function frame(w: number, h: number, t: number, z: number): DetailPart[] {
  return [
    { position: [0, h / 2 - t / 2, z], scale: [w, t, 1] },
    { position: [0, -h / 2 + t / 2, z], scale: [w, t, 1] },
    { position: [-w / 2 + t / 2, 0, z], scale: [t, h - 2 * t, 1] },
    { position: [w / 2 - t / 2, 0, z], scale: [t, h - 2 * t, 1] },
  ];
}

export function terminalFaceDetail(
  family: AirTerminalFamily | null,
  variant: AirTerminalFamily["variants"][number] | undefined,
  w: number,
  h: number,
  z: number,
  circular: boolean,
) {
  const pattern = variant?.slotCount ? "slots" : terminalPattern(family);
  const t = Math.min(0.012, h * 0.1, w * 0.1);
  const white: DetailPart[] = circular ? [] : frame(w, h, t, z);
  const dark: DetailPart[] = [];
  const holes: DetailPart[] = [];
  const rings: DetailPart[] = circular
    ? [{ position: [0, 0, z], scale: [w / 2, h / 2, 1] }]
    : [];
  const discs: DetailPart[] = [];
  let plate = false;
  if (pattern === "slots") {
    plate = true;
    dark.push(
      ...linearTerminalSlots(
        {
          slotCount: variant?.slotCount ?? 1,
          slotWidthMm: variant?.slotWidthMm ?? 20,
        },
        w,
        h,
        z,
      ),
    );
  } else if (pattern === "swirl") {
    plate = true;
    const side = Math.min(w, h);
    // Foto EDE1: feritoie radiali su due corone concentriche (la corona interna sfalsata).
    for (const [count, radius, length, offset] of [
      [16, 0.36, 0.16, 0],
      [12, 0.2, 0.12, 0.5],
    ] as const)
      for (let i = 0; i < count; i++) {
        const angle = ((i + offset) * 2 * Math.PI) / count;
        dark.push({
          position: [
            Math.cos(angle) * side * radius,
            Math.sin(angle) * side * radius,
            z,
          ],
          scale: [side * 0.03, side * length, 1],
          rotation: [0, 0, angle - Math.PI / 2],
        });
      }
  } else if (pattern === "perforated") {
    plate = true;
    const columns = Math.min(16, Math.max(3, Math.round(w / 0.015)));
    const rows = Math.min(16, Math.max(3, Math.round(h / 0.015)));
    const radius = Math.min((w - t * 2) / columns, (h - t * 2) / rows) * 0.2;
    for (let x = 0; x < columns; x++)
      for (let y = 0; y < rows; y++) {
        const px = ((x + 0.5) / columns - 0.5) * (w - t * 2);
        const py = ((y + 0.5) / rows - 0.5) * (h - t * 2);
        if (!circular || Math.hypot(px / (w / 2), py / (h / 2)) < 0.82)
          holes.push({ position: [px, py, z], scale: [radius, radius, 1] });
      }
  } else if (pattern === "jets") {
    plate = true;
    // Foto EDQMQ, EDMP-P, EDMF-S: file di fori piccoli e fitti, non pochi dischi grandi.
    const columns = Math.min(14, Math.max(2, Math.round(w / 0.04)));
    const rows = Math.min(14, Math.max(1, Math.round(h / 0.04)));
    const radius = Math.min((w - t * 2) / columns, (h - t * 2) / rows) * 0.3;
    for (let x = 0; x < columns; x++)
      for (let y = 0; y < rows; y++) {
        const position: [number, number, number] = [
          ((x + 0.5) / columns - 0.5) * (w - t * 2),
          ((y + 0.5) / rows - 0.5) * (h - t * 2),
          z,
        ];
        rings.push({ position, scale: [radius, radius, 1] });
        holes.push({ position, scale: [radius, radius, 1] });
      }
  } else if (pattern === "vanes") {
    // Pale bianche radiali su fondo scuro con mozzo centrale.
    const side = Math.min(w, h);
    if (!circular)
      dark.push({ position: [0, 0, z], scale: [w - t * 2, h - t * 2, 1] });
    const count = 12;
    for (let i = 0; i < count; i++) {
      const angle = (i * 2 * Math.PI) / count;
      white.push({
        position: [
          Math.cos(angle) * side * 0.27,
          Math.sin(angle) * side * 0.27,
          z,
        ],
        scale: [side * 0.11, side * 0.34, 1],
        rotation: [0, 0, angle - Math.PI / 2],
      });
    }
    discs.push({ position: [0, 0, z], scale: [side * 0.1, side * 0.1, 1] });
  } else if (pattern === "cones" || pattern === "nozzle") {
    plate = !circular;
    const radius = Math.min(w, h) * 0.44;
    holes.push({ position: [0, 0, z], scale: [radius, radius, 1] });
    for (const factor of pattern === "cones" ? [1, 0.72, 0.46] : [1, 0.62])
      rings.push({
        position: [0, 0, z + (1 - factor) * 0.002],
        scale: [radius * factor, radius * factor, 1],
      });
  } else if (pattern === "valve") {
    if (circular)
      discs.push({ position: [0, 0, z], scale: [w * 0.31, h * 0.31, 1] });
    else {
      dark.push({ position: [0, 0, z], scale: [w - t * 2, h - t * 2, 1] });
      white.push({ position: [0, 0, z], scale: [w * 0.72, h * 0.72, 1] });
    }
  } else if (pattern === "four-way") {
    dark.push({ position: [0, 0, z], scale: [w - t * 2, h - t * 2, 1] });
    for (const factor of [0.78, 0.54, 0.3])
      white.push(...frame(w * factor, h * factor, t * 0.8, z));
    white.push({ position: [0, 0, z], scale: [w * 0.17, h * 0.17, 1] });
  } else {
    if (!circular)
      dark.push({ position: [0, 0, z], scale: [w - t * 2, h - t * 2, 1] });
    const count = Math.min(32, Math.max(3, Math.round(h / 0.018)));
    for (let i = 1; i < count; i++) {
      const y = (i / count - 0.5) * (h - t * 2);
      const width = circular
        ? w * 0.88 * Math.sqrt(1 - (y / (h / 2)) ** 2)
        : w - t * 2;
      white.push({
        position: [0, y, z],
        scale: [width, Math.min(0.004, (h / count) * 0.3), 1],
      });
    }
    if (pattern === "grid") {
      const columns = Math.min(32, Math.max(3, Math.round(w / 0.025)));
      for (let i = 1; i < columns; i++) {
        const x = (i / columns - 0.5) * (w - t * 2);
        white.push({
          position: [x, 0, z],
          scale: [
            0.003,
            circular ? h * 0.88 * Math.sqrt(1 - (x / (w / 2)) ** 2) : h - t * 2,
            1,
          ],
        });
      }
    }
  }
  return { pattern, white, dark, holes, rings, discs, plate };
}
