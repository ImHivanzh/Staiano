import { describe, expect, it } from "vitest";
import {
  socialScript,
  type SocialFacts,
  type SocialScene,
} from "./social-copy";

const rooms = ["Soggiorno", "Cucina", "Camera", "Bagno", "Studio"];
const factsFor = (kind: SocialScene["kind"], index: number): SocialFacts => ({
  splits: kind === "split" || kind === "generic" ? 1 + (index % 2) : 0,
  grilles: kind === "grille" ? 2 + index : 0,
  radiators: kind === "radiator" || kind === "generic" ? 1 + (index % 3) : 0,
  ceiling: index % 2 === 0,
  underWindow: index === 1,
});
const scenes = (kinds: SocialScene["kind"][]): SocialScene[] =>
  kinds.map((kind, index) => ({
    kind,
    room: rooms[index],
    facts: factsFor(kind, index),
  }));
const SETS = [
  scenes(["split", "split", "split", "split", "split"]),
  scenes(["grille", "grille", "grille", "grille", "grille"]),
  scenes(["radiator", "radiator", "generic", "generic", "radiator"]),
  scenes(["split", "grille", "radiator", "generic", "split"]),
  scenes(["generic", "generic", "generic", "generic", "generic"]),
];
const kickerOf = (text: string) => text.split("\n")[0];
const titleOf = (text: string) => text.split("\n")[1];

describe("copione video social", () => {
  it("non ripete mai un titolo né l'apertura nello stesso video", () => {
    for (const set of SETS)
      for (const heating of [false, true])
        for (let n = 0; n < 200; n++) {
          const script = socialScript(set, heating, `progetto-${n}`);
          const texts = [script.hook, ...script.captions.map(titleOf)];
          expect(new Set(texts).size).toBe(texts.length);
          expect(script.captions.map(kickerOf)).toEqual(
            set.map((scene) => scene.room.toUpperCase()),
          );
        }
  });

  it("numera le stanze con lo stesso nome e riempie quelle senza nome", () => {
    const { captions } = socialScript(
      [
        { kind: "split", room: "Camera" },
        { kind: "split", room: " camera " },
        { kind: "split", room: "" },
      ],
      false,
      "x",
    );
    expect(captions.map(kickerOf)).toEqual([
      "CAMERA",
      "CAMERA 2",
      "LA TUA CASA",
    ]);
  });

  it("senza dati della stanza usa solo la riserva, senza ripetere", () => {
    const { captions } = socialScript(
      [
        { kind: "split", room: "A" },
        { kind: "split", room: "B" },
        { kind: "split", room: "C" },
      ],
      false,
      "x",
    );
    expect(new Set(captions.map(titleOf)).size).toBe(3);
  });

  it("niente dati tecnici: nessun numero né unità di misura nei titoli", () => {
    for (const set of SETS)
      for (const heating of [false, true])
        for (let n = 0; n < 200; n++) {
          const { captions } = socialScript(set, heating, `v${n}`);
          for (const caption of captions)
            expect(titleOf(caption)).not.toMatch(/\d|kW|m²|BTU/);
        }
  });

  it("dice solo cose vere della stanza: soffitto, pareti, finestra, stagioni", () => {
    for (const set of SETS)
      for (const heating of [false, true])
        for (let n = 0; n < 200; n++) {
          const { captions } = socialScript(set, heating, `v${n}`);
          captions.forEach((caption, index) => {
            const title = titleOf(caption);
            const facts = set[index].facts!;
            if (/finestra/.test(title)) expect(facts.underWindow).toBe(true);
            if (/dall'alto/.test(title)) expect(facts.ceiling).toBe(true);
            if (/dalle pareti/.test(title)) expect(facts.ceiling).toBe(false);
            if (/d'estate/.test(title))
              expect(facts.splits && facts.radiators).toBeTruthy();
            if (/^Caldo|calda/.test(title) && set[index].kind === "split")
              expect(heating).toBe(true);
          });
        }
  });

  it("niente slogan generici: ogni titolo è un fatto o una riserva sobria", () => {
    const banned =
      /avvolge|su misura|al caso|sereno|passo dopo passo|elegante|tutto tuo|tepore|arreda/i;
    for (const set of SETS)
      for (let n = 0; n < 100; n++) {
        const script = socialScript(set, n % 2 === 0, `t${n}`);
        for (const text of [script.hook, script.invite, ...script.captions])
          expect(banned.test(text)).toBe(false);
      }
  });

  it("è stabile per lo stesso progetto e varia tra progetti", () => {
    const set = scenes(["split", "grille", "radiator"]);
    expect(socialScript(set, false, "a")).toEqual(
      socialScript(set, false, "a"),
    );
    const hooks = new Set(
      Array.from(
        { length: 60 },
        (_, n) => socialScript(set, false, `p${n}`).hook,
      ),
    );
    expect(hooks.size).toBeGreaterThan(5);
  });

  it("titoli e nomi stanza corti: stanno in due righe", () => {
    for (const set of SETS) {
      const script = socialScript(
        [
          { ...set[0], room: "Un nome di stanza davvero lunghissimo" },
          ...set.slice(1),
        ],
        true,
        "x",
      );
      for (const text of [script.hook, ...script.captions]) {
        const [kicker, title, extra] = text.split("\n");
        expect(kicker && title && extra === undefined).toBe(true);
        expect(kicker.length).toBeLessThanOrEqual(24);
        expect(title.length).toBeLessThanOrEqual(38);
      }
    }
  });
});
