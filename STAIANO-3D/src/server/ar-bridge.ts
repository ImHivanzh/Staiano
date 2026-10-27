import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";

/** Ponte AR: porta separata, aperta solo mentre esiste almeno un link valido. */
export const AR_TTL_MS = 30 * 60 * 1000;

export type ArVariant = { label: string; url: string; glb?: Buffer };
export type ArItem = { label: string; variants: ArVariant[] };
export class ArBridgeError extends Error {}

type Link = { expiresAt: number; items: ArItem[] };
type State = {
  links: Map<string, Link>;
  server: Server | null;
  starting: Promise<void> | null;
};

const MODEL_URL = /^\/models\/[a-z0-9][a-z0-9_/-]*\.glb$/i;
const state: State = ((globalThis as Record<symbol, State>)[
  Symbol.for("staiano.arBridge")
] ??= { links: new Map(), server: null, starting: null });
const publicFile = (path: string) =>
  resolve(/* turbopackIgnore: true */ process.cwd(), "public", path);

export function validateItems(value: unknown): ArItem[] {
  if (!Array.isArray(value) || !value.length || value.length > 8)
    throw new ArBridgeError("Elenco modelli non valido.");
  return value.map((raw) => {
    const item = raw as Partial<ArItem> | null;
    if (
      !item ||
      typeof item.label !== "string" ||
      !Array.isArray(item.variants) ||
      !item.variants.length ||
      item.variants.length > 40
    )
      throw new ArBridgeError("Modello non valido.");
    return {
      label: item.label.slice(0, 120),
      variants: item.variants.map((variant: Partial<ArVariant>) => {
        if (
          typeof variant?.label !== "string" ||
          typeof variant.url !== "string" ||
          !MODEL_URL.test(variant.url) ||
          !existsSync(publicFile(variant.url.slice(1)))
        )
          throw new ArBridgeError("Modello 3D non disponibile.");
        return { label: variant.label.slice(0, 80), url: variant.url };
      }),
    };
  });
}

/** Indirizzi IPv4 privati della postazione, schede virtuali in fondo. */
export function lanAddresses(): string[] {
  const found: { address: string; rank: number }[] = [];
  for (const [name, list] of Object.entries(networkInterfaces()))
    for (const entry of list ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      const [a, b] = entry.address.split(".").map(Number);
      const rank =
        (/vethernet|virtualbox|vmware|wsl|docker|hyper-v|vpn/i.test(name)
          ? 10
          : 0) +
        (a === 192 && b === 168
          ? 0
          : a === 10
            ? 1
            : a === 172 && b >= 16 && b <= 31
              ? 2
              : 99);
      if (rank < 99) found.push({ address: entry.address, rank });
    }
  return found.sort((x, y) => x.rank - y.rank).map((entry) => entry.address);
}

export function isLanAddress(address?: string) {
  const value = (address ?? "").replace(/^::ffff:/, "");
  return (
    value === "::1" ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      value,
    ) ||
    /^(f[cd][0-9a-f]{2}:|fe80:)/i.test(value)
  );
}

