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
    "nordica-guenda-idro-evo": { Avorio: "avorio", Bronzo: "bronzo", "Tortora Matt": "tortora-matt" },
    "nordica-iside-idro-5016": { Bianco: "bianco", Pergamena: "pergamena", "Vogue Ametista": "vogue-ametista" },
    "nordica-isidora-idro-h16-50-evo": { "Tortora Lucido": "tortora-lucido", Bianco: "bianco", Bordeaux: "bordeaux" },
    "nordica-isidora-idro-h20-50-evo": { Avorio: "avorio", Bianco: "bianco", Bordeaux: "bordeaux" },
    "nordica-isidora-idro-h23-50-evo": { Avorio: "avorio", Bianco: "bianco", Bordeaux: "bordeaux" },
    "nordica-marina-idro-h11": { Bronzo: "bronzo", Avorio: "avorio", Bordeaux: "bordeaux" },
    "nordica-marina-idro-h13": { Bronzo: "bronzo", Avorio: "avorio", Bordeaux: "bordeaux" },
    "nordica-miriana-idro-h16": { Avorio: "avorio", Nero: "nero", "Tortora Matt": "tortora-matt" },
    "nordica-miriana-idro-h20": { Avorio: "avorio", Nero: "nero", "Tortora Matt": "tortora-matt" },
    "nordica-miriana-idro-h23": { Avorio: "avorio", Nero: "nero", "Tortora Matt": "tortora-matt" },
    "nordica-raffaella-idro-h15-5016": { Bianco: "bianco", Bordeaux: "bordeaux", "Grigio Luce": "grigio-luce" },
    "nordica-raffaella-idro-h18-5016": { "Grigio Luce": "grigio-luce", Avorio: "avorio" },
    "nordica-rosanna-idro-50": { Nero: "nero", Bordeaux: "bordeaux", Avorio: "avorio", Bronzo: "bronzo" },
    "nordica-virna-idro16": { Bordeaux: "bordeaux", Bianco: "bianco", "Tortora Matt": "tortora-matt" },
    "ravelli-flexi-7": { Bianco: "bianco", Nero: "nero" },
    "ravelli-flexi-9": { Bianco: "bianco", Bordeaux: "bordeaux", Nero: "nero", Grigio: "grigio" },
    "ravelli-aria": { Bianco: "bianco", Nero: "nero" },
    "ravelli-alfa-s": { Nero: "nero" },
    "ravelli-whisper-7": { Bianco: "bianco", Nero: "nero", Bronzo: "bronzo" },
    "ravelli-elettra": { Bianco: "bianco", Nero: "nero" },
    "ravelli-circular-7": { Nero: "nero", Bronzo: "bronzo" },
    "ravelli-circular-9-2": { Bianco: "bianco", Nero: "nero", Bronzo: "bronzo" },
    "ravelli-hoop-7": { Bianco: "bianco", Bronzo: "bronzo" },
    "ravelli-hoop-9": { Bronzo: "bronzo" },
    "ravelli-mild": { Nero: "nero" },
    "ravelli-easy-7": { Bianco: "bianco", Bordeaux: "bordeaux", Nero: "nero", Bronzo: "bronzo" },
    "ravelli-easy-9": { Bianco: "bianco", Bordeaux: "bordeaux", Nero: "nero", Bronzo: "bronzo" },
    "ravelli-hrv-160-design": { Nero: "nero" },
    "ravelli-hrv-100-touch": { Bianco: "bianco" },
    "ravelli-hrv-140-touch": { Bianco: "bianco", Nero: "nero", Bordeaux: "bordeaux" },
    "ravelli-hrv-160-touch-steel": { Bianco: "bianco", Bordeaux: "bordeaux", Bronzo: "bronzo" },
    "ravelli-hrv-200": { Bianco: "bianco", Bronzo: "bronzo" },
    "ravelli-hrv-250": { Bianco: "bianco" },
    "ravelli-hrv-180-silhouette": { Nero: "nero" },
    "ravelli-dual-7": { Bianco: "bianco", Nero: "nero", Bronzo: "bronzo" },
    "ravelli-dual-9": { Bianco: "bianco", Nero: "nero", Bronzo: "bronzo" },
    "ravelli-s70": { Bianco: "bianco", Grigio: "grigio", Bronzo: "bronzo" },
    "ravelli-s90": { Bianco: "bianco", Grigio: "grigio", Bronzo: "bronzo" },
    "ravelli-r-70": { Bianco: "bianco", Nero: "nero", Bordeaux: "bordeaux", Nocciola: "nocciola" },
    "ravelli-rv80": { Bianco: "bianco", Nero: "nero", Bordeaux: "bordeaux" },
    "ravelli-rv-100": { Bianco: "bianco", Nero: "nero", Bordeaux: "bordeaux" },
    "ravelli-rv-110": { Bianco: "bianco", Bordeaux: "bordeaux" },
    "ravelli-sphere-v": { Bianco: "bianco", Bordeaux: "bordeaux", Nero: "nero", Bronzo: "bronzo", Grigio: "grigio" },
    "ravelli-rv-120-touch-steel": { Bianco: "bianco", Nero: "nero" },
    "ravelli-block-9": { Grigio: "grigio" },
    "ravelli-block-7": { Grigio: "grigio" },
    "ravelli-luna": { Nero: "nero" },
    "ravelli-vittoria-v": { Bianco: "bianco", Nero: "nero", Bordeaux: "bordeaux" },
    "ravelli-easy-12": { Bianco: "bianco", Bordeaux: "bordeaux", Bronzo: "bronzo" },
    "ravelli-easy-12-c": { Bianco: "bianco" },
    "ravelli-sphere-c": { Bianco: "bianco", Bordeaux: "bordeaux", Nero: "nero", Bronzo: "bronzo", Grigio: "grigio" },
    "ravelli-line": { Verde: "verde", Bronzo: "bronzo", Nero: "nero" },
    "ravelli-stilo": { Grigio: "grigio", Bianco: "bianco", Nero: "nero" },
    "ravelli-olivia-steel": { Bianco: "bianco", Nero: "nero", Bordeaux: "bordeaux" },
    "ravelli-rc-120-touch-steel": { Bianco: "bianco", Nero: "nero" },
    "ravelli-rc-70": { Bianco: "bianco", Bordeaux: "bordeaux", Nero: "nero" },
    "ravelli-sc-90": { Bianco: "bianco", Grigio: "grigio", Bronzo: "bronzo" },
    "ravelli-vittoria-c": { Bianco: "bianco", Nero: "nero", Bordeaux: "bordeaux" },
    "ravelli-hrv-120-style": { Bianco: "bianco", Nero: "nero", Bordeaux: "bordeaux" },
    "ravelli-hrv-100-globe": { Bianco: "bianco", Nero: "nero", Bordeaux: "bordeaux" },
    "ravelli-hrv-140-silhouette": { Nero: "nero" },
    "ravelli-hrv-160-touch": { Bianco: "bianco", Bordeaux: "bordeaux" },
    "ravelli-hrv-120-country": { Bianco: "bianco", Bordeaux: "bordeaux" },
    "ravelli-hrv-180-plus": { Bianco: "bianco", Bordeaux: "bordeaux" },
    "ravelli-hrv-120-plus": { Bianco: "bianco", Nero: "nero", Bordeaux: "bordeaux" },
    "ravelli-hrv-140-globe": { Bianco: "bianco", Bordeaux: "bordeaux" },
    "ravelli-dafne-view": { Nero: "nero" },
    "ravelli-dafne": { Nero: "nero" },
    "ravelli-minerva": { Nero: "nero" },
    "ravelli-minerva-stone": { Grigio: "grigio" },
    "ravelli-calliope-stone": { Grigio: "grigio" },
    "ravelli-thor": { Nero: "nero" },
    "ravelli-efesto": { Nero: "nero" },
    "nordica-larissa16": { "Nero Antracite": "nero-antracite" },
    "nordica-asia-50": { Vulcan: "vulcan" },
    "nordica-aurelia-eos-ceramica": { Panna: "panna", Bordeaux: "bordeaux" },
    "nordica-aurelia-eos-petra": { "Pietra Naturale": "pietra" },
    "nordica-aurelia-eos-steel": { "Nero Antracite": "nero-antracite" },
    "nordica-brigitta16": { Nero: "nero" },
    "nordica-candy-eos165": { "Nero Antracite": "nero-antracite" },
    "nordica-concita16-maiolica": { Bordeaux: "bordeaux", "Bianco Infinity": "bianco-infinity" },
    "nordica-concita16-steel": { "Nero Antracite": "nero-antracite" },
    "nordica-dante16": { "Nero Opaco": "nero-opaco" },
    "nordica-dante16-con-portalegna": { "Nero Opaco": "nero-opaco" },
    "nordica-emi-eos": { "Nero Antracite": "nero-antracite" },
    "nordica-emiliana165-maiolica": { Bordeaux: "bordeaux", "Bianco Infinity": "bianco-infinity" },
    "nordica-emiliana165-steel": { "Nero Antracite": "nero-antracite" },
    "nordica-ester-50": { Vulcan: "vulcan" },
    "nordica-ester-forno-50": { Vulcan: "vulcan" },
    "nordica-fedora16-maiolica": { "Bianco Infinity": "bianco-infinity", Bordeaux: "bordeaux" },
    "nordica-fedora16-steel": { "Nero Antracite": "nero-antracite" },
    "nordica-gemma16-ceramica": { "Liberty Panna": "liberty-panna", "Elegance Bordeaux": "elegance-bordeaux", "Elegance Bianco Infinity": "elegance-bianco-infinity" },
    "nordica-gemma16-petra": { "Pietra Naturale": "pietra" },
    "nordica-gemma-forno165-ceramica": { "Elegance Bordeaux": "elegance-bordeaux", "Elegance Bianco Infinity": "elegance-bianco-infinity" },
    "nordica-gemma-forno165-petra": { "Pietra Naturale": "pietra" },
    "nordica-giulietta165": { "Nero Antracite": "nero-antracite" },
    "nordica-isetta165": { "Nero Antracite": "nero-antracite" },
    "nordica-isetta-cc165": { "": "nero-antracite" },
    "nordica-isetta-forno": { "Nero Antracite": "nero-antracite" },
    "nordica-isotta-cc-eos165": { "Nero Antracite": "nero-antracite" },
    "nordica-isotta-eos165": { "Nero Antracite": "nero-antracite" },
    "nordica-isotta-forno-eos": { "Nero Antracite": "nero-antracite" },
    "nordica-jennifer16-eps": { "Nero Antracite": "nero-antracite" },
    "nordica-lavinia-eos": { "Nero Antracite": "nero-antracite" },
    "nordica-liu-16-maiolica": { Bordeaux: "bordeaux", "Bianco Infinity": "bianco-infinity" },
    "nordica-liu-16-petra": { "Pietra Naturale": "pietra" },
    "nordica-marlena16": { "Nero Antracite": "nero-antracite" },
    "nordica-nova-forno16-maiolica": { "Bianco Opaco": "bianco-opaco", Bordeaux: "bordeaux" },
    "nordica-nova-forno16-steel": { "Nero Antracite": "nero-antracite" },
    "nordica-rossella-plforno165-ceramica": { "Liberty Bordeaux": "liberty-bordeaux", "Liberty Panna": "liberty-panna" },
    "nordica-rossella-plus-forno165-petra": { "Pietra Naturale": "pietra" },
    "nordica-rossella-r116-ceramica": { "Liberty Bordeaux": "liberty-bordeaux", "Liberty Bianco Infinity": "liberty-bianco-infinity", "Liberty Panna": "liberty-panna" },
    "nordica-rossella-r116-petra": { "Pietra Naturale": "pietra" },
    "nordica-termorossella-plus-dsa16-cera": { "Liberty Panna": "liberty-panna", "Liberty Bordeaux": "liberty-bordeaux" },
    "nordica-termorossella-plus-dsa16-petr": { "Pietra Naturale": "pietra" },
    "nordica-trossplus-forno-dsa16-ceram": { "Liberty Panna": "liberty-panna", "Liberty Bordeaux": "liberty-bordeaux" },
    "nordica-trossplus-forno-dsa16-petra": { "Pietra Naturale": "pietra" },
    "nordica-super-junior-lean": { Nero: "nero", Verde: "verde" },
    "nordica-tea16": { "Nero Antracite": "nero-antracite", Bianco: "bianco" },
    "nordica-sierra16": { "Nero Antracite": "nero-antracite" },
    "nordica-termorosa-dsa16-ceramica": { Bordeaux: "bordeaux" },
    "nordica-termorosa-dsa16-petra": { "Pietra Naturale": "pietra" },
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
