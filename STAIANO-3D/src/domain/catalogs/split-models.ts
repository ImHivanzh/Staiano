import models from "../../../public/models/splits/manifest.json";

/** Only reconstructed wall families are eligible; ceiling and unknown units keep their renderer. */
export function splitWallModelUrl(family: string | undefined) {
  return models.find((model) => model.family === family)?.url ?? null;
}
