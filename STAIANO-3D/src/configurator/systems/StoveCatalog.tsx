"use client";
import { useState } from "react";
import Image from "next/image";
import ModelPreview from "@/configurator/viewer3d/ModelPreview";
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
  const [showModel, setShowModel] = useState(false);
  const modelColors: Record<string, Record<string, string>> = {
    "nordica-amika-ad": { Bianco: "bianco", Nero: "nero" },
    "nordica-amika-petra-ad": { "Pietra Naturale": "pietra" },
    "nordica-angelica-evo": { Avorio: "avorio", Nero: "nero", Bordeaux: "bordeaux" },
    "nordica-angelica-junior": { Nero: "nero", Avorio: "avorio", "Tortora Matt": "tortora-matt" },
    "nordica-dahiana-ad": { Avorio: "avorio", Bordeaux: "bordeaux", Nero: "nero", Bronzo: "bronzo" },
    "nordica-daniela": { Nero: "nero", Avorio: "avorio", "Tortora Matt": "tortora-matt", "Grigio Grafite": "grigio-grafite" },
    "nordica-debby-evo": { Bianco: "bianco", Nero: "nero" },
    "nordica-debby-petra-evo": { "Pietra Naturale": "pietra" },
    "nordica-katia-11-50-evo": { Bronzo: "bronzo", Bianco: "bianco", "Tortora Matt": "tortora-matt" },
    "nordica-katia-9-50-evo": { Bronzo: "bronzo", Bianco: "bianco", "Tortora Matt": "tortora-matt" },
    "nordica-ketty-50": { Bianco: "bianco", Bordeaux: "bordeaux", Nero: "nero", Avorio: "avorio" },
    "nordica-klaudia-ad-evo": { Nero: "nero", Bordeaux: "bordeaux", Bianco: "bianco" },
    "nordica-lucia16": { Tortora: "tortora", Bordeaux: "bordeaux", Bianco: "bianco" },
    "nordica-luisella-50": { Nero: "nero", "Grigio Grafite": "grigio-grafite", Bordeaux: "bordeaux" },
    "nordica-luisella-50-maxi": { "Grigio Grafite": "grigio-grafite", Nero: "nero" },
    "nordica-mariella-ad": { Avorio: "avorio", Bordeaux: "bordeaux", Nero: "nero" },
    "nordica-noris-evo": { Bronzo: "bronzo", Bianco: "bianco", "Tortora Matt": "tortora-matt" },
    "nordica-noris-lux-evo": { Tortora: "tortora", Bianco: "bianco" },
    "nordica-peggy": { Nero: "nero" },
    "nordica-sabry-ad": { "Grigio Grafite": "grigio-grafite", Avorio: "avorio", Bronzo: "bronzo", Nero: "nero" },
    "nordica-teodora-evo": { Nero: "nero" },
    "nordica-teorema-ad": { Avorio: "avorio", Bordeaux: "bordeaux", Nero: "nero" },
    "nordica-angelica-plus-evo": { Avorio: "avorio", Bordeaux: "bordeaux", Nero: "nero" },
    "nordica-annabella-plus-50": { Bianco: "bianco", Nero: "nero", "Tortora Matt": "tortora-matt" },
    "nordica-annalisa-plus-crystal-evo": { Nero: "nero" },
    "nordica-annalisa-plus-gres-evo": { "Gres Ostuni": "gres-ostuni", "Gres Corten": "gres-corten" },
    "nordica-dahiana-plus-ad": { Avorio: "avorio", Bordeaux: "bordeaux", Nero: "nero", Bronzo: "bronzo" },
    "nordica-daniela-plus": { Nero: "nero", Avorio: "avorio", "Tortora Matt": "tortora-matt", "Grigio Grafite": "grigio-grafite" },
    "nordica-klaudia-plus-ad-evo": { Nero: "nero", Bordeaux: "bordeaux", Bianco: "bianco" },
    "nordica-lucia-plus16": { Tortora: "tortora", Bordeaux: "bordeaux", Bianco: "bianco" },
    "nordica-mariella-plus-ad": { Avorio: "avorio", Bordeaux: "bordeaux", Nero: "nero" },
    "nordica-marilena-plus-50-ad": { Bianco: "bianco", Nero: "nero" },
    "nordica-marilena-plus-crystal-50-ad": { "Fume'": "fume", Bianco: "bianco" },
    "nordica-marilena-plus-petra-50-ad": { "Pietra Naturale": "pietra" },
    "nordica-noris-plus-evo": { Bronzo: "bronzo", Bianco: "bianco", "Tortora Matt": "tortora-matt" },
    "nordica-noris-plus-lux-evo": { Tortora: "tortora", Bianco: "bianco" },
    "nordica-sharon-plus-crystal": { Crystal: "crystal" },
    "nordica-sharon-plus-petra": { "Pietra Naturale": "pietra" },
    "nordica-sharon-plus-steel": { Nero: "nero" },
    "nordica-souvenir-plus-lux-50": { Bianco: "bianco", Tortora: "tortora" },
    "nordica-souvenir-plus-petra-50": { "Pietra Naturale": "pietra" },
    "nordica-souvenir-plus-steel-50": { Bianco: "bianco", Bordeaux: "bordeaux", Nero: "nero" },
    "nordica-teorema-plus-ad": { Nero: "nero", Avorio: "avorio", Bordeaux: "bordeaux" },
    "nordica-terry-plus": { Bianco: "bianco", Bordeaux: "bordeaux", "Tortora Lucido": "tortora-lucido" },
    "nordica-costanza-idro-50": { Bianco: "bianco", Bordeaux: "bordeaux" },
    "nordica-evelyne-idro-evo": { Grigio: "grigio", Bianco: "bianco", Tortora: "tortora" },
    "nordica-floriana-idro-crystal": { Crystal: "crystal" },
    "nordica-floriana-idro-gres": { "Gres Corten": "gres-corten", "Gres Ostuni": "gres-ostuni" },
    "ravelli-flexi-7": { Bianco: "bianco", Nero: "nero" },
  };
  const finish = product && modelColors[product.id]?.[color];
  const modelUrl = product && finish ? `/models/stoves/${product.id}-${finish}.glb` : null;
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
                  setShowModel(false);
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
          <div>
          {showModel && modelUrl ? <ModelPreview url={modelUrl} /> : product.photo && (
            <Image
              src={product.photo}
              alt={`${product.brand} ${product.name}`}
              width={480}
              height={480}
              unoptimized
            />
          )}
          {modelUrl && <button type="button" className="bottone tenue" onClick={() => setShowModel(!showModel)}>{showModel ? "Mostra fotografia" : "Mostra modello 3D"}</button>}
          {showModel && modelUrl && <p className="nota">Modello 3D a stufa spenta.</p>}
          </div>
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
