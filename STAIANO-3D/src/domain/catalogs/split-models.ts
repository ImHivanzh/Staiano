import models from "../../../public/models/splits/manifest.json";
import cassettes from "../../../public/models/cassettes/manifest.json";

/** Only reconstructed wall families are eligible; ceiling and unknown units keep their renderer. */
export function splitWallModelUrl(family: string | undefined) {
  return models.find((model) => model.family === family)?.url ?? null;
}

/** Reconstructed ceiling cassettes; unknown cassette families keep the procedural renderer. */
export function cassetteModelUrl(family: string | undefined) {
  return cassettes.find((model) => model.family === family)?.url ?? null;
}
