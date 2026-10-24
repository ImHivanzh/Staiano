import { decryptDossier, readLimited } from "./decrypt";

const worker = {
  async fetch(
    request: Request,
    env: {
      ASSETS: { fetch(request: Request): Promise<Response> };
      DOSSIER_PRIVATE_KEY?: string;
    },
  ) {
    if (new URL(request.url).pathname === "/api/dossier") {
      const headers = {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      };
      if (request.method !== "POST")
        return new Response(
          JSON.stringify({ error: "Usa il QR del dossier." }),
          { status: 405, headers: { ...headers, Allow: "POST" } },
        );
      if (!env.DOSSIER_PRIVATE_KEY)
        return new Response(
          JSON.stringify({
            error: "Servizio temporaneamente non disponibile.",
          }),
          { status: 503, headers },
        );
      try {
        if (!request.body) throw Error("body");
        const envelope = new TextDecoder().decode(
          await readLimited(request.body, 3000),
        );
        const snapshot = await decryptDossier(
          envelope,
          env.DOSSIER_PRIVATE_KEY,
        );
        return new Response(JSON.stringify(snapshot), { headers });
      } catch {
        return new Response(
          JSON.stringify({
            error: "QR non valido o non leggibile. Consulta il PDF ricevuto.",
          }),
          { status: 400, headers },
        );
      }
    }
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Metodo non consentito", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    return response;
  },
};
export default worker;
