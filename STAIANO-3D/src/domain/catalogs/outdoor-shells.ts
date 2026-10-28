import shells from "../../../public/models/outdoor/manifest.json";

export type OutdoorShell = "compatta" | "alta" | "larga";

/** Size class of the reconstructed split/VRV casing; the viewer fits the saved dimensions to it. */
export function outdoorShellClass(widthM: number, heightM: number): OutdoorShell {
  if (widthM > 1.2) return "larga";
  return heightM > 0.75 ? "alta" : "compatta";
}

export function outdoorShellUrl(shell: OutdoorShell) {
  return shells.find((entry) => entry.shell === shell)!.url;
}

/** Fan plate of the casing models: width fraction and left offset (m), as built in outdoor-unit-shells.py. */
export function outdoorFanPlate(widthM: number) {
  return { width: widthM * (widthM < 1.2 ? 0.78 : 0.86), left: -widthM / 2 + 0.012 };
}

/** Fan discs of a casing model, in the unit frame (origin at the centre): radius and centres (m). Shared by the viewer and its per-model test. */
export function outdoorFanLayout(widthM: number, heightM: number) {
  const plate = outdoorFanPlate(widthM),
    footHeight = Math.min(0.03, heightM * 0.1),
    wide = widthM > 1.2 && heightM <= 1.3,
    tall = heightM > 1.3,
    bodyHeight = heightM - footHeight - 0.032,
    radius = Math.min(wide ? plate.width * 0.23 : plate.width * 0.46, (bodyHeight * 0.46) / (tall ? 2 : 1)),
    centreX = plate.left + plate.width / 2;
  const centres: [number, number][] = tall
    ? [-heightM * 0.23, heightM * 0.23].map((y) => [centreX, y] as [number, number])
    : wide
      ? [[centreX - plate.width * 0.25, 0], [centreX + plate.width * 0.25, 0]]
      : [[centreX, footHeight / 2]];
  return { radius, centres, footHeight };
}
