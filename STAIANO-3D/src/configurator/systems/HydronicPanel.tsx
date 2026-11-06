"use client";
import { useState } from "react";
import Image from "next/image";
import type { Point, Project } from "@/schemas/project";
import {
  heatPumpPreference,
  recommendedHeatPump,
} from "@/domain/hydronic/size";
import {
  heatPumpCatalog,
  heatPumpCapacity,
  heatPumpProductAtVersion,
} from "@/domain/catalogs/heat-pumps";
import {
  applyHydronicSystem,
  removeHydronicSystem,
} from "@/domain/hydronic/apply";
import { initialHydronicOutdoorPose } from "@/domain/hydronic/placement";
import { validateHydronicSystem } from "@/domain/hydronic/validation";
import { fanCoilProductAtVersion } from "@/domain/catalogs/fan-coils";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber } from "@/utils/format";
import styles from "./DuctedMachinePicker.module.css";
import configurationStyles from "./SystemConfiguration.module.css";
import { lastAvailableManufacturer } from "./manufacturer-preference";
import { HydronicProperties } from "../properties/HydronicProperties";
import panelStyles from "./HydronicPanel.module.css";
import { BrandModelSize } from "./BrandModelSize";

export function HydronicPanel({
  project,
  floorId,
  onPlace,
  systemId,
  formId,
  position,
  connectedRooms,
  connectedCoils,
}: {
  project: Project;
  floorId: string;
  onPlace?: (change: (project: Project) => Project) => void;
  systemId?: string;
  formId?: string;
  position?: Point;
  connectedRooms?: string[];
  connectedCoils?: string[];
}) {
  const { commit, select } = useProjectStore();
  const existing = project.hydronicSystems?.find(
    (system) => system.id === systemId,
  );
  const existingProduct = existing
    ? heatPumpProductAtVersion(existing.productId, existing.catalogVersion)
    : undefined;
  const rooms = project.rooms.filter(
    (r) => r.floorId === floorId && !r.conditioningExclusion,
  );
  const brands = [
    ...new Set(heatPumpCatalog.products.map((product) => product.manufacturer)),
  ];
  const preferredManufacturer = lastAvailableManufacturer(
    (project.hydronicSystems ?? []).map(
      (system) =>
        heatPumpProductAtVersion(system.productId, system.catalogVersion)
          ?.manufacturer,
    ),
    brands,
  );
  const [manufacturer, setManufacturer] = useState<string>(
    existingProduct?.manufacturer ?? preferredManufacturer,
  );
  const [page, setPage] = useState<"configuration" | "schedule">(
    "configuration",
  );
  const preferredProduct = heatPumpCatalog.products
    .filter((product) => product.manufacturer === preferredManufacturer)
    .sort((a, b) => heatPumpPreference(a) - heatPumpPreference(b))[0];
  const [productId, setProductId] = useState(
    existing?.productId ?? preferredProduct.id,
  );
  const [operatingPointIndex, setOperatingPointIndex] = useState(
    existing?.operatingPointIndex ?? 1,
  );
  const [selectedRooms, setSelectedRooms] = useState<string[]>(
    connectedRooms ?? existing?.roomIds ?? rooms.map((r) => r.id),
  );
  const [selectedCoils, setSelectedCoils] = useState<string[]>(
    connectedCoils ?? existing?.fanCoilIds ?? [],
  );
  const [name, setName] = useState(existing?.name ?? "Pompa di calore");
  const products = heatPumpCatalog.products.filter(
    (p) => p.manufacturer === manufacturer,
  );
  const product = products.find((p) => p.id === productId) ?? products[0];
  const point =
    product.operatingPoints[operatingPointIndex] ?? product.operatingPoints[0];
  const capacity = heatPumpCapacity(point);
  const existingPoint =
    existing && existingProduct?.operatingPoints[existing.operatingPointIndex];
  const existingCapacity = existingPoint && heatPumpCapacity(existingPoint);
  const roomIds = selectedRooms.filter((id) => rooms.some((r) => r.id === id));
  const coils = (project.fanCoils ?? []).filter((u) =>
    roomIds.includes(u.roomId),
  );
  const claimed = new Set(
    project.hydronicSystems
      ?.filter((s) => s.id !== systemId)
      .flatMap((s) => s.fanCoilIds),
  );
  const fanCoilIds = selectedCoils.filter(
    (id) => coils.some((u) => u.id === id) && !claimed.has(id),
  );
  const load = rooms
    .filter((r) => roomIds.includes(r.id))
    .reduce((n, r) => n + r.designLoadW, 0);
  const pose = initialHydronicOutdoorPose(project, floorId, product);
  const recommended = recommendedHeatPump(project, floorId, {
    roomIds,
    manufacturer,
    operatingPointIndex,
    position,
    systemId,
  });
  const orderedProducts = [...products].sort(
    (a, b) =>
      Number(b.id === recommended?.id) - Number(a.id === recommended?.id) ||
      heatPumpPreference(a) - heatPumpPreference(b),
  );
  if (!formId)
    return (
      <section className="pannello-split">
        <p>
          Posiziona la PdC e i terminali sulla pianta, poi usa Collega. Per le
          unità canalizzate collega anche le bocchette prima di configurare.
        </p>
        <button
          className="bottone chiara"
          onClick={() => {
            useProjectStore.getState().setView("2d");
            useProjectStore.setState({
              planPlacementTool: "heatPump",
              tool: "select",
              selection: [],
            });
          }}
        >
          Inserisci PdC sulla pianta
        </button>
      </section>
    );
  return (
    <section className={formId ? styles.picker : "pannello-split"}>
      {existing && (
        <div
          className={panelStyles.tabs}
          role="group"
          aria-label="Pagine pompa di calore"
        >
          <button
            type="button"
            className="bottone"
            aria-pressed={page === "configuration"}
            onClick={() => setPage("configuration")}
          >
            Configurazione
          </button>
          <button
            type="button"
            className="bottone"
            aria-pressed={page === "schedule"}
            onClick={() => setPage("schedule")}
          >
            Dati impianto
          </button>
        </div>
      )}
      <form
        id={formId}
        style={page === "schedule" ? { display: "none" } : undefined}
        className={formId ? styles.layout : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          (onPlace ?? commit)((p) =>
            applyHydronicSystem(p, {
              systemId,
              name: formId ? name : undefined,
              productId: product.id,
              catalogVersion: heatPumpCatalog.version,
              roomIds,
              fanCoilIds,
              operatingPointIndex,
            }),
          );
        }}
      >
        <div className={formId ? styles.controls : undefined}>
          <h3>
            {formId
              ? "Ambienti e marca"
              : "Impianto idronico · pompa di calore"}
          </h3>
          <p className="nota">
            Una macchina esterna per impianto, collegata ai ventilconvettori
            selezionati. Puoi creare più impianti indipendenti.
          </p>
          {formId && (
            <label className="campo">
              <span>Nome macchina</span>
              <input
                aria-label="Nome pompa di calore"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
          <BrandModelSize
            name="pompa di calore"
            brands={brands.map((brand) => ({ key: brand, title: brand }))}
            brand={manufacturer}
            onBrand={(brand) => {
              setManufacturer(brand);
              setProductId(
                heatPumpCatalog.products
                  .filter((p) => p.manufacturer === brand)
                  .sort(
                    (a, b) => heatPumpPreference(a) - heatPumpPreference(b),
                  )[0].id,
              );
              setOperatingPointIndex(1);
            }}
            models={
              formId
                ? []
                : [...new Set(products.map((p) => p.family))].map((family) => {
                    const inFamily = products.filter(
                      (p) => p.family === family,
                    );
                    return {
                      key: family,
                      title: family,
                      detail: `${inFamily.length} ${inFamily.length === 1 ? "taglia" : "taglie"}`,
                      photo: {
                        src: inFamily[0].productPhoto.localPath,
                      },
                      recommended: recommended?.family === family,
                    };
                  })
            }
            model={product.family}
            onModel={(family) => {
              setProductId(
                (recommended?.family === family
                  ? recommended
                  : products.find((p) => p.family === family)!
                ).id,
              );
              setOperatingPointIndex(1);
            }}
            sizes={
              formId
                ? []
                : orderedProducts
                    .filter((p) => p.family === product.family)
                    .map((p) => {
                      const rating = heatPumpCapacity(
                        p.operatingPoints[operatingPointIndex] ??
                          p.operatingPoints[0],
                      );
                      return {
                        key: p.id,
                        title: p.model,
                        detail: `${formatNumber(rating.heatingW / 1000)} kW caldo · ${formatNumber(rating.coolingW / 1000)} kW freddo`,
                        recommended: p.id === recommended?.id,
                      };
                    })
            }
            size={product.id}
            onSize={(id) => {
              setProductId(id);
              setOperatingPointIndex(1);
            }}
          />
          {recommended && (
            <div
              className={configurationStyles.recommendation}
              aria-label="Pompa consigliata"
            >
              <strong>Consigliato · {recommended.model}</strong>
              <p>
                Taglia scelta sulle potenze massime dichiarate, dove
                disponibili. Copre {formatNumber(load / 1000)} kW degli ambienti
                serviti, in caldo e freddo alle condizioni scelte.
              </p>
              <button
                type="button"
                className="bottone"
                aria-pressed={product.id === recommended.id}
                onClick={() => setProductId(recommended.id)}
              >
                Usa consigliato
              </button>
            </div>
          )}
          {!recommended && roomIds.length > 0 && (
            <p className="nota">
              Nessun modello di questa marca copre entrambi i fabbisogni e trova
              spazio nella posizione scelta.
            </p>
          )}
          <Image
            unoptimized
            src={product.productPhoto.localPath}
            alt={product.productPhoto.caption}
            width={420}
            height={200}
            sizes="320px"
            style={{ width: "100%", height: 180, objectFit: "contain" }}
          />
          <p className="nota">{product.features.join(" · ")}</p>
          <label className="campo">
            <span>Condizioni di funzionamento</span>
            <select
              value={operatingPointIndex}
              onChange={(e) => setOperatingPointIndex(Number(e.target.value))}
            >
              {product.operatingPoints.map((p, i) => {
                const rating = heatPumpCapacity(p);
                return (
                  <option key={i} value={i}>
                    {p.label} · {formatNumber(rating.heatingW / 1000)} /{" "}
                    {formatNumber(rating.coolingW / 1000)} kW · {rating.basis}
                  </option>
                );
              })}
            </select>
          </label>
          <fieldset>
            <legend>Ambienti serviti dalla pompa</legend>
            {rooms.map((r) => (
              <label className="ambiente-servito" key={r.id}>
                <span>
                  <input
                    type="checkbox"
                    disabled={connectedRooms !== undefined}
                    checked={roomIds.includes(r.id)}
                    onChange={(e) =>
                      setSelectedRooms(
                        e.target.checked
                          ? [...selectedRooms, r.id]
                          : selectedRooms.filter((id) => id !== r.id),
                      )
                    }
                  />{" "}
                  {r.name} · {formatNumber(r.designLoadW / 1000)} kW
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Ventilconvettori collegati</legend>
            {!coils.length && (
              <p className="nota">
                Aggiungi i ventilconvettori negli ambienti prima di associarli.
              </p>
            )}
            {coils.map((u) => {
              const model = fanCoilProductAtVersion(
                u.productId,
                u.catalogVersion,
              );
              return (
                <label className="ambiente-servito" key={u.id}>
                  <span>
                    <input
                      type="checkbox"
                      disabled={
                        connectedCoils !== undefined || claimed.has(u.id)
                      }
                      checked={fanCoilIds.includes(u.id)}
                      onChange={(e) =>
                        setSelectedCoils(
                          e.target.checked
                            ? [...selectedCoils, u.id]
                            : selectedCoils.filter((id) => id !== u.id),
                        )
                      }
                    />{" "}
                    {model?.model ?? u.productId} ·{" "}
                    {rooms.find((r) => r.id === u.roomId)?.name}
                    {claimed.has(u.id) ? " · già collegato" : ""}
                  </span>
                </label>
              );
            })}
          </fieldset>
          <p className="formula">
            Fabbisogno preliminare {formatNumber(load / 1000)} kW
            <br />
            Pompa: potenze {capacity.basis}.{" "}
            {formatNumber(capacity.heatingW / 1000)} kW caldo ·{" "}
            {formatNumber(capacity.coolingW / 1000)} kW freddo
            <br />
            {Math.min(capacity.heatingW, capacity.coolingW) < load
              ? "Potenza inferiore alla stima: scegliere una taglia superiore."
              : "Potenze sufficienti per la stima alle condizioni selezionate."}
          </p>
          <p className="nota">
            {point.heatingConditions}
            <br />
            {point.coolingConditions}
            <br />
            Il confronto dei terminali richiede le stesse temperature
            dell’acqua. Portate, accumulo e perdite idrauliche da verificare.
          </p>
          {!formId && (
            <button
              type="submit"
              className="bottone chiara"
              disabled={!pose || !roomIds.length}
            >
              Aggiungi pompa all’esterno
            </button>
          )}
          {!pose && (
            <p role="status" className="nota">
              Verifica scala e contorni degli ambienti per individuare una
              posizione esterna libera.
            </p>
          )}
          <details>
            <summary>Dati e posa documentati</summary>
            <p className="nota">
              {product.dimensionNote}
              <br />
              Foto di gamma. Il 3D usa l’ingombro originale, con dettagli
              illustrativi.
            </p>
            <a
              href={product.sourceMetadata.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Scheda ufficiale {product.manufacturer} · pagina{" "}
              {product.sourceMetadata.page}
            </a>
          </details>
          {!formId &&
            (project.hydronicSystems ?? [])
              .filter((s) => s.outdoorUnit.floorId === floorId)
              .map((s) => {
                const model = heatPumpProductAtVersion(
                    s.productId,
                    s.catalogVersion,
                  ),
                  report = validateHydronicSystem(project, s);
                return (
                  <div className="formula" key={s.id}>
                    <strong>{s.name}</strong>
                    <br />
                    {model?.model ?? s.productId}
                    <br />
                    {s.roomIds.length} ambienti · {s.fanCoilIds.length}{" "}
                    ventilconvettori
                    <br />
                    <span>
                      {report.capacityCovered
                        ? `Pompa: potenze ${report.capacityBasis} coprono la stima.`
                        : "Pompa: capacità da verificare."}
                    </span>
                    <br />
                    <button
                      type="button"
                      className="bottone piccolo"
                      onClick={() =>
                        select({ kind: "device", id: s.outdoorUnit.id })
                      }
                    >
                      Posizione esterna e impianto
                    </button>{" "}
                    <button
                      type="button"
                      className="bottone piccolo pericolo"
                      disabled={s.outdoorUnit.locked}
                      onClick={() =>
                        commit((p) => removeHydronicSystem(p, s.id))
                      }
                    >
                      Rimuovi impianto
                    </button>
                  </div>
                );
              })}
        </div>
        {formId && (
          <section aria-label="Modelli pompa di calore">
            <div className={styles.catalogHeading}>
              <h3>Modelli pompa di calore</h3>
              <span>
                {products.length} modelli · fabbisogno{" "}
                {formatNumber(load / 1000)} kW
              </span>
            </div>
            <p className="nota">
              Scegli il modello per confrontare potenze e condizioni di
              funzionamento.
            </p>
            <div className={styles.models}>
              {orderedProducts.map((model) => {
                const rating =
                  model.operatingPoints[operatingPointIndex] ??
                  model.operatingPoints[0];
                const capacity = heatPumpCapacity(rating);
                return (
                  <button
                    type="button"
                    key={model.id}
                    className={styles.model}
                    aria-label={`Scegli ${model.model}`}
                    aria-pressed={product.id === model.id}
                    data-recommended={
                      model.id === recommended?.id ? "true" : undefined
                    }
                    onClick={() => setProductId(model.id)}
                  >
                    <span className={styles.modelName}>
                      <strong>{model.model}</strong>
                      {model.id === recommended?.id && (
                        <span className={styles.recommendedLabel}>
                          Consigliato
                        </span>
                      )}
                      <span>{model.family}</span>
                    </span>
                    <span>
                      {formatNumber(capacity.coolingW / 1000)} kW freddo ·{" "}
                      {formatNumber(capacity.heatingW / 1000)} kW caldo
                      <br />
                      Potenze {capacity.basis}
                    </span>
                    <span>
                      {model.widthMm} × {model.depthMm} × {model.heightMm} mm
                    </span>
                    <span className={styles.selectedLabel}>
                      {product.id === model.id ? "Selezionato" : "Scegli"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </form>
      {existing && page === "schedule" && (
        <section aria-label="Dati impianto pompa di calore">
          <div
            className={panelStyles.tableScroll}
            role="region"
            aria-label="Scheda tecnica pompa di calore"
            tabIndex={0}
          >
            <table className={panelStyles.table}>
              <caption>
                {existing.name} · {existingProduct?.manufacturer}{" "}
                {existingProduct?.model}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Dato</th>
                  <th scope="col">Valore configurato</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Modello</th>
                  <td>
                    {existingProduct?.family} ·{" "}
                    {existingProduct?.model ?? existing.productId}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Ingombro L × P × H</th>
                  <td>
                    {existing.outdoorUnit.widthMm} ×{" "}
                    {existing.outdoorUnit.depthMm} ×{" "}
                    {existing.outdoorUnit.heightMm} mm
                  </td>
                </tr>
                <tr>
                  <th scope="row">Condizioni</th>
                  <td>
                    {existingProduct?.operatingPoints[
                      existing.operatingPointIndex
                    ]?.label ?? "Da verificare"}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Potenza caldo / freddo</th>
                  <td>
                    {formatNumber((existingCapacity?.heatingW ?? 0) / 1000)} /{" "}
                    {formatNumber((existingCapacity?.coolingW ?? 0) / 1000)} kW
                    · potenze {existingCapacity?.basis ?? "non verificabili"}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Ambienti serviti</th>
                  <td>
                    {project.rooms
                      .filter((room) => existing.roomIds.includes(room.id))
                      .map((room) => room.name)
                      .join(" · ") || "Nessuno"}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Fabbisogno ambienti</th>
                  <td>
                    {formatNumber(
                      project.rooms
                        .filter((room) => existing.roomIds.includes(room.id))
                        .reduce((total, room) => total + room.designLoadW, 0) /
                        1000,
                    )}{" "}
                    kW
                  </td>
                </tr>
                <tr>
                  <th scope="row">Ventilconvettori collegati</th>
                  <td>{existing.fanCoilIds.length}</td>
                </tr>
                {(project.fanCoils ?? [])
                  .filter((coil) => existing.fanCoilIds.includes(coil.id))
                  .map((coil) => (
                    <tr key={coil.id}>
                      <th scope="row">
                        {
                          project.rooms.find((room) => room.id === coil.roomId)
                            ?.name
                        }
                      </th>
                      <td>
                        {fanCoilProductAtVersion(
                          coil.productId,
                          coil.catalogVersion,
                        )?.model ?? coil.productId}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <details className={panelStyles.properties}>
            <summary>Posizione e proprietà della macchina</summary>
            <HydronicProperties
              project={project}
              id={existing.outdoorUnit.id}
              positionOnly
            />
          </details>
        </section>
      )}
    </section>
  );
}
