import type { RadiatorVariant } from "@/domain/catalogs/radiator-schema";
import {
  sizeRadiatorsAcrossFamilies,
  type RadiatorAutoConstraints,
} from "./auto";

self.onmessage = (
  event: MessageEvent<{
    requiredW: number;
    catalog: RadiatorVariant[];
    deltaTK: number;
    constraints: RadiatorAutoConstraints;
  }>,
) => {
  const { requiredW, catalog, deltaTK, constraints } = event.data;
  try {
    self.postMessage({
      solutions: sizeRadiatorsAcrossFamilies(
        requiredW,
        catalog,
        deltaTK,
        constraints,
        (progress) => self.postMessage({ progress }),
      ),
    });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "Dimensionamento radiatori fallito.",
    });
  }
};
