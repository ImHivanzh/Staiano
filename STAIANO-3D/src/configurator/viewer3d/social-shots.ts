/**
 * Durata del video social: sotto i 30 secondi, ma con il tempo di guardare ogni stanza e leggere la
 * didascalia. Apertura, tre scene, ritorno in panoramica e chiusura.
 */
export const SOCIAL_CLIP_SECONDS = 25;
/** Discesa d'apertura (dalla pianta vista dall'alto alla casa in 3D) e ritorno finale, in secondi. */
const INTRO_SECONDS = 3.8;
const OUTRO_SECONDS = 4.4;
/** Al massimo tre scene (una per stanza), più di cinque secondi l'una. */
export const SOCIAL_MAX_SHOTS = 3;
/** Inclinazione della prima inquadratura: quasi a piombo, la casa si legge come una pianta. */
const PLAN_POLAR = 0.08;

type Vec3 = [number, number, number];
/** Inquadratura dedicata a un apparecchio: dove guardare, da che lato e quanto vicino. */
export type SocialPoint = {
  position: Vec3;
  radius: number;
  polar: number;
  azimuth: number;
  label: string;
};
type Stop = {
  t: number;
  target: Vec3;
  radius: number;
  polar: number;
  azimuth: number;
  label?: string;
  /** Stessa chiave = stessa inquadratura: la didascalia resta mentre la camera ci scivola dentro. */
  key?: number;
  /** Secondi, prima e dopo `t`, in cui la didascalia di questo passaggio è visibile. */
  window?: number;
};
export type SocialHome = {
  target: Vec3;
  radius: number;
  polar: number;
  azimuth: number;
};

/** Orologio e didascalia condivisi tra la camera (che li scrive) e il registratore (che li disegna). */
/** `frame`: istante del fotogramma che si sta creando (secondi), quando il video si crea a passo fisso. */
export const socialClock = { start: 0, frame: null as number | null };
/** Secondi dall'inizio della regia: tempo reale in anteprima, tempo del fotogramma mentre si crea il video. */
export const socialTime = () =>
  socialClock.frame ?? (performance.now() - socialClock.start) / 1000;
export const socialCaption = { text: "", alpha: 0, age: 0 };
export const restartSocialClock = () => {
  socialClock.start = performance.now();
};

/**
 * Inquadratura di tre quarti davanti all'apparecchio (`rotation` come nel progetto: il fronte guarda
 * verso (-sin, cos)), così si vedono insieme il corpo e l'aria che esce, mai il retro né la cima.
 * `side` sposta il punto di vista di lato (radianti) per la seconda angolazione.
 */
export function socialView(
  at: { x: number; y: number },
  rotation: number,
  height: number,
  label: string,
  frame: { ahead: number; radius: number; polar: number; side?: number },
): SocialPoint {
  return {
    position: [
      at.x - Math.sin(rotation) * frame.ahead,
      height,
      at.y + Math.cos(rotation) * frame.ahead,
    ],
    radius: frame.radius,
    polar: frame.polar,
    azimuth: -rotation + (frame.side ?? 0),
    label,
  };
}

/** Camera della scena 3D (fov verticale 38°) nella colonna 9:16 del video. */
const HALF_TAN_V = Math.tan((38 / 2) * (Math.PI / 180));
const HALF_TAN_H = HALF_TAN_V * (9 / 16);

/**
 * Vero se tutti i punti stanno nella parte libera dell'inquadratura: fuori dal marchio in alto e dalla
 * didascalia in basso, con un margine ai lati. La camera guarda `target` da (`radius`, `polar`, `azimuth`).
 */
export function socialFrameFits(
  target: Vec3,
  radius: number,
  polar: number,
  azimuth: number,
  points: readonly Vec3[],
) {
  const offset: Vec3 = [
    radius * Math.sin(polar) * Math.sin(azimuth),
    radius * Math.cos(polar),
    radius * Math.sin(polar) * Math.cos(azimuth),
  ];
  const forward = offset.map((value) => -value / radius) as Vec3;
  // right = forward × su(0,1,0), poi su = right × forward
  const rightRaw: Vec3 = [-forward[2], 0, forward[0]];
  const rightLength = Math.hypot(rightRaw[0], rightRaw[2]) || 1;
  const right = rightRaw.map((value) => value / rightLength) as Vec3;
  const up: Vec3 = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return points.every((point) => {
    const v: Vec3 = [
      point[0] - target[0] - offset[0],
      point[1] - target[1] - offset[1],
      point[2] - target[2] - offset[2],
    ];
    const depth = dot(v, forward);
    if (depth < 0.5) return false;
    const x = dot(v, right) / depth / HALF_TAN_H;
    const y = dot(v, up) / depth / HALF_TAN_V;
    return Math.abs(x) <= 0.7 && y >= -0.2 && y <= 0.5;
  });
}

/**
 * Panoramica di una stanza: il raggio più piccolo (e l'angolo più vicino al fronte dell'apparecchio
 * principale) con cui tutti gli apparecchi stanno in quadro. Se non c'è, il raggio massimo.
 */
export function fitSocialRoom(
  target: Vec3,
  points: readonly Vec3[],
  azimuth: number,
  polar: number,
  minRadius: number,
  maxRadius: number,
) {
  for (let radius = minRadius; radius <= maxRadius; radius += 0.5)
    for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2])
      if (socialFrameFits(target, radius, polar, azimuth + turn, points))
        return { radius, azimuth: azimuth + turn };
  return { radius: maxRadius, azimuth };
}

