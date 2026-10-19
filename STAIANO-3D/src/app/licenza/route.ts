import { NextRequest } from "next/server";
import { buildInfo, licenseSetup, licenseStatus } from "@/server/license";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stateMessages: Record<string, string> = {
  "update-required":
    "Aggiornamento obbligatorio: installare l'ultima versione di Staiano HVAC. La licenza rimane attiva.",
  missing: "Nessuna licenza attiva su questa postazione.",
  revoked:
    "La licenza è stata disattivata dal server. Contattare l’assistenza.",
  unreachable:
    "Server licenze non raggiungibile: il configuratore resta bloccato finché la licenza non viene verificata.",
  unconfigured:
    "Server licenze non configurato su questa macchina: mancano LICENSE_SERVER_URL o la chiave pubblica.",
  invalid: "Licenza locale non valida per questa postazione.",
  expired: "Licenza scaduta. Contattare l’assistenza per il rinnovo.",
  "seats-exhausted":
    "Licenza già attiva su un’altra postazione. Disattivare quella precedente per spostarla.",
  active: "Licenza attiva.",
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

const formatDate = (value: number | null) =>
  value ? new Date(value).toLocaleString("it-IT") : "mai";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const [status, setup] = await Promise.all([licenseStatus(), licenseSetup()]);
  const build = buildInfo();
  const version = build.commit
    ? `${build.buildId} · ${build.commit.slice(0, 12)}`
    : build.buildId;
  const error = query.get("error") ?? "";
  const notice = query.get("ok")
    ? status.ok
      ? "Licenza attiva su questa postazione."
      : "Richiesta inviata: attendere l’esito della verifica."
    : query.get("released")
      ? "Postazione disattivata: la licenza è di nuovo libera per un’altra macchina."
      : query.get("refresh")
        ? "Verifica della licenza completata."
        : "";
  const requested = query.get("state") ?? "";
  const message = error
    ? error
    : notice
      ? notice
      : status.ok
        ? `Licenza attiva${status.customer ? ` per ${status.customer}` : ""}.`
        : stateMessages[requested] || status.message || stateMessages.missing;
  const tone = error || !status.ok ? " error" : " ok";
  const rows = [
    ["Cliente", status.customer ?? "—"],
    ["Piano", status.plan ?? "—"],
    ["Licenza", status.licenseId ?? "—"],
    ["Postazione", status.machineId],
    ["Ultima verifica", formatDate(status.lastVerifiedAt)],
    ["Versione installata", version],
    ["Server licenze", setup.serverUrl || "non configurato"],
    [
      "Controllo",
      setup.enforced
        ? `attivo (verifica ogni ${setup.checkMinutes} min, tolleranza ${setup.toleranceMinutes} min)`
        : "non attivo su questo server",
    ],
  ]
    .map(
      ([label, value]) =>
        `<div class="riga"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`,
    )
    .join("");
  const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Licenza — Staiano</title>
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
.message{font-size:14px;line-height:1.6;color:#516679;margin:12px 0 24px;overflow-wrap:anywhere}
.message.error{color:#a52b2b;background:#fdeeee;padding:12px;border-radius:6px}
.message.ok{color:#20502f;background:#eaf6ee;padding:12px;border-radius:6px}
.righe{margin:0 0 24px;border-top:1px solid #e2e9ef}
.riga{display:flex;gap:16px;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid #e2e9ef;font-size:13px}
.riga span{color:#516679;flex:none}
.riga strong{font-weight:600;text-align:right;overflow-wrap:anywhere}
label{display:block;font-size:13px;font-weight:600;margin-bottom:8px}
input{width:100%;min-height:50px;font:inherit;font-size:16px;color:#183249;background:#fff;border:1px solid #bac8d6;border-radius:6px;padding:12px;caret-color:#365aa8;letter-spacing:.06em;text-transform:uppercase}
input:focus{border-color:#365aa8;outline:2px solid #365aa8;outline-offset:3px}
button{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:50px;margin-top:24px;padding:12px 16px;border:0;border-radius:6px;background:#365aa8;color:#fff;font:600 14px Inter,system-ui;cursor:pointer}
button:hover{background:#294781}
button:focus-visible{outline:2px solid #365aa8;outline-offset:3px}
.access-note{font-size:12px;line-height:1.6;color:#516679;margin:28px 0 0}
.access-note a{color:#365aa8}
::selection{background:#c0cfea;color:#183249}
@media(max-width:740px){body{padding:20px}main{width:min(100%,480px);min-height:0;grid-template-columns:1fr}.identity{padding:24px 28px}.identity-copy,.identity .local-note{display:none}.brand{font-size:18px}.logo{width:44px;height:44px;padding:6px}.entry{padding:32px 28px}h1{font-size:26px}}
@media(max-width:380px){body{padding:12px}.identity{padding:20px}.entry{padding:28px 20px}}
</style></head>
<body><main>
<section class="identity" aria-label="Staiano HVAC">
  <div class="brand"><span class="logo"><img src="/logo.svg" width="52" height="52" alt=""></span><span>Staiano HVAC<small>Termoidraulica Staiano</small></span></div>
  <div class="identity-copy"><h2>Licenza collegata alla postazione.</h2><p>Il configuratore verifica la licenza con il server remoto e resta attivo solo sulla macchina autorizzata.</p></div>
  <p class="local-note">Assistenza: Termoidraulica Staiano.</p>
</section>
<section class="entry" aria-labelledby="license-title">
  <h1 id="license-title">${status.ok ? "Licenza" : "Attivazione licenza"}</h1>
  <p id="license-message" class="message${tone}"${tone.includes("error") ? ' role="alert"' : ""}>${escapeHtml(message)}</p>
  <div class="righe">${rows}</div>
  ${
    status.ok
      ? `<a class="fonte-catalogo" href="/" style="font-size:14px">Apri il configuratore</a><p class="access-note">La disattivazione e lo spostamento su un’altra postazione si gestiscono dalla sezione Licenza dell’amministratore.</p>`
      : `<form method="post" action="/api/license" aria-describedby="license-message">
    <input type="hidden" name="action" value="activate">
    <label for="licenseKey">Chiave di licenza</label>
    <input id="licenseKey" name="licenseKey" required autofocus autocomplete="off" spellcheck="false" placeholder="STAIANO-XXXXX-XXXXX-XXXXX-XXXXX" maxlength="40">
    <button type="submit">Attiva questa postazione</button>
  </form>
  <p class="access-note">Inserisci la chiave fornita con l’acquisto. La licenza resta legata a questa macchina finché non viene disattivata dal server.</p>`
  }
</section></main></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
    },
  });
}
