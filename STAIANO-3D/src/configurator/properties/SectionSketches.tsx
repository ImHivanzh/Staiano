import type { CeilingBand, Room } from "@/schemas/project";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(Number.isFinite(value) ? value : min, min));

/** Pianta di un muro e della stanza: il vuoto della controparete in scala (1 cm = 2,4 px). */
export function DrywallSketch({
  intent,
  depthCm,
}: {
  intent: "new" | "existing";
  depthCm: number;
}) {
  const depth = clamp(depthCm * 2.4, 6, 72);
  const fresh = intent === "new";
  const wall = 18;
  const top = 14;
  // Nuova: pannello davanti al muro, il vuoto sta tra muro e pannello. Esistente: vuoto dietro il muro.
  const wallY = fresh ? top : top + depth;
  const voidY = fresh ? top + wall : top;
  const roomY = fresh ? top + wall + depth + 4 : top + depth + wall;
  return (
    <svg
      className="schema-inspector"
      viewBox="0 0 260 150"
      role="img"
      aria-label={
        fresh
          ? "Pianta: il pannello in cartongesso si aggiunge davanti al muro e riduce la stanza"
          : "Pianta: il vuoto si estende dietro il muro, la stanza resta invariata"
      }
    >
      <rect
        x="10"
        y={roomY}
        width="170"
        height={146 - roomY}
        className="schema-stanza"
      />
      <rect
        x="10"
        y={voidY}
        width="170"
        height={depth}
        className="schema-vuoto"
      />
      <rect
        x="10"
        y={wallY}
        width="170"
        height={wall}
        className="schema-muro-pieno"
      />
      {fresh && (
        <rect
          x="10"
          y={roomY - 4}
          width="170"
          height="4"
          className="schema-pannello"
        />
      )}
      <text x="188" y={wallY + 13} className="schema-testo">
        muro
      </text>
      <text x="188" y={voidY + depth / 2 + 4} className="schema-testo">
        vuoto{depthCm > 0 ? ` ${depthCm} cm` : ""}
      </text>
      {fresh && (
        <text x="188" y={roomY + 4} className="schema-testo">
          pannello
        </text>
      )}
      <text
        x="95"
        y={(roomY + 146) / 2 + 4}
        textAnchor="middle"
        className="schema-testo"
      >
        {fresh ? "stanza ridotta" : "stanza invariata"}
      </text>
    </svg>
  );
}

/** Sezione verticale: fascia ribassata lungo una parete. Con `band` è in scala, senza è un esempio. */
export function CeilingSketch({
  room,
  band,
}: {
  room: Room;
  band?: CeilingBand;
}) {
  const height = room.heightM;
  const k = 80 / height;
  const ceilingM = room.ceilingHeightM ?? height;
  const yCeiling = 110 - clamp(ceilingM * k, 20, 80);
  const yBand = band ? 110 - clamp(band.elevationM * k, 8, 80) : yCeiling + 28;
  const width = band ? clamp(band.depthM * k, 12, 110) : 60;
  return (
    <svg
      className="schema-inspector"
      viewBox="0 0 260 130"
      role="img"
      aria-label="Sezione: la fascia ribassata corre lungo la parete, sotto il controsoffitto della stanza"
    >
      <rect
        x="20"
        y="24"
        width="10"
        height="86"
        className="schema-muro-pieno"
      />
      <rect
        x="230"
        y="24"
        width="10"
        height="86"
        className="schema-muro-pieno"
      />
      <rect
        x="20"
        y="110"
        width="220"
        height="6"
        className="schema-muro-pieno"
      />
      <rect
        x="20"
        y="18"
        width="220"
        height={yCeiling - 18}
        className="schema-vuoto"
      />
      <rect
        x="30"
        y={yCeiling}
        width="200"
        height="1.5"
        className="schema-faccia-riempita"
      />
      <rect
        x="30"
        y={yCeiling}
        width={width}
        height={yBand - yCeiling}
        className="schema-muro-nuovo"
      />
      <path
        d={`M${30 + width + 8} ${yCeiling}V${yBand}M${30 + width + 8} ${yCeiling}l-3 6M${30 + width + 8} ${yCeiling}l3 6M${30 + width + 8} ${yBand}l-3 -6M${30 + width + 8} ${yBand}l3 -6`}
        className="schema-freccia"
      />
      <path
        d={`M30 ${yBand + 8}H${30 + width}M30 ${yBand + 8}l6 -3M30 ${yBand + 8}l6 3M${30 + width} ${yBand + 8}l-6 -3M${30 + width} ${yBand + 8}l-6 3`}
        className="schema-freccia"
      />
      <text
        x={30 + width + 14}
        y={(yCeiling + yBand) / 2 + 4}
        className="schema-testo"
      >
        quota inferiore
      </text>
      <text
        x={30 + width / 2}
        y={yBand + 20}
        textAnchor="middle"
        className="schema-testo"
      >
        larghezza
      </text>
      <text x="150" y="92" textAnchor="middle" className="schema-testo">
        stanza
      </text>
      <text x="230" y="14" textAnchor="end" className="schema-testo">
        solaio / controsoffitto
      </text>
    </svg>
  );
}