const TURN = Math.PI * 2;
/** Stesso angolo, ma sul giro più vicino a `reference`: la camera ruota per la via breve. */
const unwrap = (angle: number, reference: number) =>
  angle + TURN * Math.round((reference - angle) / TURN);

/**
 * Regia: si apre sulla pianta vista dall'alto e la camera picchia ruotando fino alla casa in 3D (il
 * colpo d'occhio dei primi secondi, col titolo); poi una scena per stanza; infine ritorno in panoramica.
 */
export function socialStops(
  home: SocialHome,
  points: readonly SocialPoint[],
  hook = "",
  seconds = SOCIAL_CLIP_SECONDS,
): Stop[] {
  const wide = (
    t: number,
    azimuth: number,
    polarShare: number,
    radiusShare: number,
    label?: string,
  ): Stop => ({
    t,
    target: home.target,
    radius: home.radius * radiusShare,
    polar: home.polar * polarShare,
    azimuth,
    label,
    key: label ? -1 : undefined,
  });
  const shots = points.slice(0, SOCIAL_MAX_SHOTS);
  const stops: Stop[] = [
    wide(0, home.azimuth - 0.4, PLAN_POLAR / home.polar, 1.15, hook),
    wide(INTRO_SECONDS, home.azimuth + 0.4, 0.85, 0.8, hook),
  ];
  const last = () => stops[stops.length - 1];
  const pitch =
    (seconds - INTRO_SECONDS - OUTRO_SECONDS) / Math.max(1, shots.length);
  // Un solo passaggio per scena, a metà del suo tempo: la camera scorre da una stanza all'altra
  // senza fermarsi e senza allontanarsi, e la didascalia resta mentre le passa accanto.
  shots.forEach((point, index) => {
    stops.push({
      t: INTRO_SECONDS + pitch * (index + 0.5),
      target: point.position,
      radius: point.radius,
      polar: point.polar,
      azimuth: unwrap(point.azimuth, last().azimuth),
      label: point.label,
      key: index,
      window: Math.min(2.6, pitch * 0.45),
    });
  });
  // Il finale (coperto dalla chiusura) gira nello stesso verso dell'ultimo passaggio: invertire la
  // rotazione fermerebbe la camera sull'ultima stanza.
  const turn = Math.sign(last().azimuth - stops[stops.length - 2].azimuth) || 1;
  const end = last().azimuth + turn * 1.2;
  stops.push(
    wide(seconds - OUTRO_SECONDS * 0.45, end - turn * 0.3, 0.85, 1.02),
    wide(seconds, end, 1, 1),
  );
  return stops;
}

type Channel = (stop: Stop) => number;

/**
 * Pendenza della curva in `stops[i]`: media pesata (Fritsch-Butland) delle due pendenze vicine. Va a zero
 * dove il moto cambia verso e resta piccola se un lato è lento, quindi niente scatti né sbandate: la
 * velocità è continua in ogni punto di passaggio, tra una scena e l'altra compresa.
 */
function slopeAt(stops: readonly Stop[], i: number, value: Channel) {
  const before = stops[i - 1];
  const after = stops[i + 1];
  if (!before || !after) return 0;
  const h0 = stops[i].t - before.t;
  const h1 = after.t - stops[i].t;
  const d0 = (value(stops[i]) - value(before)) / h0;
  const d1 = (value(after) - value(stops[i])) / h1;
  if (d0 * d1 <= 0) return 0;
  const w0 = 2 * h1 + h0;
  const w1 = h1 + 2 * h0;
  return (w0 + w1) / (w0 / d0 + w1 / d1);
}

/** Posizione della camera al secondo `t` (modulo durata). */
export function sampleSocialStops(
  stops: readonly Stop[],
  t: number,
  seconds = SOCIAL_CLIP_SECONDS,
) {
  const time = ((t % seconds) + seconds) % seconds;
  let index = stops.findIndex((stop, i) => {
    const next = stops[i + 1];
    return next && time >= stop.t && time < next.t;
  });
  if (index < 0) index = stops.length - 2;
  const a = stops[index];
  const b = stops[index + 1];
  const h = Math.max(1e-6, b.t - a.t);
  const u = (time - a.t) / h;
  // La didascalia d'apertura resta tra due inquadrature uguali; quelle delle scene attorno al loro passaggio.
  const holding = !!a.label && a.key !== undefined && a.key === b.key;
  const passing = stops.find(
    (stop) => stop.window && Math.abs(time - stop.t) < stop.window,
  );
  // Interpolazione di Hermite: la camera non si ferma mai tra una scena e l'altra.
  const u2 = u * u;
  const u3 = u2 * u;
  const curve = (value: Channel) =>
    (2 * u3 - 3 * u2 + 1) * value(a) +
    (u3 - 2 * u2 + u) * h * slopeAt(stops, index, value) +
    (-2 * u3 + 3 * u2) * value(b) +
    (u3 - u2) * h * slopeAt(stops, index + 1, value);
  const shown = holding ? a : passing;
  const edge = holding
    ? Math.min(time - a.t, b.t - time)
    : passing
      ? passing.window! - Math.abs(time - passing.t)
      : 0;
  return {
    target: [0, 1, 2].map((k) => curve((stop) => stop.target[k])) as Vec3,
    radius: curve((stop) => stop.radius),
    polar: curve((stop) => stop.polar),
    azimuth: curve((stop) => stop.azimuth),
    label: shown?.label ?? "",
    alpha: shown ? Math.max(0, Math.min(1, edge / 0.7)) : 0,
    /** Secondi da quando la didascalia è comparsa (per l'animazione d'entrata del testo). */
    age: holding
      ? time - a.t
      : passing
        ? time - (passing.t - passing.window!)
        : 0,
  };
}
