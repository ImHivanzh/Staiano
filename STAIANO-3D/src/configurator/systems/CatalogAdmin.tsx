"use client";
import Image from "next/image";
import { radiatorCatalogs } from "@/domain/catalogs/radiators";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { AirTerminalCalculator } from "./AirTerminalCalculator";
import { Models3DPanel } from "./Models3DPanel";
import { hvacCatalog } from "@/domain/catalogs/hvac";
import { splitCatalog } from "@/domain/catalogs/splits";
import { splitSeriesPresentations } from "@/domain/catalogs/split-presentation";
import { fanCoilCatalog } from "@/domain/catalogs/fan-coils";
import { heatPumpCatalog } from "@/domain/catalogs/heat-pumps";
import { vrvCatalog } from "@/domain/catalogs/vrv";
import { CommercialCatalog } from "./CommercialCatalog";
import { StoveCatalog } from "./StoveCatalog";
import { EasyfattCatalogEditor } from "./EasyfattMappings";
import { airTerminalCoverage } from "@/domain/air-terminals/data-quality";
export function CatalogAdmin() {
  return (
    <main className="pagina cataloghi">
      <h2>Cataloghi tecnici locali</h2>
      <p className="nota">
        Cataloghi locali con fonti e revisioni. I dati mancanti restano da
        verificare; i calcoli non richiedono Internet.
      </p>
      <Models3DPanel />
      <EasyfattCatalogEditor />
      <StoveCatalog />
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
          <br />
          {splitCatalog.outdoorUnits.length} codici esterni con ingombri
          pubblicati nella revisione corrente
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
              {splitSeriesPresentations
                .filter((series) => series.manufacturer === brand)
                .sort((a, b) => a.tier - b.tier)
                .map((series) => {
                  const models = units.filter(
                    (unit) => unit.family === series.family,
                  );
                  return (
                    <article className="catalogo-serie" key={series.family}>
                      <Image
                        src={series.productPhoto.localPath}
                        alt={series.productPhoto.caption}
                        width={300}
                        height={150}
                        unoptimized
                        style={{
                          objectFit: [
                            "Stylish",
                            "Perfera All Seasons",
                          ].includes(series.family)
                            ? "cover"
                            : "contain",
                          background: "white",
                        }}
                      />
                      <h4>{series.title}</h4>
                      <p>{series.features.join(" · ")}</p>
                      {series.gains.length ? (
                        series.gains.map((gain) => <p key={gain}>{gain}</p>)
                      ) : (
                        <p className="nota">
                          Gamma di ingresso: base del confronto commerciale.
                        </p>
                      )}
                      <p className="nota">
                        <a
                          href={series.sourceMetadata.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Funzionalità documentate · pagina{" "}
                          {series.sourceMetadata.page}
                        </a>
                        {" · "}
                        <a
                          href={series.productPhoto.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Foto originale del produttore
                        </a>
                      </p>
                      <details>
                        <summary>
                          {models.length} modelli · codici e misure pubblicati
                        </summary>
                        <table className="tabella">
                          <thead>
                            <tr>
                              <th>Modello</th>
                              <th>Freddo / caldo nominale</th>
                              <th>Ingombro L × H × P</th>
                              <th>Mercato della fonte</th>
                            </tr>
                          </thead>
                          <tbody>
                            {models.map((unit) => (
                              <tr key={unit.id}>
                                <td>{unit.model}</td>
                                <td>
                                  {unit.nominalCoolingW ?? "—"} /{" "}
                                  {unit.nominalHeatingW ?? "—"} W
                                </td>
                                <td>
                                  {unit.widthMm} × {unit.heightMm} ×{" "}
                                  {unit.depthMm} mm
                                </td>
                                <td>{unit.region ?? "Fonte riportata"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {series.family === "MSZ-AY" && (
                          <p className="nota">
                            I codici VGKP e VGK MSZ-AY hanno dotazioni diverse:
                            Plasma Quad Plus è documentato per VGKP; VGK propone
                            V-Blocking e Plasma Quad Connect opzionale.
                            Verificare codice e revisione in fase d’ordine.
                          </p>
                        )}
                      </details>
                    </article>
                  );
                })}
            </div>
          );
        })}
        <p className="nota">
          Combinazioni multisplit controllate sulle tabelle del produttore,
          comprese le capacità per singola unità. Una fonte regionale non
          conferma disponibilità commerciale in Italia; i codici restano quelli
          pubblicati.
        </p>
        <p className="nota">
          I gradini confrontano il posizionamento commerciale delle serie, non
          l’anno di uscita. Design, filtrazione e rendimento sono dimensioni
          diverse: una serie di design non garantisce prestazioni superiori in
          ogni voce.
        </p>
      </section>
      <section className="catalogo-scheda">
        <h3>Pompe di calore · {heatPumpCatalog.version}</h3>
        <p className="nota">
          {heatPumpCatalog.products.length} modelli idronici e monoblocco ·{" "}
          {[
            ...new Set(heatPumpCatalog.products.map((p) => p.manufacturer)),
          ].join(", ")}
          . Capacità e COP/EER alle condizioni dichiarate dal produttore.
        </p>
        {[
          ...new Set(
            heatPumpCatalog.products.map(
              (product) => `${product.manufacturer}|${product.family}`,
            ),
          ),
        ].map((key) => {
          const products = heatPumpCatalog.products.filter(
              (product) => `${product.manufacturer}|${product.family}` === key,
            ),
            representative = products[0];
          return (
            <article className="catalogo-serie" key={key}>
              <Image
                src={representative.productPhoto.localPath}
                alt={representative.productPhoto.caption}
                width={300}
                height={150}
                unoptimized
                style={{ objectFit: "contain", background: "white" }}
              />
              <h4>
                {representative.manufacturer} · {representative.family}
              </h4>
              <p>{representative.features.join(" · ")}</p>
              <details>
                <summary>
                  {products.length} modelli · capacità, COP/EER e ingombro
                </summary>
                <table className="tabella">
                  <thead>
                    <tr>
                      <th>Modello</th>
                      <th>Condizione</th>
                      <th>Freddo / caldo</th>
                      <th>COP / EER</th>
                      <th>Ingombro L × H × P</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.flatMap((product) =>
                      product.operatingPoints.map((point) => (
                        <tr key={`${product.id}-${point.label}`}>
                          <td>{product.model}</td>
                          <td>{point.label}</td>
                          <td>
                            {point.coolingW} / {point.heatingW} W
                          </td>
                          <td>
                            {point.cop ?? "n.d."} / {point.eer ?? "n.d."}
                          </td>
                          <td>
                            {product.widthMm} × {product.heightMm} ×{" "}
                            {product.depthMm} mm
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
                <p className="nota">
                  <a
                    href={representative.sourceMetadata.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Fonte ufficiale · pagina{" "}
                    {representative.sourceMetadata.page}
                  </a>
                </p>
              </details>
            </article>
          );
        })}
      </section>
      <section className="catalogo-scheda">
        <h3>VRV/VRF Daikin · {vrvCatalog.version}</h3>
        <p className="nota">
          {vrvCatalog.outdoorUnits.length} unità esterne VRV IV S, mini VRV e
          VRV 5 S · {vrvCatalog.indoorUnits.length} unità interne a parete
          FXAA-A. Rapporto di connessione ammesso 50–130%.
        </p>
        <article className="catalogo-serie">
          <Image
            src={vrvCatalog.outdoorUnits[0].productPhoto.localPath}
            alt={vrvCatalog.outdoorUnits[0].productPhoto.caption}
            width={300}
            height={150}
            unoptimized
            style={{ objectFit: "contain", background: "white" }}
          />
          <h4>Unità esterne</h4>
          <table className="tabella">
            <thead>
              <tr>
                <th>Modello</th>
                <th>Serie</th>
                <th>Freddo / caldo</th>
                <th>Rapporto</th>
                <th>Ingombro L × H × P</th>
              </tr>
            </thead>
            <tbody>
              {vrvCatalog.outdoorUnits.map((outdoor) => (
                <tr key={outdoor.id}>
                  <td>
                    <a
                      href={outdoor.sourceMetadata.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {outdoor.model}
                    </a>
                  </td>
                  <td>{outdoor.family}</td>
                  <td>
                    {outdoor.coolingW} / {outdoor.heatingW} W
                  </td>
                  <td>
                    {outdoor.minConnectionRatio}–{outdoor.maxConnectionRatio}%
                  </td>
                  <td>
                    {outdoor.widthMm} × {outdoor.heightMm} × {outdoor.depthMm}{" "}
                    mm
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article className="catalogo-serie">
          <Image
            src={vrvCatalog.indoorUnits[0].productPhoto.localPath}
            alt={vrvCatalog.indoorUnits[0].productPhoto.caption}
            width={300}
            height={150}
            unoptimized
            style={{ objectFit: "contain", background: "white" }}
          />
          <h4>Unità interne a parete FXAA-A</h4>
          <table className="tabella">
            <thead>
              <tr>
                <th>Modello</th>
                <th>Freddo / caldo nominale</th>
                <th>Ingombro L × H × P</th>
              </tr>
            </thead>
            <tbody>
              {vrvCatalog.indoorUnits.map((indoor) => (
                <tr key={indoor.id}>
                  <td>{indoor.model}</td>
                  <td>
                    {indoor.nominalCoolingW} / {indoor.nominalHeatingW} W
                  </td>
                  <td>
                    {indoor.widthMm} × {indoor.heightMm} × {indoor.depthMm} mm
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="nota">
            Cassette e unità canalizzate VRV non sono ancora selezionabili nel
            configuratore: il catalogo riporta solo le unità a parete FXAA-A
            compatibili con la posa a parete.
          </p>
        </article>
      </section>
      <section className="catalogo-scheda">
        <h3>Ventilconvettori · Innova, Olimpia Splendid, Aermec</h3>
        <p className="nota">
          {fanCoilCatalog.products.length} modelli documentati ·{" "}
          {fanCoilCatalog.version}. Potenze riferite alle condizioni e alla
          velocità dichiarate dal produttore.
        </p>
        {[
          ...new Set(
            fanCoilCatalog.products.map(
              (product) => `${product.manufacturer}|${product.family}`,
            ),
          ),
        ].map((key) => {
          const products = fanCoilCatalog.products.filter(
            (product) => `${product.manufacturer}|${product.family}` === key,
          );
          const representative = products[0];
          return (
            <article className="catalogo-serie" key={key}>
              {representative.productPhoto && (
                <Image
                  src={representative.productPhoto.localPath}
                  alt={representative.productPhoto.caption}
                  width={300}
                  height={170}
                  unoptimized
                  style={{ objectFit: "contain", background: "white" }}
                />
              )}
              <h4>
                {representative.manufacturer} · {representative.family}
              </h4>
              <p>{representative.features.join(" · ")}</p>
              <details>
                <summary>
                  {products.length} modelli · potenze e condizioni di prova
                </summary>
                <table className="tabella">
                  <thead>
                    <tr>
                      <th>Modello</th>
                      <th>Tubi</th>
                      <th>Ingombro L × H × P</th>
                      <th>Punto operativo</th>
                      <th>Freddo / caldo</th>
                      <th>Aria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.flatMap((product) =>
                      product.operatingPoints.map((point) => (
                        <tr key={`${product.id}-${point.label}`}>
                          <td>{product.model}</td>
                          <td>{product.pipes}</td>
                          <td>
                            {product.widthMm} × {product.heightMm} ×{" "}
                            {product.depthMm} mm
                          </td>
                          <td>{point.label}</td>
                          <td>
                            {point.coolingW} / {point.heatingW} W
                          </td>
                          <td>
                            {point.airflowM3h === null
                              ? "Non pubblicata"
                              : `${point.airflowM3h} m³/h`}
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
                {products.map((product) => (
                  <details key={product.id}>
                    <summary>
                      {product.model} · condizioni, rumore e installazione
                    </summary>
                    <p className="nota">{product.dimensionNote}</p>
                    {product.operatingPoints.map((point) => (
                      <p className="nota" key={point.label}>
                        {point.label}: freddo {point.coolingConditions}; caldo{" "}
                        {point.heatingConditions}. Rumore{" "}
                        {point.noiseDbA === null
                          ? "non pubblicato"
                          : `${point.noiseDbA} dB(A)`}
                        : {point.noiseConditions}
                      </p>
                    ))}
                    <a
                      href={product.sourceMetadata.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Fonte ufficiale ·{" "}
                      {product.sourceMetadata.documentRevision}
                    </a>
                  </details>
                ))}
              </details>
            </article>
          );
        })}
        <h4>Comandi originali Innova M7</h4>
        {fanCoilCatalog.controls.map((control) => (
          <article className="catalogo-serie" key={control.id}>
            {control.productPhoto && (
              <Image
                src={control.productPhoto.localPath}
                alt={control.productPhoto.caption}
                width={220}
                height={140}
                unoptimized
                style={{ objectFit: "contain", background: "white" }}
              />
            )}
            <h5>
              {control.model} · {control.series}
            </h5>
            <p>{control.features.join(" · ")}</p>
            <p className="nota">
              Famiglie documentate: {control.compatibleFamilies.join(", ")}.
              Scheda necessaria secondo impianto a 2/4 tubi:{" "}
              {control.requiredBoards.join(", ")}.
            </p>
            <a
              href={control.sourceMetadata.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Manuale originale · pagina {control.sourceMetadata.page}
            </a>
          </article>
        ))}
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
        <details>
          <summary>
            Stato dei dati per famiglia · {airTerminalCatalog.families.length}{" "}
            famiglie
          </summary>
          <p className="nota">
            Prestazioni: conteggi di punti. Geometria: conteggi di varianti,
            compresi i fallback quotati e le lunghezze commerciali. Prezzi e
            configurazioni restano separati; nessun dato in revisione viene
            promosso.
          </p>
          {airTerminalCatalog.families.map((family) => {
            const coverage = airTerminalCoverage(family);
            const source = family.sourceMetadata;
            return (
              <details key={family.familyCode}>
                <summary>
                  {family.familyCode} · {coverage.variants} varianti ·{" "}
                  {family.selectionStatus ?? "stato non classificato"}
                </summary>
                <p className="nota">
                  Prestazioni: {coverage.validPoints} punti utilizzabili,{" "}
                  {coverage.reviewPoints} in revisione;{" "}
                  {coverage.acousticMissing} senza dato acustico.
                </p>
                <p className="nota">
                  Geometria: faccia risolta per {coverage.faces}/
                  {coverage.variants} varianti; profondità per {coverage.depths}
                  /{coverage.variants}. Le misure mancanti richiedono una
                  dichiarazione esplicita.
                </p>
                <p className="nota">
                  Prezzi: listino separato; una riga di famiglia non prova la
                  quotazione di ogni configurazione.
                </p>
                <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                  Fonte · revisione {source.documentRevision ?? "non indicata"}{" "}
                  · pagina {source.page ?? "non indicata"}
                </a>
                <p className="nota" style={{ overflowWrap: "anywhere" }}>
                  SHA-256 {source.sha256}
                </p>
              </details>
            );
          })}
        </details>
        <AirTerminalCalculator />
      </section>
      {radiatorCatalogs.map((catalog) => (
        <section
          className="catalogo-scheda"
          key={`${catalog.manufacturer}-${catalog.version}`}
        >
          <div className="titolo-archivio">
            <div>
              <h3>{catalog.manufacturer}</h3>
              <p className="nota">
                Versione {catalog.version} · {catalog.products.length} varianti
              </p>
            </div>
            <span className="etichetta">
              Formato valido · verifica tecnica distinta
            </span>
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
                      <td>
                        {products.length}
                        <br />
                        <small>
                          Geometria:{" "}
                          {
                            products.filter(
                              (p) => p.geometryAccuracy === "published",
                            ).length
                          }{" "}
                          quotate ·{" "}
                          {
                            products.filter(
                              (p) => p.geometryAccuracy === "schematic",
                            ).length
                          }{" "}
                          schematiche ·{" "}
                          {products.filter((p) => !p.geometryAccuracy).length}{" "}
                          non classificate. Prezzi non acquisiti.
                        </small>
                      </td>
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