const html = (token: string, link: Link) => {
  const data = JSON.stringify({
    token,
    expiresAt: link.expiresAt,
    items: link.items.map((item) => ({
      label: item.label,
      variants: item.variants.map((variant) => variant.label),
    })),
  }).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><title>Staiano · Realtà aumentata</title>
<style>
:root{color-scheme:light dark;font:16px/1.4 system-ui,sans-serif}
body{margin:0;display:grid;grid-template-rows:auto 1fr auto;min-height:100dvh;background:Canvas;color:CanvasText}
header,footer{padding:12px 16px}
h1{font-size:19px;margin:0}
p{margin:2px 0;opacity:.7;font-size:14px}
model-viewer{width:100%;height:100%;min-height:50dvh;background:#e9ecef;--poster-color:transparent}
button,select{font:inherit;padding:10px 14px;border-radius:10px;border:1px solid #8886;background:Canvas;color:CanvasText}
button[aria-pressed=true]{background:#1f5eff;border-color:#1f5eff;color:#fff}
.ar{position:absolute;right:12px;bottom:12px;background:#1f5eff;color:#fff;border-color:#1f5eff;font-weight:600}
#variants{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
</style>
<body>
<header><h1 id="title"></h1><p>Appoggia il telefono sul pavimento: il modello compare a grandezza reale.</p></header>
<model-viewer id="mv" ar ar-modes="webxr scene-viewer quick-look" ar-scale="fixed" camera-controls touch-action="pan-y" shadow-intensity="1" environment-image="neutral" alt="Modello 3D"><button slot="ar-button" class="ar">Vedi nella stanza (AR)</button></model-viewer>
<footer><select id="item" hidden aria-label="Modello"></select><div id="variants"></div><div id="tools" style="margin-top:8px"><button id="flame" hidden aria-pressed="false">Accendi fiamma</button></div><p id="left"></p></footer>
<script type="module" src="/ar/${token}/mv.js"></script>
<script type="module">
const D=${data},$=id=>document.getElementById(id),mv=$("mv");
let item=0,variant=0,flame=false,glass=[],tex=null,raf=0;
const select=$("item");
D.items.forEach((x,i)=>select.add(new Option(x.label,i)));
select.hidden=D.items.length<2;
select.onchange=()=>{item=+select.value;variant=0;draw()};
function draw(){
  $("title").textContent=D.items[item].label;
  const box=$("variants");box.replaceChildren();
  D.items[item].variants.forEach((label,i)=>{const b=document.createElement("button");b.textContent=label;b.setAttribute("aria-pressed",i===variant);b.onclick=()=>{variant=i;draw()};box.append(b)});
  const src="/ar/"+D.token+"/m/"+item+"/"+variant+".glb";
  if(mv.getAttribute("src")!==src)mv.setAttribute("src",src);
}
function paint(){
  cancelAnimationFrame(raf);
  if(!flame){glass.forEach(m=>m.setEmissiveFactor([0,0,0]));return}
  const t=performance.now()/1000,k=.8+.12*Math.sin(t*11)+.08*Math.sin(t*23+1);
  glass.forEach(m=>m.setEmissiveFactor([k,k*.85,k*.6]));
  raf=requestAnimationFrame(paint);
}
mv.addEventListener("load",async()=>{
  glass=mv.model.materials.filter(m=>/vetro/i.test(m.name));
  $("flame").hidden=!glass.length;
  try{tex=tex||await mv.createTexture("/ar/"+D.token+"/flame.png");glass.forEach(m=>m.emissiveTexture.setTexture(tex))}catch{}
  paint();
});
$("flame").onclick=e=>{flame=!flame;e.target.setAttribute("aria-pressed",flame);e.target.textContent=flame?"Spegni fiamma":"Accendi fiamma";paint()};
const tick=()=>{const s=Math.max(0,Math.round((D.expiresAt-Date.now())/1000));
  if(!s){document.body.innerHTML="<p style='padding:24px'>Link scaduto. Genera un nuovo link dal computer.</p>";clearInterval(timer);return}
  $("left").textContent="Link valido ancora "+Math.floor(s/60)+" min · solo rete locale"};
const timer=setInterval(tick,1000);tick();draw();
</script>`;
};

const FILES: Record<string, [string, string]> = {
  "mv.js": ["vendor/model-viewer/model-viewer.min.js", "text/javascript"],
  "flame.png": ["models/flame.png", "image/png"],
};
const headers = (type: string) => ({
  "Content-Type": type,
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
});

async function handle(request: IncomingMessage, response: ServerResponse) {
  const fail = (status: number, text: string) => {
    response.writeHead(status, headers("text/plain; charset=utf-8")).end(text);
  };
  if (!isLanAddress(request.socket.remoteAddress))
    return fail(403, "Solo rete locale.");
  if (request.method !== "GET") return fail(405, "Metodo non consentito.");
  const parts = new URL(request.url ?? "/", "http://ponte").pathname
    .split("/")
    .filter(Boolean);
  const link = parts[0] === "ar" ? state.links.get(parts[1] ?? "") : undefined;
  if (!link || link.expiresAt <= Date.now()) return fail(404, "Link scaduto.");
  const rest = parts.slice(2);
  if (!rest.length)
    return void response
      .writeHead(200, headers("text/html; charset=utf-8"))
      .end(html(parts[1], link));
  const file = rest.length === 1 ? FILES[rest[0]] : undefined;
  let path = file?.[0];
  let type = file?.[1];
  if (rest[0] === "m" && rest.length === 3) {
    const variant =
      link.items[Number(rest[1])]?.variants[
        Number(rest[2].replace(/\.glb$/, ""))
      ];
    if (variant?.glb)
      return void response
        .writeHead(200, headers("model/gltf-binary"))
        .end(variant.glb);
    if (variant) [path, type] = [variant.url.slice(1), "model/gltf-binary"];
  }
  if (!path || !type) return fail(404, "Non trovato.");
  try {
    response
      .writeHead(200, headers(type))
      .end(await readFile(publicFile(path)));
  } catch {
    if (!response.headersSent) fail(404, "Non trovato.");
  }
}

function listen(): Promise<void> {
  if (state.server?.listening) return Promise.resolve();
  state.starting ??= new Promise<void>((done, reject) => {
    const server = createServer((request, response) => {
      handle(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(500).end();
      });
    });
    const port = Number(process.env.STAIANO_AR_PORT ?? 3016);
    server.once("error", (error: NodeJS.ErrnoException) => {
      state.starting = null;
      reject(
        new ArBridgeError(
          error.code === "EADDRINUSE"
            ? `Porta ${port} occupata: imposta STAIANO_AR_PORT.`
            : "Impossibile aprire il ponte AR sulla rete locale.",
        ),
      );
    });
    server.listen(port, "0.0.0.0", () => {
      state.server = server;
      state.starting = null;
      done();
    });
  });
  return state.starting;
}

/** Casa intera esportata dal browser: il GLB vive solo in memoria, per la durata del link. */
export async function createArHouseLink(
  label: string,
  glb: Buffer,
  ttlMs = AR_TTL_MS,
) {
  if (glb.length < 12 || glb.toString("latin1", 0, 4) !== "glTF")
    throw new ArBridgeError("Modello 3D della casa non valido.");
  return register(
    [{ label: label.slice(0, 120), variants: [{ label: "Casa", url: "", glb }] }],
    ttlMs,
  );
}

export async function createArLink(items: unknown, ttlMs = AR_TTL_MS) {
  return register(validateItems(items), ttlMs);
}

async function register(checked: ArItem[], ttlMs: number) {
  await listen();
  const token = randomBytes(24).toString("base64url");
  const expiresAt = Date.now() + ttlMs;
  state.links.set(token, { expiresAt, items: checked });
  setTimeout(() => {
    state.links.delete(token);
    if (!state.links.size) {
      state.server?.close();
      state.server?.closeAllConnections();
      state.server = null;
    }
  }, ttlMs).unref();
  const address = state.server?.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { token, expiresAt, port, hosts: lanAddresses() };
}
