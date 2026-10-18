import type { RadiatorVariant } from "@/domain/catalogs/radiator-schema";
import { type RadiatorSolution, type RadiatorProgress } from "./size";
import {
  sizeRadiatorsAcrossFamilies,
  type RadiatorAutoConstraints,
} from "./auto";

/** Keep potentially large mixed searches off the editor's interaction thread. */
export function sizeRadiatorsInWorker(
  requiredW: number,
  catalog: RadiatorVariant[],
  deltaTK: number,
  constraints: RadiatorAutoConstraints,
  signal?: AbortSignal,
  onProgress?: (value: RadiatorProgress) => void,
): Promise<RadiatorSolution[]> {
  if (signal?.aborted)
    return Promise.reject(new DOMException("Ricerca annullata.", "AbortError"));
  if (typeof Worker === "undefined")
    return Promise.resolve(
      sizeRadiatorsAcrossFamilies(
        requiredW,
        catalog,
        deltaTK,
        constraints,
        onProgress,
      ),
    );
  return new Promise((resolve, reject) => {
    const worker = new Worker("/workers/size.worker.js");
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException("Ricerca annullata.", "AbortError"));
    };
    worker.onmessage = (
      event: MessageEvent<{
        solutions?: RadiatorSolution[];
        error?: string;
        progress?: RadiatorProgress;
      }>,
    ) => {
      if (event.data.progress) {
        onProgress?.(event.data.progress);
        return;
      }
      finish();
      if (event.data.solutions) resolve(event.data.solutions);
      else reject(new Error(event.data.error ?? "Ricerca radiatori fallita."));
    };
    worker.onerror = () => {
      finish();
      reject(new Error("Non è stato possibile dimensionare i radiatori."));
    };
    signal?.addEventListener("abort", abort, { once: true });
    worker.postMessage({ requiredW, catalog, deltaTK, constraints });
  });
}
