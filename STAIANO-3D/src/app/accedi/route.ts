import { NextRequest } from "next/server";
import {
  getAccessConfig,
  getSessionUser,
  publicUser,
  safeReturnPath,
  SESSION_COOKIE,
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
  let changePassword = false;
  let displayName = "";
  let userOptions = "";
  try {
    const config = await getAccessConfig();
    const users = config.users
      ? config.users.filter((user) => !user.disabled).map(publicUser)
      : [{ username: "admin", displayName: "Ivan" }];
    userOptions = users
      .map(
        (user) =>
          `<option value="${escapeHtml(user.username)}">${escapeHtml(user.displayName)}</option>`,
      )
      .join("");
    const user = getSessionUser(
      request.cookies.get(SESSION_COOKIE)?.value,
      config,
    );
    changePassword =
      !!user &&
      (user.mustChangePassword ||
        request.nextUrl.searchParams.get("password") === "change");
    displayName = user?.displayName || "";
    if (user && !changePassword) {
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
        ? "Utente o password non corretti. Riprova."
        : error === "password"
          ? "Verifica la password attuale e scegli una nuova password diversa, fra 12 e 256 caratteri, uguale in entrambi i campi."
          : changePassword
            ? `${displayName}, scegli una password personale fra 12 e 256 caratteri per continuare.`
            : "Seleziona il tuo utente e inserisci la password per aprire il configuratore.";
  const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Accesso — Staiano</title>
<style>
@font-face{font-family:Inter;src:url("/fonts/Inter-Variable.woff2") format("woff2");font-weight:100 900;font-display:swap}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;padding:24px;display:grid;place-items:center;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#183249;background:#edf2f6}
main{width:min(100%,980px);min-height:600px;display:grid;grid-template-columns:0.9fr 1.1fr;overflow:hidden;border-radius:14px;background:#fff;box-shadow:0 12px 40px #18324912}
.identity{display:flex;flex-direction:column;padding:40px;background:#183249;color:#fff}
.brand{display:flex;align-items:center;gap:14px;font-size:20px;font-weight:650;letter-spacing:-.02em}
.logo{width:52px;height:52px;padding:8px;flex:none;display:grid;place-items:center;background:#fff;border-radius:12px}
.logo img{width:100%;height:100%;object-fit:contain}
.brand small{display:block;font-size:12px;font-weight:450;letter-spacing:0;color:#bbcfdf;margin-top:4px}
.identity-copy{margin:auto 0;padding:56px 0}
.identity h2{font-size:32px;line-height:1.2;letter-spacing:-.025em;font-weight:600;margin:0 0 20px;max-width:13ch;text-wrap:balance}
.identity p{font-size:14px;line-height:1.7;color:#bbcfdf;margin:0;max-width:30ch}
.identity .local-note{font-size:12px;margin-top:auto}
.entry{display:flex;flex-direction:column;justify-content:center;padding:48px 56px;min-width:0}
h1{font-size:28px;line-height:1.2;letter-spacing:-.025em;margin:0;font-weight:650;text-wrap:balance}
.message{font-size:14px;line-height:1.6;color:#516679;margin:12px 0 32px;overflow-wrap:anywhere}
.error{color:#a52b2b;background:#fdeeee;padding:12px;border-radius:6px}
label{display:block;font-size:13px;font-weight:600;margin-bottom:8px}
input,select{width:100%;min-height:50px;font:inherit;font-size:16px;color:#183249;background:#fff;border:1px solid #bac8d6;border-radius:6px;padding:12px;caret-color:#365aa8}
input:focus,select:focus{border-color:#365aa8;outline:2px solid #365aa8;outline-offset:3px}
button{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:50px;margin-top:24px;padding:12px 16px;border:0;border-radius:6px;background:#365aa8;color:#fff;font:600 14px Inter,system-ui;cursor:pointer}
button:hover{background:#294781}
button:focus-visible{outline:2px solid #365aa8;outline-offset:3px}
button svg{width:18px;height:18px;flex:none}
button.secondary{min-height:40px;margin-top:8px;background:transparent;color:#516679}
button.secondary:hover{background:#edf2f6;color:#183249}
.access-note{font-size:12px;line-height:1.6;color:#516679;margin:28px 0 0}
::selection{background:#c0cfea;color:#183249}
@media(max-width:740px){body{padding:20px}main{width:min(100%,480px);min-height:0;grid-template-columns:1fr}.identity{padding:24px 28px}.identity-copy,.identity .local-note{display:none}.brand{font-size:18px}.logo{width:44px;height:44px;padding:6px}.entry{padding:32px 28px}h1{font-size:26px}}
@media(max-width:380px){body{padding:12px}.identity{padding:20px}.entry{padding:28px 20px}h1{font-size:24px}}
</style></head>
<body><main>
<section class="identity" aria-label="Staiano HVAC">
  <div class="brand"><span class="logo"><img src="/logo.svg" width="52" height="52" alt=""></span><span>Staiano HVAC<small>Termoidraulica Staiano</small></span></div>
  <div class="identity-copy"><h2>Dal disegno all’impianto.</h2><p>Planimetrie 2D, vista 3D e cataloghi tecnici per configurare il tuo impianto.</p></div>
  <p class="local-note">Progetti salvati sul dispositivo.</p>
</section>
<section class="entry" aria-labelledby="access-title"><h1 id="access-title">${changePassword ? "Password personale" : "Accesso al configuratore"}</h1><p id="access-message" class="message${error || !configured ? " error" : ""}"${error || !configured ? ' role="alert"' : ""}>${escapeHtml(message)}</p>${configured ? (changePassword ? `<form action="/api/auth/change-password" method="post" aria-describedby="access-message"><input type="hidden" name="next" value="${escapeHtml(next)}"><label for="current">Password attuale</label><input id="current" name="currentPassword" type="password" required autofocus autocomplete="current-password" maxlength="256"><label for="password" style="margin-top:16px">Nuova password</label><input id="password" name="password" type="password" required autocomplete="new-password" minlength="12" maxlength="256"><label for="confirm" style="margin-top:16px">Ripeti nuova password</label><input id="confirm" name="confirmPassword" type="password" required autocomplete="new-password" minlength="12" maxlength="256"><button type="submit">Salva e continua</button></form><form action="/api/auth/logout" method="post"><button class="secondary" type="submit">Esci</button></form>` : `<form action="/api/auth/login" method="post" aria-describedby="access-message"><input type="hidden" name="next" value="${escapeHtml(next)}"><label for="username">Utente</label><select id="username" name="username" required autofocus autocomplete="username"><option value="" selected disabled>Seleziona utente</option>${userOptions}</select><label for="password" style="margin-top:16px">Password</label><input id="password" name="password" type="password" required autocomplete="current-password" maxlength="256"><button type="submit">Accedi <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button></form>`) : ""}<p class="access-note">Accesso riservato agli utenti autorizzati.</p></section></main></body></html>`;
  return new Response(html, {
    status: configured ? 200 : 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Staiano-Build": process.env.STAIANO_RELEASE_ID || "development",
    },
  });
}
