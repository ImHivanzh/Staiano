import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const validUsername = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_+.-]{1,128}$/.test(value);
const validToken = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_.-]{20,256}$/.test(value);
if (process.argv.includes("--self-test")) {
  assert(validUsername("gitlab+deploy-token-123"));
  assert(!validUsername("../user"));
  assert(validToken("a".repeat(40)));
  assert(!validToken(""));
  assert(!validToken("a".repeat(257)));
  assert(validToken("glpat-" + "x".repeat(24)));
  assert(!validToken("../token"));
  console.log("Controlli del trasferimento segreti superati.");
} else {
  const origin = "http://127.0.0.1:8788",
    nonce = randomBytes(32).toString("hex");
  let used = false;
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    if (request.method === "GET" && request.url === "/transfer.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(
        "document.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();document.querySelector('button').disabled=true;const result=await fetch('/',{method:'POST',body:new URLSearchParams(new FormData(event.target))});document.body.textContent=await result.text();});",
      );
      return;
    }
    if (request.method === "GET" && request.url === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(
        `<!doctype html><html lang="it"><title>Trasferimento segreto Cloudflare</title><script src="/transfer.js" defer></script><h1>Token GitLab di sola lettura</h1><p>Le credenziali del deploy token (read_repository e read_package_registry) vengono trasferite ai segreti GITLAB_READ_USERNAME e GITLAB_READ_TOKEN del Worker licenses. Non viene salvato localmente.</p><form method="post" action="/"><input type="hidden" name="nonce" value="${nonce}"><label>Username deploy token<input name="username" autocomplete="off" required></label><label>Token GitLab<input name="token" type="password" autocomplete="off" required></label><button>Salva esclusivamente su Cloudflare</button></form></html>`,
      );
      return;
    }
    if (
      request.method !== "POST" ||
      request.url !== "/" ||
      request.headers.origin !== origin ||
      used
    ) {
      response.writeHead(403);
      response.end("Richiesta non consentita.");
      return;
    }
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 4096) {
        response.writeHead(413);
        response.end();
        return;
      }
    }
    const fields = new URLSearchParams(body),
      token = fields.get("token"),
      username = fields.get("username");
    if (
      fields.get("nonce") !== nonce ||
      !validToken(token) ||
      !validUsername(username)
    ) {
      response.writeHead(400);
      response.end("Token non valido.");
      return;
    }
    used = true;
    try {
      for (const [key, value] of [
        ["GITLAB_READ_USERNAME", username],
        ["GITLAB_READ_TOKEN", token],
      ]) {
        execFileSync(
          process.execPath,
          [
            resolve("node_modules/wrangler/bin/wrangler.js"),
            "secret",
            "put",
            key,
            "-c",
            "license-server/wrangler.toml",
          ],
          { input: value, stdio: ["pipe", "inherit", "inherit"] },
        );
      }
      response.end(
        "Token salvato esclusivamente nel segreto Cloudflare. Questa pagina può essere chiusa.",
      );
    } catch {
      response.writeHead(500);
      response.end(
        "Trasferimento non riuscito. Il token non è stato salvato localmente.",
      );
    }
    server.close();
    clearTimeout(deadline);
  });
  server.listen(8788, "127.0.0.1", () =>
    console.log(`Trasferimento locale monouso pronto: ${origin}`),
  );
  const deadline = setTimeout(() => server.close(), 1800000);
}
