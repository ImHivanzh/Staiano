import { NextRequest } from "next/server";
import {
  getAccessConfig,
  safeReturnPath,
  SESSION_COOKIE,
  verifySession,
} from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

export async function GET(request: NextRequest) {
  const next = safeReturnPath(request.nextUrl.searchParams.get("next"));
  let configured = true;
  try {
    const config = await getAccessConfig();
    if (verifySession(request.cookies.get(SESSION_COOKIE)?.value, config)) {
      return new Response(null, {
        status: 303,
        headers: { Location: next, "Cache-Control": "no-store" },
      });
    }
  } catch {
    configured = false;
  }
  const error = request.nextUrl.searchParams.get("error");
  const message = !configured
    ? "Accesso non configurato. Eseguire node scripts/configure-access.mjs sul server."
    : error === "limited"
      ? "Troppi tentativi. Attendi 15 minuti e riprova."
      : error === "invalid"
        ? "Password non corretta. Riprova."
        : "Inserisci la password per aprire il configuratore.";
  const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Accesso — Staiano</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#123047;background:#f4f7f9;min-height:100dvh;display:grid;place-items:center;padding:24px}main{width:min(100%,420px);background:#fff;border:1px solid #d8e2e8;border-top:4px solid #096a8e;padding:36px 32px;border-radius:8px}.brand{font-weight:800;letter-spacing:.06em;font-size:14px;color:#096a8e}h1{margin:24px 0 12px;font-size:28px;line-height:1.2}p{font-size:14px;line-height:1.6;color:#476174;margin:0 0 24px}.error{color:#a52b2b}label{display:block;font-size:14px;font-weight:700;margin-bottom:8px}input{width:100%;font:inherit;border:1px solid #8ba6b8;border-radius:4px;padding:12px;min-height:46px}input:focus{outline:3px solid #b3ddef;outline-offset:2px}button{width:100%;margin-top:20px;background:#096a8e;color:#fff;border:0;border-radius:4px;padding:13px;font:700 15px Arial;cursor:pointer}button:hover{background:#075772}button:focus-visible{outline:3px solid #b3ddef;outline-offset:3px}@media(max-width:440px){main{padding:28px 24px}}</style></head>
<body><main><div class="brand">STAIANO</div><h1>Accesso al configuratore</h1><p${error || !configured ? ' class="error" role="alert"' : ""}>${escapeHtml(message)}</p>${configured ? `<form action="/api/auth/login" method="post"><input type="hidden" name="next" value="${escapeHtml(next)}"><label for="password">Password</label><input id="password" name="password" type="password" required autofocus autocomplete="current-password" maxlength="256"><button type="submit">Accedi</button></form>` : ""}</main></body></html>`;
  return new Response(html, {
    status: configured ? 200 : 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
