"use client";
import { useEffect, useState } from "react";
import type { Project } from "@/schemas/project";
import type {
  EasyfattMapping,
  EasyfattMappings,
} from "@/domain/catalogs/easyfatt-mapping";
import { buildDossier } from "@/services/pdf/dossier";
import { loadEasyfattMappings } from "@/services/export/easyfatt-mappings";
import { radiatorProducts } from "@/domain/catalogs/radiators";
import { fanCoilCatalog } from "@/domain/catalogs/fan-coils";
import ecoclimaArticles from "../../../catalog-data/generated/ecoclima-articles.json" with { type: "json" };
import { easyfattArticleKey } from "@/domain/catalogs/easyfatt-mapping";

function MappingRow({
  item,
  mapping,
  saved,
}: {
  item: Pick<
    ReturnType<typeof buildDossier>["materials"][number],
    "mappingKey" | "description" | "unit"
  > & { sku?: string };
  mapping?: EasyfattMapping;
  saved: (mapping: EasyfattMapping | null) => void;
}) {
  const [code, setCode] = useState(mapping?.code ?? "");
  const [supplierCode, setSupplierCode] = useState(mapping?.supplierCode ?? "");
  const [supplier, setSupplier] = useState(mapping?.supplier ?? "");
  const [multiplier, setMultiplier] = useState(
    String(mapping?.multiplier ?? 1),
  );
  const [quantity, setQuantity] = useState<EasyfattMapping["quantity"]>(
    mapping?.quantity ?? "pieces",
  );
  const [message, setMessage] = useState("");
  async function save() {
    const value = code.trim() || supplierCode.trim()
      ? { code: code.trim(), supplierCode: supplierCode.trim(), supplier: supplier.trim(), multiplier: Number(multiplier), quantity }
      : null;
    if (
      value &&
      (!Number.isFinite(value.multiplier) ||
        value.multiplier <= 0 ||
        value.multiplier > 10000)
    ) {
      setMessage("Inserire un moltiplicatore positivo.");
      return;
    }
    setMessage("Salvataggio…");
    try {
      const response = await fetch("/api/easyfatt-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: item.mappingKey, mapping: value }),
      });
      if (!response.ok) throw new Error();
      saved(value);
      setMessage("Salvato per tutti gli utenti.");
    } catch {
      setMessage("Salvataggio non riuscito.");
    }
  }
  return (
    <div className="catalogo-serie">
      <strong>{item.description}</strong>
      {item.sku && (
        <p className="nota">Codice di catalogo: {item.sku}</p>
      )}
      <div className="azioni">
        <label>
          Codice gestionale Easyfatt{" "}
          <input
            value={code}
            maxLength={100}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <label>
          Codice prodotto fornitore Easyfatt{" "}
          <input value={supplierCode} maxLength={100} onChange={(e) => setSupplierCode(e.target.value)} />
        </label>
        <label>
          Fornitore{" "}
          <input value={supplier} maxLength={100} onChange={(e) => setSupplier(e.target.value)} />
        </label>
        <label>
          Quantità{" "}
          <select
            value={quantity}
            onChange={(e) =>
              setQuantity(e.target.value as EasyfattMapping["quantity"])
            }
          >
            <option value="pieces">Pezzi / batterie</option>
            <option value="material">Quantità distinta ({item.unit})</option>
          </select>
        </label>
        <label>
          Moltiplicatore{" "}
          <input
            type="number"
            min="0.001"
            max="10000"
            step="any"
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="bottone piccolo"
          onClick={() => void save()}
        >
          Salva codice
        </button>
      </div>
      <span role="status" className="nota">
        {message}
      </span>
    </div>
  );
}

export function EasyfattCatalogEditor() {
  const [mappings, setMappings] = useState<EasyfattMappings | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    loadEasyfattMappings()
      .then(setMappings)
      .catch(() => setError("Codici condivisi non disponibili."));
  }, []);
  const products = [
    ...radiatorProducts.map((p) => ({
      mappingKey: `rad:${p.id}`,
      description: `${p.manufacturer} ${p.model}`,
      unit: p.construction === "fixed" ? "pezzi" : "elementi",
      sku: p.code ?? undefined,
    })),
    ...fanCoilCatalog.products.map((p) => ({
      mappingKey: `fan-coil:${p.id}`,
      description: `${p.manufacturer} ${p.family} ${p.model}`,
      unit: "pezzi",
      sku: p.model,
    })),
    ...Object.values(ecoclimaArticles.articles).map((article) => ({
      mappingKey: `ecoclima:${article.code}`,
      description: `Ecoclima ${article.description.replace(/\s+/g, " ")}`,
      unit: "pezzi",
      sku: article.code,
    })),
  ];
  const matching =
    query.trim().length >= 2
      ? products
          .filter((p) =>
            `${p.description} ${p.mappingKey} ${p.sku ?? ""}`
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase()),
          )
          .slice(0, 100)
      : [];
  return (
    <section className="catalogo-scheda">
      <h3>Codici Easyfatt condivisi</h3>
      <p className="nota">
        Cerca radiatori, ventilconvettori e articoli Ecoclima per associare il
        i codici gestionali e fornitore. Per gli altri articoli usa la distinta del progetto.
        Le associazioni sono condivise tra utenti.
      </p>
      <label>
        Cerca articolo{" "}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nome o modello"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {mappings &&
        matching.map((item) => (
          <MappingRow
            key={item.mappingKey}
            item={item}
            mapping={mappings[item.mappingKey]}
            saved={(value) =>
              setMappings((old) => {
                const next = { ...old };
                if (value) next[item.mappingKey] = value;
                else delete next[item.mappingKey];
                return next;
              })
            }
          />
        ))}
      {query.trim().length >= 2 && !matching.length && (
        <p>Nessun articolo trovato.</p>
      )}
    </section>
  );
}
export function EasyfattMappingsEditor({ project }: { project: Project }) {
  const [mappings, setMappings] = useState<EasyfattMappings | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    loadEasyfattMappings()
      .then(setMappings)
      .catch(() => setError("Codici condivisi non disponibili."));
  }, []);
  const dossier = buildDossier(project);
  const rows = [
    ...new Map(
      [...dossier.materials, ...dossier.accessories].map((row) => [
        easyfattArticleKey(row),
        {
          ...row,
          sku: row.sku ?? row.supplierCode,
          mappingKey: mappings?.[easyfattArticleKey(row)]
            ? easyfattArticleKey(row)
            : mappings?.[row.mappingKey]
              ? row.mappingKey
              : easyfattArticleKey(row),
        },
      ]),
    ).values(),
  ];
  return (
    <details>
      <summary>Codici Easyfatt condivisi</summary>
      <p className="nota">
        Associa gli articoli presenti nel progetto ai codici Easyfatt. Le
        modifiche sono condivise; per i radiatori venduti per elemento scegli
        “Quantità distinta (elementi)”. Lascia entrambi i codici vuoti per rimuovere
        l’associazione.
      </p>
      {error && <p role="alert">{error}</p>}
      {mappings &&
        rows.map((item) => (
          <MappingRow
            key={item.mappingKey}
            item={item}
            mapping={mappings[item.mappingKey]}
            saved={(value) =>
              setMappings((old) => {
                const next = { ...old };
                if (value) next[item.mappingKey] = value;
                else delete next[item.mappingKey];
                return next;
              })
            }
          />
        ))}
    </details>
  );
}
