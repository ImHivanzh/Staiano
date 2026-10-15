"use client";
import type { TerminalPlenumOptions } from "@/domain/catalogs/ecoclima-price-schema";
import { terminalPlenumConnections } from "@/domain/air-terminals/commercial-bom";
import styles from "./RoomAirTerminals.module.css";

export function TerminalPlenumFields({
  options,
  onChange,
  familyCode,
}: {
  options: TerminalPlenumOptions;
  onChange: (patch: Partial<TerminalPlenumOptions>) => void;
  familyCode: string;
}) {
  const material =
    options.plenumMaterial ?? (options.insulatedPlenum ? "insulated" : "none");
  const connections = terminalPlenumConnections(familyCode);
  return (
    <fieldset className={styles.plenumSettings}>
      <legend>Plenum della bocchetta</legend>
      <div className={styles.plenumChoice}>
        <span>Materiale plenum</span>
        <div
          className={styles.sizeButtons}
          role="group"
          aria-label="Materiale plenum"
        >
          {(
            [
              ["insulated", "Isolato"],
              ["galvanized", "Zincato"],
              ["none", "Senza plenum"],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className="bottone"
              aria-pressed={material === value}
              onClick={() =>
                onChange({
                  plenumMaterial: value === "none" ? undefined : value,
                  insulatedPlenum: value === "insulated",
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {material !== "none" && (
        <>
          <div className={styles.plenumChoice}>
            <span>Forma plenum</span>
            <div
              className={styles.sizeButtons}
              role="group"
              aria-label="Forma plenum"
            >
              {(["rectangular", "trapezoidal"] as const).map((shape) => (
                <button
                  type="button"
                  key={shape}
                  className="bottone"
                  aria-pressed={
                    (options.plenumShape ?? "rectangular") === shape
                  }
                  onClick={() => onChange({ plenumShape: shape })}
                >
                  {shape === "rectangular" ? "Rettangolare" : "Trapezoidale"}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.plenumChoice}>
            <span>Stacchi di catalogo · {familyCode}</span>
            <div
              className={styles.sizeButtons}
              role="group"
              aria-label="Stacchi di catalogo"
            >
              {connections.map(({ position }) => (
                <button
                  type="button"
                  key={position}
                  className="bottone"
                  aria-pressed={options.connectionPosition === position}
                  onClick={() => onChange({ connectionPosition: position })}
                >
                  {position === "lateral" ? "Laterale" : "Superiore"}
                </button>
              ))}
            </div>
            {connections.length ? (
              <a
                href={connections[0].sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Disegno originale Ecoclima
              </a>
            ) : (
              <p className="nota">
                Stacco non pubblicato per questo modello: specificare la
                posizione su richiesta.
              </p>
            )}
          </div>
          <details
            className={styles.plenumChoice}
            open={
              !!options.connectionPosition &&
              !connections.some(
                (c) => c.position === options.connectionPosition,
              )
            }
          >
            <summary>Altre posizioni dello stacco</summary>
            <label className="campo">
              <span>Stacco plenum</span>
              <select
                value={options.connectionPosition ?? ""}
                onChange={(event) =>
                  onChange({
                    connectionPosition: (event.target.value ||
                      undefined) as TerminalPlenumOptions["connectionPosition"],
                  })
                }
              >
                <option value="">Da specificare</option>
                <option value="lateral">
                  Laterale
                  {connections.some((c) => c.position === "lateral")
                    ? " · catalogo"
                    : " · su richiesta"}
                </option>
                <option value="upper">
                  Superiore
                  {connections.some((c) => c.position === "upper")
                    ? " · catalogo"
                    : " · su richiesta"}
                </option>
                <option value="lower">Inferiore · su richiesta</option>
                <option value="rear">Posteriore · su richiesta</option>
                <option value="custom">Personalizzato</option>
              </select>
            </label>
            {options.connectionPosition === "custom" && (
              <label className="campo">
                <span>Descrizione stacco</span>
                <input
                  maxLength={200}
                  value={options.connectionNote ?? ""}
                  placeholder="Posizione e caratteristiche dello stacco"
                  onChange={(event) =>
                    onChange({ connectionNote: event.target.value })
                  }
                />
              </label>
            )}
          </details>
          {(material === "galvanized" ||
            options.plenumShape === "trapezoidal" ||
            ["lower", "rear", "custom"].includes(
              options.connectionPosition ?? "",
            )) && (
            <p className="nota">
              Plenum su richiesta: prezzo e dimensioni degli stacchi da
              confermare.
            </p>
          )}
        </>
      )}
    </fieldset>
  );
}
