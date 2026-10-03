import { ecoclimaCommercialCatalog } from "@/domain/catalogs/ecoclima-commercial";

export function CommercialCatalog() {
  return (
    <section className="catalogo-scheda">
      <h3>Ecoclima · metadati originali pubblicati</h3>
      <p className="nota">
        {ecoclimaCommercialCatalog.families.length} pagine originali con tabelle
        commerciali · {ecoclimaCommercialCatalog.version}. Prezzi conservati per
        tracciabilità, esclusi dai calcoli e dalla distinta tecnica. Nessun
        preventivo automatico.
      </p>
      {ecoclimaCommercialCatalog.families.map((source) => (
        <details key={source.id}>
          <summary>{source.publisherLabel}</summary>
          <p className="nota">
            <a
              href={source.sourceMetadata.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Pagina produttore
            </a>{" "}
            · Acquisita{" "}
            {source.sourceMetadata.retrievedAt
              ? new Date(source.sourceMetadata.retrievedAt).toLocaleDateString(
                  "it-IT",
                )
              : "Data non registrata"}{" "}
            · SHA256 {source.sourceMetadata.sha256.slice(0, 12)}…
          </p>
          {source.tables.map((table, i) => (
            <div className="tabella-scroll" key={i}>
              <table className="tabella">
                <tbody>
                  {table.map((row, j) => (
                    <tr key={j}>
                      {row.map((cell, k) => (
                        <td key={k}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </details>
      ))}
    </section>
  );
}
