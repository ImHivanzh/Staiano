"use client";
import type { Project } from "@/schemas/project";
import { calculateEcoclimaBom } from "@/domain/air-terminals/commercial-bom";
import { ecoclimaBomCsv } from "@/services/export/ecoclima-csv";
import {
  ecoclimaEasyfattXlsx,
  easyfattLineReady,
} from "@/services/export/ecoclima-easyfatt";
import { downloadFile } from "@/services/project/format";
const money = (cents: number) =>
  (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
export function EcoclimaBill({ project }: { project: Project }) {
  const bill = calculateEcoclimaBom(project);
  const readyCount = bill.lines.filter(easyfattLineReady).length;
  const name =
    project.name.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 100) ||
    "progetto";
  return (
    <section aria-label="Listino materiali Ecoclima">
      <h3>Listino materiali Ecoclima</h3>
      <button
        className="bottone piccolo"
        onClick={() => {
          downloadFile(
            `${name}-distinta-ecoclima.csv`,
            new Blob([ecoclimaBomCsv(bill)], {
              type: "text/csv;charset=utf-8",
            }),
          );
        }}
      >
        Esporta distinta CSV
      </button>
      <button
        type="button"
        className="bottone piccolo"
        disabled={readyCount === 0}
        onClick={() =>
          downloadFile(
            `${name}-preventivo-easyfatt.xlsx`,
            new Blob([ecoclimaEasyfattXlsx(bill)], {
              type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }),
          )
        }
      >
        Esporta Excel per Easyfatt
      </button>
      <p className="nota">
        Excel: {readyCount} voci pronte, {bill.lines.length - readyCount} nel
        foglio “Da completare”. Prezzi di listino, IVA da impostare in Easyfatt.
      </p>
      <details>
        <summary>Come importare il preventivo in Easyfatt</summary>
        <p className="nota">
          Nel preventivo Easyfatt scegli Utilità → Importa righe da
          Excel/OpenOffice/LibreOffice e “Prepara modello vuoto di
          importazione”. Apri l’Excel esportato e copia le righe del foglio
          “Righe preventivo” nelle colonne corrispondenti del modello: codice,
          descrizione, quantità e prezzo unitario. Mantieni le intestazioni
          originali del modello, salva e importalo. Verifica i codici articolo e
          imposta l’IVA corretta. Le voci nel foglio “Da completare” richiedono
          verifica prima dell’importazione.
        </p>
        <a
          href="https://help.danea.it/easyfatt/html/Microsoft_Excel.htm"
          target="_blank"
          rel="noreferrer"
        >
          Guida ufficiale Danea
        </a>
      </details>
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
                  {line.sku && <strong>{line.sku} · </strong>}
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
