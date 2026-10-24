import type { Project } from "@/schemas/project";
import type { RadiatorVariant } from "@/domain/catalogs/radiator-schema";
import type { AirTerminalVariant } from "@/domain/catalogs/air-terminal-schema";

export type DetailPart = {
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
};
export function linearTerminalSlots(
  variant: Pick<AirTerminalVariant, "slotCount" | "slotWidthMm">,
  widthM: number,
  heightM: number,
  z: number,
): DetailPart[] {
  if (!variant.slotCount) return [];
  const frame = Math.min(0.012, heightM * 0.1, widthM * 0.1);
  const spacing = (heightM - frame * 2) / variant.slotCount;
  const slotHeight = Math.min(
    (variant.slotWidthMm ?? 20) / 1000,
    spacing * 0.8,
  );
  return Array.from({ length: variant.slotCount }, (_, i) => ({
    position: [0, -heightM / 2 + frame + spacing * (i + 0.5), z],
    scale: [widthM - 2 * frame, slotHeight, 1],
  }));
}
export type RadiatorDetail = {
  tubes: DetailPart[];
  caps: DetailPart[];
  sections: DetailPart[];
  headers: DetailPart[];
  fins: DetailPart[];
  plugs: DetailPart[];
  mirrors: DetailPart[];
};

/** Visual construction only. Installed catalogue dimensions remain authoritative. */
export function radiatorDetail(
  radiator: Project["radiators"][number],
  variant: RadiatorVariant | null,
): RadiatorDetail {
  const w = radiator.widthMm / 1000,
    h = radiator.heightMm / 1000,
    d = radiator.depthMm / 1000,
    count = radiator.elements,
    pitch = Math.min(
      variant?.pitchMm ? variant.pitchMm / 1000 : w / count,
      w / count,
    ),
    result: RadiatorDetail = {
      tubes: [],
      caps: [],
      sections: [],
      headers: [],
      fins: [],
      plugs: [],
      mirrors: [],
    };
  if (variant?.construction === "fixed") {
    const empoliProfiles =
      variant.manufacturer === "Lazzarini" &&
      variant.family.startsWith("Empoli ")
        ? variant.pitchMm === 600
          ? 4
          : variant.pitchMm === 750
            ? 6
            : 0
        : 0;
    if (empoliProfiles) {
      // Empoli sheet p.2: 70×11 mm profiles, Ø35 collectors, 4/6 elements; mirror gaps are illustrative.
      const profileWidth = 0.07,
        profileDepth = 0.011,
        gap = 0.005;
      const sideCount = empoliProfiles / 2;
      for (const side of [-1, 1])
        for (let i = 0; i < sideCount; i++)
          result.sections.push({
            position: [
              side * (w / 2 - profileWidth / 2 - i * (profileWidth + gap)),
              0,
              d / 2 - profileDepth / 2,
            ],
            scale: [profileWidth, h, profileDepth],
          });
      const radius = 0.0175;
      for (const y of [-h / 2 + radius, h / 2 - radius])
        result.headers.push({
          position: [0, y, d / 2 - profileDepth - radius],
          scale: [radius, w - profileWidth, radius],
          rotation: [0, 0, Math.PI / 2],
        });
      result.mirrors.push({
        position: [0, 0, d / 2 - 0.001],
        scale: [w - empoliProfiles * (profileWidth + gap), h - gap * 2, 1],
      });
      return result;
    }
    if (variant.visualShape === "towel") {
      const radius = Math.min(d * 0.22, w * 0.025, 0.018);
      for (const x of [-w / 2 + radius, w / 2 - radius]) {
        result.tubes.push({
          position: [x, 0, 0],
          scale: [radius, h - 2 * radius, radius],
        });
        for (const y of [-h / 2 + radius, h / 2 - radius])
          result.caps.push({
            position: [x, y, 0],
            scale: [radius, radius, radius],
          });
      }
      const bars = Math.max(4, Math.round(h / 0.055));
      for (let i = 0; i < bars; i++)
        result.tubes.push({
          position: [
            0,
            -h / 2 + radius * 2 + (i * (h - radius * 4)) / (bars - 1),
            0,
          ],
          scale: [radius * 0.7, w - radius * 2, radius * 0.7],
          rotation: [0, 0, Math.PI / 2],
        });
      return result;
    }
    const slats = Math.max(1, Math.round(w / 0.055)),
      spacing = w / slats;
    for (let i = 0; i < slats; i++)
      result.sections.push({
        position: [(i - (slats - 1) / 2) * spacing, 0, 0],
        scale: [spacing * 0.82, h, d],
      });
    return result;
  }
  const ardesia = radiator.family.toLowerCase().includes("ardesia");
  const tubular = ardesia || variant?.visualShape === "tubular";
  // A missing historic column count is never inferred from the product identifier.
  const columns = tubular ? variant?.columns : null;
  // Schede Cordivari Ardesia 2–6 colonne, p.1: tubi Ø25 mm.
  const radius = Math.min(
    ardesia && radiator.manufacturer === "Cordivari" ? 0.0125 : pitch * 0.24,
    pitch / 2,
    d / ((columns ?? 1) * 2),
    h / 8,
  );
  const headerRadius = Math.min(h * 0.03, d / 2, pitch * 0.35);
  const headerY =
    ardesia && variant ? variant.interaxisMm / 2000 : h / 2 - headerRadius;
  for (const y of [-headerY, headerY])
    result.headers.push({
      position: [0, y, 0],
      scale: [headerRadius, w, Math.min(d / 2, headerRadius * 1.5)],
      rotation: [0, 0, Math.PI / 2],
    });
  // Visible end plugs stay inside the source envelope; no invented external piping.
  const plugX =
    ardesia && variant
      ? Math.min((count * pitch) / 2, w / 2 - headerRadius / 4)
      : w / 2 - headerRadius / 4;
  for (const x of [-plugX, plugX])
    result.plugs.push({
      position: [x, headerY, 0],
      scale: [headerRadius * 0.7, headerRadius / 2, headerRadius * 0.7],
      rotation: [0, 0, Math.PI / 2],
    });
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * pitch;
    if (columns) {
      for (let j = 0; j < columns; j++) {
        const z =
          columns === 1
            ? 0
            : -d / 2 + radius + (j * (d - radius * 2)) / (columns - 1);
        result.tubes.push({
          position: [x, 0, z],
          scale: [radius, h - 2 * radius, radius],
        });
        for (const y of [-h / 2 + radius, h / 2 - radius])
          result.caps.push({
            position: [x, y, z],
            scale: [radius, radius, radius],
          });
      }
    } else {
      result.sections.push({
        position: [x, 0, d * 0.22],
        scale: [pitch * 0.78, h, d * 0.56],
      });
      // Rear convection fins and inter-element gaps make aluminium sections legible.
      for (const z of [-d * 0.48, -d * 0.24, 0])
        result.fins.push({
          position: [x, 0, z],
          scale: [pitch * 0.93, h * 0.88, d * 0.04],
        });
    }
  }
  return result;
}
