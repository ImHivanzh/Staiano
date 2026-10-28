import { describe, expect, it } from "vitest";
import {
  fitSocialRoom,
  sampleSocialStops,
  SOCIAL_CLIP_SECONDS,
  SOCIAL_MAX_SHOTS,
  socialFrameFits,
  socialStops,
  socialView,
  type SocialHome,
} from "./social-shots";

const home: SocialHome = {
  target: [5, 1, 5],
  radius: 14,
  polar: 0.9,
  azimuth: 0.4,
};
const frame = { ahead: 0.8, radius: 4, polar: 1.4 };
// Il fronte guarda verso (-sin r, cos r): r = 0 → +z, r = -π/2 → +x.
const points = [
  socialView({ x: 2, y: 3 }, 0, 1.9, "Unità interna", frame),
  socialView({ x: 8, y: 6 }, -Math.PI / 2, 0.7, "Radiatore", frame),
];
const many = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    socialView({ x: i * 3, y: 2 + (i % 2) * 4 }, i, 1.4, `Scena ${i}`, frame),
  );
/** Velocità della camera (per canale) al secondo `t`, per differenze finite. */
const speed = (stops: ReturnType<typeof socialStops>, t: number) => {
  const eps = 0.001;
  const a = sampleSocialStops(stops, t - eps);
  const b = sampleSocialStops(stops, t + eps);
  return [
    ...[0, 1, 2].map((k) => (b.target[k] - a.target[k]) / (2 * eps)),
    (b.radius - a.radius) / (2 * eps),
    (b.azimuth - a.azimuth) / (2 * eps),
  ];
};

describe("regia del video social", () => {
  const stops = socialStops(home, points, "Titolo");
  it("parte dalla pianta vista dall'alto e termina in panoramica", () => {
    for (const path of [socialStops(home, []), stops]) {
      const start = sampleSocialStops(path, 0);
      const end = sampleSocialStops(path, SOCIAL_CLIP_SECONDS - 1e-6);
      expect(start.polar).toBeLessThan(0.15);
      expect(sampleSocialStops(path, 3.8).polar).toBeGreaterThan(0.6);
      expect(end.radius).toBeCloseTo(home.radius, 1);
      expect(end.polar).toBeCloseTo(home.polar, 2);
    }
  });
  it("passa davanti a ogni apparecchio, dal lato del fronte, con la didascalia", () => {
    for (const point of points) {
      const pass = stops.find((stop) => stop.label === point.label)!;
      const view = sampleSocialStops(stops, pass.t);
      expect(view.label).toBe(point.label);
      expect(view.alpha).toBeCloseTo(1, 5);
      expect(view.radius).toBeLessThan(home.radius / 3);
      // Camera dal lato del fronte: il suo spostamento ha componente positiva lungo il fronte.
      const front = point === points[0] ? [0, 1] : [1, 0];
      const toCamera = [Math.sin(view.azimuth), Math.cos(view.azimuth)];
      expect(toCamera[0] * front[0] + toCamera[1] * front[1]).toBeGreaterThan(
        0.5,
      );
    }
  });
  it("il titolo d'apertura compare in panoramica", () => {
    expect(sampleSocialStops(stops, 2).label).toBe("Titolo");
  });
  it("la didascalia di ogni scena resta abbastanza a lungo e nessuna si sovrappone", () => {
    const six = socialStops(home, many(7), "Titolo");
    const passes = six.filter((stop) => stop.window);
    expect(passes).toHaveLength(SOCIAL_MAX_SHOTS);
    for (const pass of passes) expect(pass.window! * 2).toBeGreaterThan(3);
    for (let k = 1; k < passes.length; k++)
      expect(passes[k].t - passes[k].window!).toBeGreaterThanOrEqual(
        passes[k - 1].t + passes[k - 1].window!,
      );
  });
  it("il percorso non si ferma mai e non si allarga tra una scena e l'altra", () => {
    const path = socialStops(home, many(SOCIAL_MAX_SHOTS), "Titolo");
    const scenes = path.filter((stop) => stop.window);
    // Tra due scene la camera non sale oltre la più lontana delle due (niente dezoom).
    for (let k = 1; k < scenes.length; k++)
      for (let u = 0; u <= 1; u += 0.1) {
        const t = scenes[k - 1].t + u * (scenes[k].t - scenes[k - 1].t);
        expect(sampleSocialStops(path, t).radius).toBeLessThan(
          Math.max(scenes[k - 1].radius, scenes[k].radius) * 1.15,
        );
      }
    // Dal primo all'ultimo passaggio la camera è sempre in movimento.
    for (let t = scenes[0].t; t <= scenes.at(-1)!.t; t += 0.25) {
      const v = speed(path, t);
      expect(Math.hypot(...v)).toBeGreaterThan(0.05);
    }
  });
  it("il moto è fluido: nessuno scatto di velocità tra una scena e l'altra", () => {
    const path = socialStops(home, many(SOCIAL_MAX_SHOTS), "Titolo");
    for (const stop of path.slice(1, -1)) {
      const before = speed(path, stop.t - 0.002);
      const after = speed(path, stop.t + 0.002);
      before.forEach((v, k) =>
        expect(Math.abs(after[k] - v)).toBeLessThan(0.15),
      );
    }
  });
  it("senza apparecchi resta una panoramica senza didascalie", () => {
    const plain = socialStops(home, []);
    for (let t = 0; t < SOCIAL_CLIP_SECONDS; t += 0.5)
      expect(sampleSocialStops(plain, t).label).toBe("");
  });
  it("due scene con la stessa didascalia non la condividono nello spostamento", () => {
    const twin = socialStops(
      home,
      [
        socialView({ x: 1, y: 1 }, 0, 1, "Radiatore", frame),
        socialView({ x: 9, y: 9 }, 0, 1, "Radiatore", frame),
      ],
      "",
    );
    const [a, b] = twin.filter((stop) => stop.window);
    expect(sampleSocialStops(twin, (a.t + b.t) / 2).label).toBe("");
  });
});

describe("panoramica di una stanza", () => {
  const target: [number, number, number] = [2.5, 1.5, 2];
  // Apparecchi agli angoli opposti di una stanza 5×4.
  const devices: [number, number, number][] = [
    [0.1, 2.3, 0.1],
    [4.9, 2.3, 3.9],
    [2.5, 0.7, 0.1],
  ];
  it("trova il raggio minimo con tutti gli apparecchi in quadro", () => {
    const view = fitSocialRoom(target, devices, 0.3, 0.85, 5, 22);
    expect(
      socialFrameFits(target, view.radius, 0.85, view.azimuth, devices),
    ).toBe(true);
    // Mezzo metro più vicino non basterebbe, ovunque guardi tra gli angoli provati.
    expect(view.radius).toBeGreaterThan(5);
    for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2])
      expect(
        socialFrameFits(target, view.radius - 0.5, 0.85, 0.3 + turn, devices),
      ).toBe(false);
  });
  it("un apparecchio fuori campo non è in quadro", () => {
    expect(socialFrameFits(target, 6, 0.85, 0.3, [[40, 1, 40]])).toBe(false);
  });
});
