import { z } from "zod";
import raw from "../../../catalog-data/generated/split-series-presentation.json" with { type: "json" };
import { sourceMetadataSchema } from "./radiator-schema";
import type { SplitIndoor } from "./split-schema";

const seriesSchema = z.object({
  manufacturer: z.string().min(1),
  family: z.string().min(1),
  title: z.string().min(1),
  // Editorial commercial positioning; never a universal efficiency ranking.
  tier: z.number().int().positive(),
  features: z.array(z.string().min(1)),
  gains: z.array(z.string().min(1)),
  productPhoto: z.object({
    localPath: z.string().startsWith("/catalog-assets/splits/"),
    sourceUrl: z.url(),
    sha256: z.string().length(64),
    caption: z.string().min(1),
  }),
  sourceMetadata: sourceMetadataSchema,
});
export type SplitSeriesPresentation = z.infer<typeof seriesSchema>;
export const splitSeriesPresentations = z.array(seriesSchema).parse(raw);

export function splitPresentation(family: string, manufacturer?: string) {
  return (
    splitSeriesPresentations.find(
      (series) =>
        series.family === family &&
        (!manufacturer || series.manufacturer === manufacturer),
    ) ?? null
  );
}

/** Commercial series comparison is separate from model-specific equipment. */
export function splitUnitPresentation(
  unit: Pick<SplitIndoor, "family" | "manufacturer"> &
    Partial<Pick<SplitIndoor, "model">>,
): SplitSeriesPresentation | null {
  const series = splitPresentation(unit.family, unit.manufacturer);
  if (
    !series ||
    unit.family !== "MSZ-AY" ||
    !unit.model ||
    unit.model.includes("VGKP")
  )
    return series;
  // VGK is a different documented regional variant: do not inherit VGKP filtration.
  return {
    ...series,
    features: [
      "Filtro V-Blocking",
      "Plasma Quad Connect opzionale",
      "Wi-Fi integrato",
      "Self Clean Mode",
      "Dual Barrier Coating",
      "Timer settimanale",
    ],
    gains: [
      "Rispetto a Classic: Wi-Fi integrato, Self Clean e timer settimanale. La versione VGK propone V-Blocking e Plasma Quad Connect opzionale; Plasma Quad Plus è documentato per VGKP.",
    ],
    sourceMetadata: {
      ...splitPresentation("MSZ-HR", "Mitsubishi Electric")!.sourceMetadata,
      page: 52,
    },
  };
}
