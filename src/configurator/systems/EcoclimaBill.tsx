"use client";
import type { Project } from "@/schemas/project";
import { calculateEcoclimaBom } from "@/domain/air-terminals/commercial-bom";
const money = (cents: number) =>
  (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
export function EcoclimaBill({ project }: { project: Project }) {
  const bill = calculateEcoclimaBom(project);
  return (
    <section aria-label="Listino materiali Ecoclima">
      <h3>Listino materiali Ecoclima</h3>
      <p>
        <strong>
          {bill.complete && bill.totalCents !== null
            ? `Totale ${money(bill.totalCents)}`
            : `Articoli con prezzo: ${money(bill.knownSubtotalCents)}`}
        </strong>
      </p>
      {!bill.complete && (
        <p className="nota">
          {bill.missingLineCount} voci da completare. Il totale completo non è
          ancora disponibile.
        </p>
      )}
      <div className="tabella-listino">
        <table>
          <thead>
            <tr>
              <th>Articolo</th>
              <th>Quantità</th>
              <th>Listino</th>
              <th>Importo</th>
            </tr>
          </thead>
          <tbody>
            {bill.lines.map((line) => (
              <tr key={line.id}>
                <td>
                  {line.label}
                  {line.reason && <small>{line.reason}</small>}
                  {line.sourceMetadata && (
                    <a
                      href={line.sourceMetadata.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {" "}
                      Fonte
                    </a>
                  )}
                </td>
                <td>{line.quantity ?? "Da verificare"}</td>
                <td>
                  {line.unitPriceCents === null
                    ? "Da quotare"
                    : money(line.unitPriceCents)}
                </td>
                <td>
                  {line.extendedPriceCents === null
                    ? "Da completare"
                    : money(line.extendedPriceCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="nota">
        Prezzi pubblicati dal produttore, senza sconti.{" "}
        {bill.revision
          ? `Listino ${bill.revision}.`
          : "Revisione non indicata."}{" "}
        Trattamento IVA da confermare sulla fonte.
      </p>
    </section>
  );
}
