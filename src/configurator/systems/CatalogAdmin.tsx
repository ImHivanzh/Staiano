"use client";
import { radiatorCatalogs } from "@/domain/catalogs/radiators";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { AirTerminalCalculator } from "./AirTerminalCalculator";
export function CatalogAdmin() {
  return (
    <main className="pagina cataloghi">
      <h2>Cataloghi tecnici locali</h2>
      <p className="nota">
        Snapshot verificati. I calcoli usano dati locali e non richiedono
        Internet.
      </p>
      <section className="catalogo-scheda">
        <h3>Ecoclima · {airTerminalCatalog.version}</h3>
        <p className="nota">
          {airTerminalCatalog.families.length} famiglie ·{" "}
          {airTerminalCatalog.families.reduce(
            (n, f) => n + f.variants.length,
            0,
          )}{" "}
          varianti. Punti discordanti conservati e non selezionabili
          automaticamente.
        </p>
        <AirTerminalCalculator />
      </section>
      {radiatorCatalogs.map((catalog) => (
        <section className="catalogo-scheda" key={catalog.manufacturer}>
          <div className="titolo-archivio">
            <div>
              <h3>{catalog.manufacturer}</h3>
              <p className="nota">
                Versione {catalog.version} · {catalog.products.length} varianti
              </p>
            </div>
            <span className="etichetta buona">Schema valido</span>
          </div>
          <table className="tabella">
            <thead>
              <tr>
                <th>Famiglia</th>
                <th>Varianti</th>
                <th>Fonte e revisione</th>
                <th>Acquisita</th>
              </tr>
            </thead>
            <tbody>
              {[...new Set(catalog.products.map((p) => p.family))].map(
                (family) => {
                  const products = catalog.products.filter(
                      (p) => p.family === family,
                    ),
                    source = products[0].sourceMetadata;
                  return (
                    <tr key={family}>
                      <td>{family}</td>
                      <td>{products.length}</td>
                      <td>
                        <a
                          className="fonte-catalogo"
                          href={source.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          PDF produttore
                        </a>
                        <small className="nota">
                          {source.documentRevision}
                          <br />
                          SHA256 {source.sha256.slice(0, 12)}…
                        </small>
                      </td>
                      <td>
                        {new Date(source.retrievedAt).toLocaleDateString(
                          "it-IT",
                        )}
                      </td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
          <p className="nota">
            Codici delle configurazioni complete non disponibili nello snapshot:
            nessun codice commerciale inventato. Global: pressione e temperatura
            massime non ancora normalizzate. Cordivari: ingombro con tappi,
            valvole escluse.
          </p>
        </section>
      ))}
    </main>
  );
}
