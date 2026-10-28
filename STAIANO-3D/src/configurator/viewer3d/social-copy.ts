/**
 * Testi del video social. Chi scorre il telefono non legge dati: niente numeri, potenze né metri
 * quadri. Ogni titolo dice cosa cambia per chi abita la casa, in poche parole, ed è vero per quella
 * stanza (tipo di apparecchio, soffitto o parete, finestra). Voce: dà del "tu", frasi corte, niente
 * esclamazioni né promesse. La didascalia è "NOME STANZA\nTitolo" (titolo entro ~28 caratteri: in
 * grande sta in due righe). Il negozio è una termoidraulica con showroom (impianti, bagni, sanitari,
 * piastrelle): la chiusura porta lì. Niente marchi né recapiti che non conosciamo.
 *
 * Le varianti sono molte apposta: in un video lo stesso messaggio non compare mai due volte, e
 * progetti diversi pescano testi diversi (vedi `socialScript`).
 */
export type SocialKind = "split" | "grille" | "radiator" | "generic";
/** Cosa si vede in una stanza, dal progetto: serve a scrivere una didascalia che la riguardi davvero. */
export type SocialFacts = {
  splits: number;
  grilles: number;
  radiators: number;
  /** Bocchette montate a soffitto (altrimenti a parete). */
  ceiling: boolean;
  /** Un termosifone sta sotto una finestra. */
  underWindow: boolean;
};
/** Una scena del video: la stanza e cosa ci si vede (`generic` se ci sono apparecchi di tipi diversi). */
export type SocialScene = {
  kind: SocialKind;
  room: string;
  /** Primo piano di un apparecchio in una stanza già mostrata: stesso nome, senza numero. */
  detail?: boolean;
  facts?: SocialFacts;
};

/** Apertura, mentre la camera scende dalla pianta vista dall'alto alla casa in 3D. */
const HOOKS = [
  "DALLA PIANTA\nAlla casa vera",
  "PRIMA DEI LAVORI\nCasa tua, già finita",
  "IN ANTEPRIMA\nCasa tua, prima del cantiere",
  "PROGETTO 3D\nEntra in casa tua",
  "NIENTE SORPRESE\nVedi tutto prima",
  "PRIMA DI INSTALLARE\nGuardalo funzionare",
  "DALLA CARTA\nAl comfort di casa tua",
  "GUARDA BENE\nQuesta casa non esiste ancora",
  "CASA TUA\nPrima ancora di iniziare",
  "IMMAGINA\nQuesta è casa tua, domani",
] as const;

/** Schermata finale: sotto il nome del negozio, e l'invito che porta dal video al negozio. */
export const SOCIAL_TAGLINE = "Impianti · Bagni · Sanitari · Piastrelle";
const INVITES = [
  "Vieni a trovarci in showroom",
  "Ti aspettiamo in showroom",
  "Passa in showroom: lo progettiamo insieme",
  "Vieni a vederlo dal vivo",
  "Vieni a trovarci in negozio",
  "In showroom anche bagni e piastrelle",
  "Passa a trovarci, ti mostriamo il progetto",
  "Parliamone in showroom",
  "Ti aspettiamo per sceglierlo insieme",
  "Scegli con noi, in showroom",
  "Vieni in showroom con la tua pianta",
  "Vediamo insieme il tuo progetto",
] as const;

type Line = (facts: SocialFacts, heating: boolean) => string | undefined;

