/** Famiglia di ambiente dedotta da nome e destinazione: serve solo a colorare viste e planimetria. */
export const roomTones = [
  "living",
  "bedroom",
  "kitchen",
  "bath",
  "study",
  "passage",
  "other",
] as const;
export type RoomTone = (typeof roomTones)[number];

const patterns: [RoomTone, RegExp][] = [
  ["kitchen", /cucin|cottura|pranzo/],
  ["bath", /bagn|wc|servizi|lavander|doccia/],
  ["bedroom", /camer|letto|notte|stanza da letto|cameretta/],
  ["study", /studio|ufficio|uffici|lavoro/],
  [
    "passage",
    /corridoi|ingress|disimpegn|atrio|scala|vano|ripostigli|guardaroba/,
  ],
  ["living", /soggiorn|salotto|living|salone|giorno|sala/],
];

export function roomTone(name: string, usage = ""): RoomTone {
  const text = `${name} ${usage}`.toLowerCase();
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] ?? "other";
}

/** Colore pieno (puntini, indicatori) e tinta chiara (riempimento della pianta). */
export const roomToneColors: Record<RoomTone, { solid: string; soft: string }> =
  {
    living: { solid: "#d98a3d", soft: "#fbf0e2" },
    bedroom: { solid: "#7a6bc4", soft: "#f0edfa" },
    kitchen: { solid: "#d4614d", soft: "#fbebe7" },
    bath: { solid: "#2f9bb5", soft: "#e6f4f8" },
    study: { solid: "#3f8f6b", soft: "#e8f4ee" },
    passage: { solid: "#8a97a4", soft: "#f1f3f5" },
    other: { solid: "#6b7f95", soft: "#eff3f7" },
  };
