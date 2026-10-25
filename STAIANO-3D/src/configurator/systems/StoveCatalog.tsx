"use client";
import { useState } from "react";
import Image from "next/image";
import {
  stoveBrands,
  stoveCatalog,
  type StoveProduct,
} from "@/domain/catalogs/stoves";
import styles from "./StoveCatalog.module.css";

const formatPower = (
  value: { minW: number; maxW: number } | null | undefined,
) =>
  value
    ? value.minW === value.maxW
      ? `${(value.minW / 1000).toLocaleString("it-IT")} kW`
      : `${(value.minW / 1000).toLocaleString("it-IT")}–${(value.maxW / 1000).toLocaleString("it-IT")} kW`
    : null;

export function StoveCatalog() {
  const [brand, setBrand] = useState("");
  const [technology, setTechnology] = useState("");
  const [product, setProduct] = useState<StoveProduct | null>(null);
  const [color, setColor] = useState("");
  const [query, setQuery] = useState("");
  const technical = product?.technical ?? null;
  const officialSources = technical
    ? [
        technical.sourceMetadata,
        ...technical.supportingSources.map((item) => item.sourceMetadata),
      ]
    : [];
  const products = stoveCatalog.products.filter((item) => item.brand === brand);
  const technologies = [
    ...new Set(products.map((item) => `${item.fuel} · ${item.technology}`)),
  ];
  const visible = products.filter(
    (item) =>
      `${item.fuel} · ${item.technology}` === technology &&
      item.name.toLocaleLowerCase("it").includes(query.toLocaleLowerCase("it")),
  );

  return (
    <section
      className={`catalogo-scheda ${styles.catalog}`}
      aria-label="Catalogo stufe"
    >
      <h3>Stufe · scegli insieme al cliente</h3>
      <p className="nota">
        {stoveCatalog.products.length} modelli a pellet e legna · fotografie e
        finiture del produttore · aggiornato il{" "}
        {new Date(stoveCatalog.retrievedAt).toLocaleDateString("it-IT")}
      </p>
      <nav className={styles.breadcrumb} aria-label="Percorso catalogo stufe">
        <button
          type="button"
          className="bottone piccolo tenue"
          onClick={() => {
            setBrand("");
            setTechnology("");
            setProduct(null);
          }}
        >
          Marchi
        </button>
        {brand && (
          <button
            type="button"
            className="bottone piccolo tenue"
            onClick={() => {
              setTechnology("");
              setProduct(null);
            }}
          >
            {brand}
          </button>
        )}
        {technology && (
          <button
            type="button"
            className="bottone piccolo tenue"
            onClick={() => setProduct(null)}
          >
            {technology}
          </button>
        )}
        {product && <strong>{product.name}</strong>}
      </nav>
      {!brand ? (
        <div className={styles.grid}>
          {stoveBrands.map((name) => (
            <button
              type="button"
              className={styles.choice}
              key={name}
              onClick={() => setBrand(name)}
            >
              <Image
                src={
                  stoveCatalog.products.find(
                    (item) => item.brand === name && item.photo,
                  )?.photo ?? "/logo.svg"
                }
                alt=""
                width={180}
                height={180}
                unoptimized
              />
              <strong>{name}</strong>
              <span>
                {
                  stoveCatalog.products.filter((item) => item.brand === name)
                    .length
                }{" "}
                modelli
              </span>
            </button>
          ))}
        </div>
      ) : !technology ? (
        <div className={styles.grid}>
          {technologies.map((kind) => (
            <button
              type="button"
              className={styles.choice}
              key={kind}
              onClick={() => {
                setTechnology(kind);
                setQuery("");
              }}
            >
              <Image
                src={
                  products.find(
                    (item) =>
                      `${item.fuel} · ${item.technology}` === kind &&
                      item.photo,
                  )?.photo ?? "/logo.svg"
                }
                alt=""
                width={180}
                height={180}
                unoptimized
              />
              <strong>{kind}</strong>
              <span>
                {
                  products.filter(
                    (item) => `${item.fuel} · ${item.technology}` === kind,
                  ).length
                }{" "}
                modelli
              </span>
            </button>
          ))}
        </div>
      ) : !product ? (
        <>
          <label className={styles.search}>
            Cerca modello
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              placeholder="Nome della stufa"
            />
          </label>
          <div className={styles.grid}>
            {visible.map((item) => (
              <button
                type="button"
                className={styles.choice}
                key={item.id}
                onClick={() => {
                  setProduct(item);
                  setColor(item.colors[0] ?? "");
                }}
              >
                {item.photo && (
                  <Image
                    src={item.photo}
                    alt=""
                    width={180}
                    height={180}
                    unoptimized
                  />
                )}
                <strong>{item.name}</strong>
                <span>
                  {formatPower(item.technical?.nominalPowerW) ??
                    item.power ??
                    "Potenza nella scheda ufficiale"}
                </span>
              </button>
            ))}
          </div>
          {!visible.length && (
            <p role="status">Nessun modello trovato. Modifica la ricerca.</p>
          )}
        </>
      ) : (
        <div className={styles.detail}>
          {product.photo && (
            <Image
              src={product.photo}
              alt={`${product.brand} ${product.name}`}
              width={480}
              height={480}
              unoptimized
            />
          )}
          <div>
            <h4>{product.name}</h4>
            <p>
              {product.brand} · {product.fuel} · {product.technology}
            </p>
            <p>
              <strong>
                {formatPower(technical?.nominalPowerW) ?? product.power}
              </strong>
            </p>
            {technical && (
              <section aria-label="Dati tecnici verificati">
                <h5>Dati tecnici verificati</h5>
                <dl className={styles.technical}>
                  {formatPower(technical.nominalPowerW) && (
                    <div>
                      <dt>Potenza nominale</dt>
                      <dd>{formatPower(technical.nominalPowerW)}</dd>
                    </div>
                  )}
                  {technical.dimensionsMm && (
                    <div>
                      <dt>Ingombro nominale (L × H × P)</dt>
                      <dd>
                        {[
                          technical.dimensionsMm.widthMm,
                          technical.dimensionsMm.heightMm,
                          technical.dimensionsMm.depthMm,
                        ]
                          .map((value) => value.toLocaleString("it-IT"))
                          .join(" × ")}{" "}
                        mm
                      </dd>
                    </div>
                  )}
                  {technical.weightKg != null && (
                    <div>
                      <dt>Peso netto</dt>
                      <dd>{technical.weightKg.toLocaleString("it-IT")} kg</dd>
                    </div>
                  )}
                  {formatPower(technical.waterPowerW) && (
                    <div>
                      <dt>Potenza resa all&apos;acqua</dt>
                      <dd>{formatPower(technical.waterPowerW)}</dd>
                    </div>
                  )}
                  {technical.partLoadPowerW != null && (
                    <div>
                      <dt>Potenza a carico parziale</dt>
                      <dd>
                        {technical.partLoadPowerW.toLocaleString("it-IT")} W
                      </dd>
                    </div>
                  )}
                  {technical.flueDiameterMm != null && (
                    <div>
                      <dt>Diametro scarico fumi</dt>
                      <dd>
                        Ø {technical.flueDiameterMm.toLocaleString("it-IT")} mm
                      </dd>
                    </div>
                  )}
                </dl>
                {technical.articleCode && (
                  <p className="nota">
                    Articolo {technical.articleCode} · Revisione{" "}
                    {technical.sourceMetadata.documentRevision}
                  </p>
                )}
                <details className={styles.sources}>
                  <summary>
                    Fonti del produttore · {officialSources.length}
                  </summary>
                  <ul>
                    {officialSources.map((source) => (
                      <li key={source.sha256}>
                        <a
                          href={
                            source.sourceType === "pdf" && source.page
                              ? `${source.sourceUrl}#page=${source.page}`
                              : source.sourceUrl
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          {source.sourceType === "pdf"
                            ? `Scheda tecnica PDF · pagina ${source.page}`
                            : source.sourceType === "json"
                              ? "Dati del prodotto dal produttore (JSON)"
                              : "Pagina ufficiale del modello"}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              </section>
            )}
            <fieldset className={styles.finishes}>
              <legend>Finitura del produttore</legend>
              {product.colors.map((finish) => (
                <button
                  type="button"
                  className="bottone tenue"
                  key={finish}
                  aria-pressed={color === finish}
                  onClick={() => setColor(finish)}
                >
                  {finish}
                </button>
              ))}
              {!product.colors.length && (
                <p className="nota">
                  Consulta le finiture nella scheda ufficiale.
                </p>
              )}
            </fieldset>
            {color && (
              <p role="status">
                Finitura scelta: <strong>{color}</strong>
              </p>
            )}
            <p className="nota">
              La fotografia mostra il modello; il colore selezionato può
              differire dalla foto.
            </p>
            <a
              className="bottone tenue"
              href={technical?.sourceMetadata.sourceUrl ?? product.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {technical?.sourceMetadata.sourceType === "pdf"
                ? "Scheda tecnica ufficiale PDF"
                : "Scheda ufficiale · foto e dati tecnici"}
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
