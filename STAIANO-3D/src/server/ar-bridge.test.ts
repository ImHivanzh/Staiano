import { afterAll, beforeAll, expect, it } from "vitest";
import { createArLink, isLanAddress, validateItems } from "./ar-bridge";

const model = "/models/stoves/nordica-ketty-50-bianco.glb";
const items = [
  { label: "Ketty 50", variants: [{ label: "Bianco", url: model }] },
];
const base = (link: { port: number; token: string }) =>
  `http://127.0.0.1:${link.port}/ar/${link.token}`;

beforeAll(() => {
  process.env.STAIANO_AR_PORT = "0";
});
afterAll(() => {
  delete process.env.STAIANO_AR_PORT;
});

it("serve pagina, libreria e modello solo con il token", async () => {
  const link = await createArLink(items);
  const page = await fetch(base(link));
  expect(page.status).toBe(200);
  expect(await page.text()).toContain("<model-viewer");
  const glb = await fetch(`${base(link)}/m/0/0.glb`);
  expect(glb.headers.get("content-type")).toBe("model/gltf-binary");
  expect((await glb.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  expect((await fetch(`${base(link)}/mv.js`)).status).toBe(200);
  expect((await fetch(`${base(link)}/m/0/9.glb`)).status).toBe(404);
  expect((await fetch(`${base(link)}x`)).status).toBe(404);
  expect((await fetch(`http://127.0.0.1:${link.port}/`)).status).toBe(404);
});

it("il link scade", async () => {
  const link = await createArLink(items, 50);
  expect((await fetch(base(link))).status).toBe(200);
  await new Promise((done) => setTimeout(done, 120));
  expect((await fetch(base(link))).status).toBe(404);
});

it("rifiuta percorsi fuori dai modelli", () => {
  for (const url of [
    "/models/../package.json",
    "/models/stoves/x.txt",
    "/models/stoves/non-esiste.glb",
    "/public/models/stoves/nordica-ketty-50-bianco.glb",
  ])
    expect(() =>
      validateItems([{ label: "x", variants: [{ label: "x", url }] }]),
    ).toThrow();
});

it("accetta solo indirizzi di rete locale", () => {
  for (const ok of [
    "192.168.1.5",
    "10.0.0.2",
    "172.20.1.1",
    "::ffff:192.168.0.9",
    "127.0.0.1",
  ])
    expect(isLanAddress(ok)).toBe(true);
  for (const no of ["8.8.8.8", "172.32.0.1", "2001:db8::1", undefined])
    expect(isLanAddress(no)).toBe(false);
});
