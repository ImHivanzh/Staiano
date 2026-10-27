import type { Project } from "@/schemas/project";
import { installationLabels } from "@/domain/installations";

export type PresentationStep = {
  id: string;
  title: string;
  /** Spiegazione in linguaggio semplice, uguale per ogni impianto dello stesso tipo. */
  intro: string;
  rooms: string[];
  facts: { label: string; value: string }[];
  terminals: { room: string; label: string; detail: string }[];
};

const explanations: Record<Project["installations"][number]["type"], string> = {
  radiator:
    "Il calore arriva da radiatori collegati alla caldaia o alla pompa di calore. Ogni radiatore è dimensionato sul fabbisogno della sua stanza, così la temperatura resta uniforme.",
  ducted:
    "Una macchina nascosta nel controsoffitto prepara l’aria e la porta alle stanze con canali. In casa si vedono soltanto le bocchette: da quelle di mandata entra aria fresca o calda, da quelle di ripresa l’aria torna alla macchina.",
  split:
    "Un’unità interna a parete, collegata all’unità esterna, raffresca e riscalda la stanza con un solo apparecchio, regolabile in modo indipendente dagli altri ambienti.",
  vrv: "Una sola unità esterna serve più unità interne, una per ambiente. La potenza si distribuisce dove serve, con consumi contenuti e regolazione stanza per stanza.",
  fanCoil:
    "I ventilconvettori sono alimentati ad acqua dalla pompa di calore: una ventola spinge l’aria sulla batteria calda o fredda. Ogni apparecchio si regola da solo, anche in silenzio.",
};

const kw = (watts: number) =>
  `${(watts / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} kW`;
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Passi della presentazione: panoramica, poi un passo per impianto. Solo dati del progetto. */
export function presentationSteps(project: Project): PresentationStep[] {
  const roomName = (id: string) =>
    project.rooms.find((room) => room.id === id)?.name ?? "Ambiente";
  const steps: PresentationStep[] = [
    {
      id: "overview",
      title: project.name,
      intro:
        "Il progetto è organizzato per impianti. Scorri i passi per vedere come funziona ciascuno e dove si trovano le bocchette.",
      rooms: project.rooms.map((room) => room.name),
      facts: [
        { label: "Ambienti", value: String(project.rooms.length) },
        { label: "Impianti", value: String(project.installations.length) },
      ],
      terminals: [],
    },
  ];
  for (const installation of project.installations) {
    const inRoom = (item: { roomId: string; installationId?: string }) =>
      item.installationId === installation.id ||
      (!item.installationId && installation.roomIds.includes(item.roomId));
    const facts: PresentationStep["facts"] = [];
    const radiators = project.radiators.filter(inRoom);
    if (radiators.length)
      facts.push(
        {
          label: "Radiatori",
          value: plural(radiators.length, "radiatore", "radiatori"),
        },
        {
          label: "Potenza totale",
          value: kw(radiators.reduce((sum, r) => sum + r.outputW, 0)),
        },
      );
    const fanCoils = (project.fanCoils ?? []).filter(inRoom);
    if (fanCoils.length)
      facts.push({
        label: "Ventilconvettori",
        value: String(fanCoils.length),
      });
    const systems = project.hvacSystems.filter(
      (system) => system.installationId === installation.id,
    );
    for (const system of systems) {
      facts.push({
        label: system.name || system.manufacturer,
        value: [
          system.manufacturer,
          system.capacityW ? kw(system.capacityW) : null,
          system.airflowM3h ? `${Math.round(system.airflowM3h)} m³/h` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }
    const systemIds = new Set(systems.map((system) => system.id));
    const terminals = project.airTerminals
      .filter(
        (terminal) =>
          (terminal.systemId && systemIds.has(terminal.systemId)) ||
          terminal.installationId === installation.id,
      )
      .sort(
        (a, b) =>
          roomName(a.roomId).localeCompare(roomName(b.roomId)) ||
          a.use.localeCompare(b.use),
      );
    const groups = new Map<
      string,
      { room: string; use: "supply" | "return"; list: typeof terminals }
    >();
    for (const terminal of terminals) {
      const key = `${terminal.roomId}:${terminal.use}`;
      const group = groups.get(key) ?? {
        room: roomName(terminal.roomId),
        use: terminal.use,
        list: [],
      };
      group.list.push(terminal);
      groups.set(key, group);
    }
    steps.push({
      id: installation.id,
      title: `${installation.name} · ${installationLabels[installation.type]}`,
      intro: explanations[installation.type],
      rooms: installation.roomIds.map(roomName),
      facts,
      terminals: [...groups.values()].map(({ room, use, list }) => {
        const airflow = list.reduce((s, t) => s + t.availableAirflowM3h, 0);
        const sizes = [
          ...new Set(
            list.map(
              (t) => `${Math.round(t.widthMm)}×${Math.round(t.heightMm)} mm`,
            ),
          ),
        ];
        const noise = Math.max(...list.map((t) => t.noiseDbA ?? 0));
        return {
          room,
          label: `${plural(list.length, use === "supply" ? "bocchetta di mandata" : "griglia di ripresa", use === "supply" ? "bocchette di mandata" : "griglie di ripresa")}`,
          detail: [
            use === "supply"
              ? "L’aria trattata entra nella stanza da qui."
              : "L’aria della stanza torna alla macchina da qui.",
            sizes.join(", "),
            `${Math.round(airflow)} m³/h`,
            noise > 0 ? `${noise.toLocaleString("it-IT")} dB(A)` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        };
      }),
    });
  }
  return steps;
}
