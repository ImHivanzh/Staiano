import { createHash } from "node:crypto";

/** Ritenta solo errori transitori; una revisione diversa non sostituisce la fonte archiviata. */
export async function downloadCatalogSource(document) {
  const url = new URL(document.sourceUrl);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("protocollo della fonte non supportato");
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    let content;
    try {
      response = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 StaianoHVAC-CatalogImporter/1.0",
          Accept: "*/*",
        },
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`HTTP ${response.status}`);
      }
      content = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      const transient =
        !response ||
        response.ok ||
        [408, 429, 500, 502, 503, 504].includes(response.status);
      if (!transient || attempt === 2) throw error;
      const retryAfter = response?.headers.get("retry-after");
      const delay =
        retryAfter == null
          ? 1000 * 2 ** attempt
          : Math.min(
              10000,
              Math.max(
                0,
                /^\d+$/.test(retryAfter)
                  ? Number(retryAfter) * 1000
                  : Date.parse(retryAfter) - Date.now(),
              ),
            );
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Number.isFinite(delay) ? delay : 1000 * 2 ** attempt,
        ),
      );
      continue;
    }
    const hash = createHash("sha256").update(content).digest("hex");
    if (hash !== document.sha256.toLowerCase())
      throw new Error(
        `contenuto diverso da quello del catalogo (atteso ${document.sha256.slice(0, 8)}, ricevuto ${hash.slice(0, 8)})`,
      );
    return { content, contentType: response.headers.get("content-type") ?? "" };
  }
}