const SPLIT: readonly Line[] = [
  (_, heating) => (heating ? "Caldo dove ti serve" : "Fresco dove ti serve"),
  () => "Pavimento libero",
  (_, heating) =>
    heating
      ? "Aria calda in tutta la stanza"
      : "Aria fresca in tutta la stanza",
  (f) => (f.splits > 1 ? "Nessun angolo dimenticato" : undefined),
];
const GRILLE: readonly Line[] = [
  () => "Si sente, non si vede",
  (f) => (f.ceiling ? "L'aria scende dall'alto" : "L'aria entra dalle pareti"),
  () => "Nessuna macchina in vista",
  (f) => (f.grilles > 1 ? "Nessun angolo dimenticato" : undefined),
];
const RADIATOR: readonly Line[] = [
  (f) => (f.underWindow ? "Sotto la finestra, contro il freddo" : undefined),
  () => "Il caldo che sale piano",
  () => "Caldo in tutta la stanza",
  (f) => (f.radiators > 1 ? "Nessun angolo al freddo" : undefined),
];
/** Stanze con apparecchi di tipi diversi. */
const MIXED: readonly Line[] = [
  (f) =>
    f.splits && f.radiators ? "Caldo d'inverno, fresco d'estate" : undefined,
  () => "Tutto in un solo progetto",
  () => "Ogni stanza ha la sua aria",
];
/** Riserva calma e vera per ogni caso, anche per i primi piani. */
const GENERIC = [
  "Visto da vicino",
  "Ogni dettaglio al suo posto",
  "Esattamente così, in casa tua",
  "Già al suo posto",
  "Proprio qui",
  "Così, prima di installarlo",
] as const;

const linesFor = (kind: SocialKind): readonly Line[] =>
  kind === "split"
    ? SPLIT
    : kind === "grille"
      ? GRILLE
      : kind === "radiator"
        ? RADIATOR
        : MIXED;

/** Numero stabile dal testo (FNV-1a): stesso progetto, stesso video; progetti diversi, testi diversi. */
const hashOf = (text: string) => {
  let hash = 2166136261;
  for (const char of text)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
};

/**
 * Primo testo a partire da `start` che non ripete né il testo né la riga breve di uno già usato
 * (due "INVERNO" di fila sembrerebbero la stessa frase).
 */
const fresh = (pool: readonly string[], start: number, used: Set<string>) => {
  for (let step = 0; step < pool.length; step++) {
    const text = pool[(start + step) % pool.length];
    const kicker = text.split("\n")[0];
    if (!used.has(text) && !used.has(kicker)) {
      used.add(text).add(kicker);
      return text;
    }
  }
};
/** Se anche la riserva è finita, ripete dal primo (più scene che testi: non succede coi limiti attuali). */
const pick = (
  pool: readonly string[],
  start: number,
  used: Set<string>,
  backup: readonly string[] = pool,
) =>
  fresh(pool, start, used) ??
  fresh(backup, start, used) ??
  (pool.length ? pool : backup)[start % (pool.length || backup.length)];

/** Titolo di una scena: un fatto della stanza se lo conosciamo, altrimenti la riserva. */
const headline = (
  scene: SocialScene,
  heating: boolean,
  start: number,
  used: Set<string>,
) => {
  const own = scene.facts
    ? linesFor(scene.kind)
        .map((line) => line(scene.facts!, heating))
        .filter((text): text is string => !!text)
    : [];
  return pick(own, start, used, GENERIC);
};

/** Nome della stanza come riga breve: maiuscolo, corto, e col numero se due stanze si chiamano uguale. */
const roomTitle = (name: string, seen: Map<string, number>, detail = false) => {
  const base = name.trim().toUpperCase().slice(0, 22).trim() || "LA TUA CASA";
  if (detail) return base;
  const count = (seen.get(base) ?? 0) + 1;
  seen.set(base, count);
  return count > 1 ? `${base} ${count}` : base;
};

/**
 * Copione di un video: apertura, una didascalia per scena (nell'ordine di `scenes`) e invito finale.
 * Nessun testo si ripete nel video; se le frasi di una stanza finiscono si passa alla riserva.
 */
export function socialScript(
  scenes: readonly SocialScene[],
  heating: boolean,
  seed: string,
) {
  const base = hashOf(seed);
  const used = new Set<string>();
  const seen = new Map<string, number>();
  const hook = pick(HOOKS, base, used);
  const captions = scenes.map(
    (scene, index) =>
      `${roomTitle(scene.room, seen, scene.detail)}\n${headline(scene, heating, (base >>> 3) + index * 5, used)}`,
  );
  return { hook, captions, invite: pick(INVITES, base >>> 5, used) };
}
