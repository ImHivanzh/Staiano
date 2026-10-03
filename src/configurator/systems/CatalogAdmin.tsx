"use client";
import { radiatorCatalogs } from "@/domain/catalogs/radiators";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { AirTerminalCalculator } from "./AirTerminalCalculator";
import { Models3DPanel } from "./Models3DPanel";
import { hvacCatalog } from "@/domain/catalogs/hvac";
import { splitCatalog } from "@/domain/catalogs/splits";
import { CommercialCatalog } from "./CommercialCatalog";
export function CatalogAdmin() {
  return (
    <main className="pagina cataloghi">
      <h2>Cataloghi tecnici locali</h2>
      <p className="nota">
        Snapshot verificati. I calcoli usano dati locali e non richiedono
        Internet.
      </p>
      <Models3DPanel />
      <CommercialCatalog />
      <section className="catalogo-scheda">
        <h3>Climatizzazione · cataloghi locali</h3>
        <p className="nota">
          Canalizzato: {hvacCatalog.products.length} abbinamenti reali ·{" "}
          {hvacCatalog.version}
          <br />
          Split: {splitCatalog.indoorUnits.length} modelli interni e{" "}
          {splitCatalog.combinations.length} combinazioni mono/multi pubblicate
          · {splitCatalog.version}
        </p>
        {["Daikin", "Mitsubishi Electric", "Gree"].map((brand) => {
          const units = splitCatalog.indoorUnits.filter(
            (unit) => unit.manufacturer === brand,
          );
          const sources = [
            ...new Map(
              units.map((unit) => [
                unit.sourceMetadata.sourceUrl,
                unit.sourceMetadata,
              ]),
            ).values(),
          ];
          return (
            <div key={brand}>
              <h4>{brand}</h4>
              <p className="nota">
                {units.length} modelli split ·{" "}
                {
                  splitCatalog.combinations.filter(
                    (c) => c.manufacturer === brand,
                  ).length
                }{" "}
                abbinamenti approvati acquisiti
              </p>
              {sources.map((source) => (
                <p className="nota" key={source.sha256}>
                  <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                    Fonte ufficiale · {source.documentRevision}
                  </a>
                  <br />
                  SHA256 {source.sha256.slice(0, 12)}… ·{" "}
                  {source.retrievedAt
                    ? new Date(source.retrievedAt).toLocaleDateString("it-IT")
                    : "Data acquisizione non registrata"}
                </p>
              ))}
            </div>
          );
        })}
        <p className="nota">
          Combinazioni multisplit controllate sulle tabelle del produttore,
          comprese le capacità per singola unità. Una fonte regionale non
          conferma disponibilità commerciale in Italia; i codici restano quelli
          pubblicati.
        </p>
      </section>
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
                        {source.retrievedAt
                          ? new Date(source.retrievedAt).toLocaleDateString(
                              "it-IT",
                            )
                          : "Non registrata"}
                      </td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
          <p className="nota">
            Codici delle configurazioni complete non disponibili nello snapshot:
            nessun codice commerciale inventato. Global: limiti di esercizio
            acquisiti dalle istruzioni originali. Cordivari: ingombro con tappi,
            valvole escluse.
          </p>
        </section>
      ))}
    </main>
  );
}
