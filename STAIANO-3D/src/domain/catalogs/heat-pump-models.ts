import type { HeatPumpProduct } from "./heat-pump-schema";

/** Blender models in public/models/hvac, built by scripts/blender/heat-pump-outdoor-units.py. */
export function heatPumpModelUrl(
  product: Pick<
    HeatPumpProduct,
    "manufacturer" | "family" | "widthMm" | "heightMm"
  >,
): string | null {
  const { manufacturer, family, widthMm, heightMm } = product;
  let name: string | null = null;
  if (manufacturer === "Chaffoteaux" && /^ARIANEXT/.test(family))
    name = `chaffoteaux-arianext-${heightMm}`;
  else if (manufacturer === "Gree" && /^VERSATI III/.test(family))
    name = `gree-versati-iii-${heightMm}`;
  else if (manufacturer === "Gree" && family === "VERSATI V")
    name = `gree-versati-v-${heightMm}`;
  else if (manufacturer === "Daikin" && family === "Altherma 3 M")
    name = `daikin-altherma-3m-${widthMm}`;
  else if (manufacturer === "Daikin" && /^Altherma 3 (R|H HT)/.test(family))
    name = `daikin-altherma-3r-${widthMm}`;
  return name ? `/models/hvac/heat-pump-${name}.glb` : null;
}
