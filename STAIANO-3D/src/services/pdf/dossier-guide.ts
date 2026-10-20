import type { buildDossier } from "./dossier";
import { encryptDossier } from "./dossier-crypto";
import publicKey from "../../../dossier-guide/public-key.json";

export const DOSSIER_GUIDE_URL =
  "https://staiano-dossier.ivanbuonocore7.workers.dev/";

/** Only ciphertext leaves the app; the Worker's private key is never distributed. */
export async function dossierGuideLink(
  data: ReturnType<typeof buildDossier>,
  variant: "complete" | "summary",
  date: Date,
) {
  const p = data.project;
  const snapshot = {
    v: 1,
    n: p.name.slice(0, 120),
    d: date.toISOString(),
    k: variant,
    m: [
      p.rooms.length,
      data.totals.areaM2,
      data.totals.volumeM3,
      data.totals.loadW,
      p.hvacSystems.length,
      p.radiators.length,
      p.airTerminals.length,
      p.fanCoils?.length ?? 0,
      data.checks.filter((c) => c.status === "invalid").length,
      data.checks.filter((c) => c.status === "warning").length,
    ],
    r: p.rooms.slice(0, 12).map((r) => r.name.slice(0, 50)),
  };
  const encode = async () => {
    const stream = new Blob([JSON.stringify(snapshot)])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    return encryptDossier(bytes, publicKey.spki);
  };
  let fragment = await encode();
  // Keep printed modules large enough to scan, even with many long room names.
  if (fragment.length > 1250) {
    snapshot.r = [];
    fragment = await encode();
  }
  return `${DOSSIER_GUIDE_URL}#${fragment}`;
}
