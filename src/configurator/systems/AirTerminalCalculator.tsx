"use client";
import { useState } from "react";
import Image from "next/image";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import {
  acousticUpperBound,
  sizeAirTerminal,
} from "@/domain/air-terminals/size";
import { formatNumber, numberFromForm } from "@/utils/format";
export function AirTerminalCalculator() {
  const [query, setQuery] = useState<{
      flow: number;
      points: number;
      use: "supply" | "return";
    } | null>(null),
    [chosen, setChosen] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null);
  const compatible = query
    ? airTerminalCatalog.families.filter(
        (f) => sizeAirTerminal(query.flow, query.points, f, query.use).length,
      )
    : [];
  const family = airTerminalCatalog.families.find(
      (f) => f.familyCode === chosen,
    ),
    solutions =
      query && family
        ? sizeAirTerminal(query.flow, query.points, family, query.use)
        : [];
  return (
    <section className="calcolatore-terminali">
      <h2>Verifica terminali aria</h2>
      <p className="nota">
        Inserisci la portata di progetto. Scegli lo stile tra famiglie
        compatibili; confronto su dati originali Ecoclima.
      </p>
      <form
        className="form-portata"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget),
            flow = numberFromForm(d.get("flow")),
            points = numberFromForm(d.get("points")),
            use = String(d.get("use")) as "supply" | "return";
          try {
            for (const f of airTerminalCatalog.families)
              sizeAirTerminal(flow, points, f, use);
            setQuery({ flow, points, use });
            setChosen(null);
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Dati non validi.");
          }
        }}
      >
        <label className="campo">
          <span>Portata richiesta (m³/h)</span>
          <input
            name="flow"
            type="number"
            min="0.01"
            max="100000"
            step="0.01"
            required
          />
        </label>
        <label className="campo">
          <span>Numero punti</span>
          <input
            name="points"
            type="number"
            min="1"
            max="100"
            defaultValue="1"
            required
          />
        </label>
        <label className="campo">
          <span>Utilizzo</span>
          <select name="use">
            <option value="supply">Mandata</option>
            <option value="return">Ripresa</option>
          </select>
        </label>
        <button className="bottone pieno" type="submit">
          Trova stili compatibili
        </button>
      </form>
      {error && <p className="errore">{error}</p>}
      {query && (
        <>
          <h3>Scegli lo stile</h3>
          <div className="gallery-terminali">
            {compatible.map((f) => (
              <button
                key={f.familyCode}
                className={`stile-terminale ${chosen === f.familyCode ? "scelto" : ""}`}
                onClick={() => setChosen(f.familyCode)}
                aria-label={`Scegli ${f.familyCode}`}
                aria-pressed={chosen === f.familyCode}
              >
                {f.image ? (
                  <Image
                    src={f.image}
                    alt={f.name}
                    width={220}
                    height={160}
                    unoptimized
                  />
                ) : (
                  <div className="immagine-assente">
                    Immagine non disponibile
                  </div>
                )}
                <strong>{f.name}</strong>
                <span>
                  {f.familyCode} · {f.mountingType}
                </span>
                <small>
                  Portata compatibile · Punti di riferimento ≤37 dB(A)
                </small>
              </button>
            ))}
          </div>
          {!compatible.length && (
            <p className="avviso attenzione">
              Nessuna famiglia verificata soddisfa portata e rumore. Aumenta il
              numero punti oppure richiedi dati tecnici aggiuntivi.
            </p>
          )}
        </>
      )}
      {family && solutions.length > 0 && (
        <div className="risultati-terminali">
          <h3>{family.familyCode}: misure compatibili</h3>
          <table className="tabella">
            <thead>
              <tr>
                <th>Variante</th>
                <th>Misura commerciale</th>
                <th>Teorica</th>
                <th>Q.tà/punto</th>
                <th>Portata/punto</th>
                <th>Rumore di riferimento</th>
                <th>Pa</th>
                <th>Lancio</th>
              </tr>
            </thead>
            <tbody>
              {solutions.slice(0, 6).map((s, i) => (
                <tr key={i}>
                  <td>
                    {s.variant.slotCount
                      ? `${s.variant.slotCount} feritoie · ${s.variant.slotWidthMm} mm`
                      : s.variant.nominalDiameterMm
                        ? `Diametro nominale ${s.variant.nominalDiameterMm} mm`
                        : s.variant.id}
                  </td>
                  <td>
                    {s.commercialLengthM !== null
                      ? `${formatNumber(s.commercialLengthM)} m`
                      : s.variant.nominalDiameterMm
                        ? `DN ${s.variant.nominalDiameterMm} mm`
                        : s.variant.widthMm !== null &&
                            s.variant.heightMm !== null
                          ? `${s.variant.widthMm} × ${s.variant.heightMm} mm`
                          : "Dimensioni non disponibili"}
                  </td>
                  <td>
                    {s.theoreticalLengthM === null
                      ? "—"
                      : `${formatNumber(s.theoreticalLengthM, 3)} m`}
                  </td>
                  <td>{s.quantityPerPoint}</td>
                  <td>{formatNumber(s.availableAirflowPerPointM3h, 1)} m³/h</td>
                  <td>
                    {s.operatingPoint.noiseLabel} dB(A) · limite{" "}
                    {acousticUpperBound(s.operatingPoint)}
                  </td>
                  <td>
                    {s.operatingPoint.pressureDropPa ?? "Non disponibile"}
                  </td>
                  <td>
                    {s.operatingPoint.throwM === null
                      ? "Non disponibile"
                      : `${s.operatingPoint.throwM} m`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <details>
            <summary>Come è stato calcolato?</summary>
            {solutions[0].log.map((line, i) => (
              <p className="nota" key={i}>
                {line}
              </p>
            ))}
          </details>
          <p className="nota">{family.operatingConditions}</p>
          <a
            href={family.sourceMetadata.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="fonte-catalogo"
          >
            Scheda ufficiale · {family.sourceMetadata.documentRevision}
          </a>
        </div>
      )}
    </section>
  );
}
