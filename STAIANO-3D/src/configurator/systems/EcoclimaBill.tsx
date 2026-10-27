"use client";
import type { Project } from "@/schemas/project";
import { calculateEcoclimaBom } from "@/domain/air-terminals/commercial-bom";
import { ecoclimaBomCsv } from "@/services/export/ecoclima-csv";
import { materialsEasyfattXlsx } from "@/services/export/materials-easyfatt";
import { downloadFile } from "@/services/project/format";
import { loadEasyfattMappings } from "@/services/export/easyfatt-mappings";
import { EasyfattMappingsEditor } from "./EasyfattMappings";
import { EasyfattXmlExport } from "./EasyfattXmlExport";
import { useState } from "react";
const money = (cents: number) =>
  (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
export function EcoclimaBill({ project }: { project: Project }) {
  const [exportError, setExportError] = useState("");
  const bill = calculateEcoclimaBom(project);
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
        onClick={async () => {
          try {
            const mappings = await loadEasyfattMappings();
            downloadFile(
              `${name}-preventivo-easyfatt.xlsx`,
              new Blob([materialsEasyfattXlsx(project, mappings)], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              }),
            );
            setExportError("");
          } catch {
            setExportError(
              "Esportazione non riuscita: codici condivisi non disponibili.",
            );
          }
        }}
      >
        Esporta Excel per Easyfatt
      </button>
      {exportError && <p role="alert">{exportError}</p>}
      <EasyfattXmlExport project={project} />
      <EasyfattMappingsEditor project={project} />
      <p className="nota">
        Excel: tutti i materiali del progetto, cumulativi per stanza, anche
        senza codice. Codici e prezzi assenti restano vuoti; il foglio “Da
        completare” li riepiloga. IVA da impostare in Easyfatt.
      </p>
      <details>
        <summary>Come importare il preventivo in Easyfatt</summary>
        <p className="nota">
          Nel preventivo Easyfatt scegli Utilità → Importa righe da
          Excel/OpenOffice/LibreOffice e “Prepara modello vuoto di
          importazione”. Apri l’Excel esportato e copia le righe del foglio
          “Righe preventivo” nelle colonne corrispondenti del modello: codice,
          descrizione, quantità e prezzo unitario. Per gli articoli associati
          usa invece il foglio “Codici Easyfatt”: copia solo codice e quantità,
          lasciando vuoti descrizione e prezzo. Non importare due volte le
          stesse righe. Per i documenti di acquisto, il foglio “Codici fornitori”
          contiene i codici disponibili per tutti gli articoli: seleziona solo le
          righe del fornitore associato al documento e copia codice prodotto
          fornitore e quantità nelle rispettive colonne del modello. Mantieni le
          intestazioni originali del modello, salva e importalo. Verifica i
          codici articolo e imposta l’IVA corretta. Le voci nel foglio “Da
          completare” richiedono verifica prima dell’importazione.
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
