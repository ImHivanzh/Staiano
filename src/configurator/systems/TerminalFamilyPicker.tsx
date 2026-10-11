"use client";
import { useState } from "react";
import type { AirTerminalFamily } from "@/domain/catalogs/air-terminal-schema";

export function TerminalFamilyPicker({
  options,
  onSelect,
  use,
}: {
  options: { family: AirTerminalFamily; compatible: boolean }[];
  onSelect: (family: AirTerminalFamily) => void;
  use: "supply" | "return";
}) {
  const [code, setCode] = useState("");
  const chosen = options.find(
    (item) => item.family.familyCode === code && item.compatible,
  );
  return (
    <section aria-label="Modelli bocchette">
      <p>
        Passo 1 di 3 · Scegli il modello{" "}
        {use === "supply" ? "di mandata" : "di ripresa"}.
      </p>
      <label className="campo">
        <span>Modello bocchetta</span>
        <select
          aria-label="Modello bocchetta"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        >
          <option value="">Seleziona un modello</option>
          {options.map(({ family, compatible }) => (
            <option
              key={family.familyCode}
              value={family.familyCode}
              disabled={!compatible}
            >
              {family.familyCode === "EGA6" ? "EGA 6 Push" : family.familyCode}{" "}
              · {family.name}
              {!compatible && " · dati non compatibili"}
            </option>
          ))}
        </select>
      </label>
      <button
        className="bottone pieno"
        disabled={!chosen}
        onClick={() => chosen && onSelect(chosen.family)}
      >
        Continua con il modello
      </button>
    </section>
  );
}
