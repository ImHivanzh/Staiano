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
