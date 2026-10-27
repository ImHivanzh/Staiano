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

/** Garda's reversible collector pair is shown on the right in its standard installation. */
export function radiatorConnectionXs(
  item: Pick<
    Project["radiators"][number],
    "widthMm" | "manufacturer" | "family"
  >,
  variant: RadiatorVariant | null,
): [number, number] {
  const edge = Math.max(0, item.widthMm / 2000 - 0.025);
  if (
    variant?.manufacturer === "Lazzarini" &&
    item.manufacturer === "Lazzarini" &&
    variant.family.startsWith("Garda ") &&
    item.family === variant.family &&
    item.widthMm === variant.pitchMm
  )
    return [edge - variant.interaxisMm / 1000, edge];
  return [-edge, edge];
}

/** Visual construction only. Installed catalogue dimensions remain authoritative. */
export function radiatorDetail(
  radiator: Pick<
    Project["radiators"][number],
    "widthMm" | "heightMm" | "depthMm" | "elements" | "manufacturer" | "family"
  >,
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
    const nova =
      variant.manufacturer === "Zehnder"
        ? variant.code?.match(/^ZNV(LV|V|L)?-\d{3}-(\d{3})-/)
        : null;
    if (nova) {
      const profiles = Number(nova[2]);
      const double = nova[1] === "V" || nova[1] === "LV";
      const finned = nova[1] === "L" || nova[1] === "LV";
      const profileWidth = Math.min(0.07, (w - 0.004) / profiles);
      const profileDepth = Math.min(0.008, d / 4);
      const rows = double
        ? [d / 2 - profileDepth / 2, -d / 2 + profileDepth / 2]
        : [d / 2 - profileDepth / 2];
      for (const z of rows) {
        for (let i = 0; i < profiles; i++)
          result.sections.push({
            position: [
              (i / (profiles - 1) - 0.5) * (w - profileWidth - 0.004),
              0,
              z,
            ],
            scale: [profileWidth, h - 0.004, profileDepth],
          });
      }
      for (const y of [-h / 2 + 0.019, h / 2 - 0.019])
        result.headers.push({
          position: [0, y, 0],
          scale: [Math.min(0.019, d / 2), w, Math.min(0.019, d / 2)],
          rotation: [0, 0, Math.PI / 2],
        });
      if (finned)
        for (let i = 0; i < profiles * 4; i++)
          result.fins.push({
            position: [
              ((i + 0.5) / (profiles * 4) - 0.5) * w,
              0,
              -profileDepth / 2,
            ],
            scale: [0.001, h - 0.08, Math.max(0.001, d - profileDepth * 2)],
          });
      return result;
    }
    const garda =
      variant.manufacturer === "Lazzarini" &&
      variant.family.startsWith("Garda ");
    const sanremo =
      variant.manufacturer === "Lazzarini" &&
      variant.family.startsWith("Sanremo ");
    const barCounts: Record<number, number> = garda
      ? { 700: 17, 1132: 25, 1708: 35 }
      : { 690: 14, 803: 17, 1110: 22, 1230: 25, 1420: 28, 1703: 35 };
    const bars = barCounts[variant.heightMm];
    if ((garda || sanremo) && bars) {
      const radius = garda ? 0.0175 : 0.02;
      const xs = garda
        ? radiatorConnectionXs(radiator, variant)
        : [-w / 2 + 0.025, w / 2 - 0.025];
      for (const x of xs)
        result.tubes.push({
          position: [x, 0, 0],
          scale: [radius, h, garda ? radius : 0.015],
        });
      const tubeRadius = garda ? 0.0125 : 0.011;
      const groups = garda
        ? (
            { 700: [9, 8], 1132: [9, 7, 9], 1708: [10, 5, 5, 5, 10] } as Record<
              number,
              number[]
            >
          )[variant.heightMm]
        : [Math.ceil(bars * 0.65), bars - Math.ceil(bars * 0.65)];
      // shortcut: tube counts and diameters are documented; gap spacing is illustrative until pitch drawings are available.
      const gap = Math.min(0.09, h * 0.09);
      const spacing =
        (h - 0.05 - tubeRadius * 2 - gap * (groups.length - 1)) / (bars - 1);
      let ordinal = 0;
      groups.forEach((size, group) => {
        for (let i = 0; i < size; i++, ordinal++) {
          const y =
            -h / 2 + 0.025 + tubeRadius + ordinal * spacing + group * gap;
          result.tubes.push({
            position: [0, y, 0],
            scale: [tubeRadius, w - tubeRadius * 2, tubeRadius],
            rotation: [0, 0, Math.PI / 2],
          });
          for (const x of [-w / 2 + tubeRadius, w / 2 - tubeRadius])
            result.caps.push({
              position: [x, y, 0],
              scale: [tubeRadius, tubeRadius, tubeRadius],
            });
        }
      });
      return result;
    }
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
        // Foto Cordivari (Claudia): collettori laterali piatti, più profondi che larghi.
        const collectorDepth = Math.min(radius * 1.6, d / 2);
        result.tubes.push({
          position: [x, 0, 0],
          scale: [radius, h - 2 * radius, collectorDepth],
        });
        for (const y of [-h / 2 + radius, h / 2 - radius])
          result.caps.push({
            position: [x, y, 0],
            scale: [radius, radius, collectorDepth],
          });
      }
      const bars = Math.max(4, Math.round(h / 0.055));
      // shortcut: foto Cordivari Naike/Anna/Lucy/Gloria (barre a fasce) e Samira (lamelle piatte); numero e passo delle fasce sono illustrativi, le schede non li riportano.
      const flat = variant.family.startsWith("Samira");
      const bands = flat
        ? 3
        : /^(Naike|Anna|Lucy|Gloria)/.test(variant.family)
          ? 5
          : 1;
      const bandGap = bands > 1 ? 0.05 : 0;
      const spacing = (h - radius * 4 - bandGap * (bands - 1)) / (bars - 1);
      for (let i = 0; i < bars; i++) {
        const y =
          -h / 2 +
          radius * 2 +
          i * spacing +
          Math.floor((i * bands) / bars) * bandGap;
        if (flat)
          result.sections.push({
            position: [0, y, 0],
            scale: [
              w - radius * 2,
              Math.min(radius * 4, spacing * 0.8),
              d * 0.5,
            ],
          });
        else
          result.tubes.push({
            position: [0, y, 0],
            scale: [radius * 0.7, w - radius * 2, radius * 0.7],
            rotation: [0, 0, Math.PI / 2],
          });
      }
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
  if (
    variant?.manufacturer === "Global" &&
    ["VIP", "OSCAR", "OSCAR TONDO"].includes(variant.family)
  ) {
    const headHeight = Math.min(0.04, h * 0.08);
    for (const y of [-h / 2 + headHeight / 2, h / 2 - headHeight / 2])
      result.headers.push({
        position: [0, y, 0],
        scale: [headHeight / 2, w, d / 2],
        rotation: [0, 0, Math.PI / 2],
      });
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * pitch;
      result.sections.push({
        position: [x, 0, d / 2 - 0.008],
        scale: [pitch - 0.0015, h - headHeight, 0.016],
      });
      // Foto Global OSCAR TONDO: pannelli piani a tutta altezza, senza calotte tonde per elemento.
      for (const y of [-h / 2 + headHeight / 2, h / 2 - headHeight / 2])
        result.sections.push({
          position: [x, y, 0],
          scale: [pitch - 0.0015, headHeight, d],
        });
      for (const side of [-1, 1])
        result.fins.push({
          position: [x + side * pitch * 0.3, 0, -0.004],
          scale: [0.003, h - headHeight * 2, d - 0.008],
        });
    }
    return result;
  }
  const ardesia = radiator.family.toLowerCase().includes("ardesia");
  const charleston =
    variant?.manufacturer === "Zehnder" &&
    variant.family.startsWith("Charleston ");
  const tamara = variant?.family.startsWith("Tamara") ?? false;
  const tubular = ardesia || variant?.visualShape === "tubular";
  // A missing historic column count is never inferred from the product identifier.
  const columns = tubular ? variant?.columns : null;
  // Schede Cordivari Ardesia 2–6 colonne, p.1: tubi Ø25 mm.
  const radius = Math.min(
    (ardesia && radiator.manufacturer === "Cordivari") || charleston
      ? 0.0125
      : pitch * 0.24,
    pitch / 2,
    d / ((columns ?? 1) * 2),
    h / 8,
  );
  const headerRadius = Math.min(h * 0.03, d / 2, pitch * 0.35);
  const headerY =
    (ardesia || charleston) && variant
      ? variant.interaxisMm / 2000
      : h / 2 - headerRadius;
  for (const y of tamara ? [] : [-headerY, headerY])
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
  for (const x of tamara ? [] : [-plugX, plugX])
    result.plugs.push({
      position: [x, headerY, 0],
      scale: [headerRadius * 0.7, headerRadius / 2, headerRadius * 0.7],
      rotation: [0, 0, Math.PI / 2],
    });
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * pitch;
    if (columns) {
      if (charleston)
        for (const y of [-h / 2 + 0.0225, h / 2 - 0.0225])
          result.sections.push({
            position: [x, y, 0],
            scale: [pitch * 0.78, 0.045, d],
          });
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
    } else if (tamara) {
      // Foto Cordivari Tamara: tubi ovali verticali a testa tonda, separati, senza collettori tondi.
      result.tubes.push({
        position: [x, 0, 0],
        scale: [pitch * 0.42, h - d, d / 2],
      });
      for (const y of [-1, 1])
        result.caps.push({
          position: [x, y * (h / 2 - d / 2), 0],
          scale: [pitch * 0.42, d / 2, d / 2],
        });
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
