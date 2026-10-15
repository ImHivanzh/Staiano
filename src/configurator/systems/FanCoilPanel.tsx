"use client";
import { useState, type Ref } from "react";
import Image from "next/image";
import type { Project, Room } from "@/schemas/project";
import {
  fanCoilCatalog,
  fanCoilProductAtVersion,
  compatibleFanCoilControls,
  controllerBoardFor,
} from "@/domain/catalogs/fan-coils";
import { applyFanCoil, removeFanCoil } from "@/domain/fan-coils/apply";
import {
  installedFanCoilCapacity,
  sizeFanCoils,
} from "@/domain/fan-coils/size";
import { initialFanCoilPose } from "@/domain/fan-coils/placement";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber } from "@/utils/format";
import styles from "./SystemConfiguration.module.css";

export function FanCoilPanel({
  project,
  room,
  installationId,
  onPlace,
  saveButtonRef,
  existingDeviceId,
}: {
  project: Project;
  room: Room;
  installationId?: string;
  onPlace?: (change: (project: Project) => Project) => void;
  saveButtonRef?: Ref<HTMLButtonElement>;
  existingDeviceId?: string;
}) {
  const { commit, select } = useProjectStore();
  const existingDevice = project.fanCoils?.find(
    (item) => item.id === existingDeviceId,
  );
  const existingProduct = existingDevice
    ? fanCoilProductAtVersion(
        existingDevice.productId,
        existingDevice.catalogVersion,
      )
    : undefined;
  const [manufacturer, setManufacturer] = useState(
    existingProduct?.manufacturer ?? "Innova",
  );
  const [productId, setProductId] = useState(
    existingDevice?.productId ?? fanCoilCatalog.products[0].id,
  );
  const [operatingPointIndex, setOperatingPointIndex] = useState(
    existingDevice?.operatingPointIndex ?? 0,
  );
  const [mounting, setMounting] = useState<"wall" | "ceiling">(
    existingDevice?.mounting ?? "wall",
  );
  const [controllerId, setControllerId] = useState(
    existingDevice?.controllerId ?? "",
  );
  const products = fanCoilCatalog.products.filter(
    (p) => p.manufacturer === manufacturer,
  );
  const product = products.find((p) => p.id === productId) ?? products[0];
  const point =
    product.operatingPoints[operatingPointIndex] ?? product.operatingPoints[0];
  const controls = compatibleFanCoilControls(product);
  const controller = controls.find((c) => c.id === controllerId);
  const installed = (project.fanCoils ?? []).filter(
    (u) =>
      u.roomId === room.id &&
      (!installationId || u.installationId === installationId),
  );
  const totals = installedFanCoilCapacity(project, room.id, installationId);
  const remainingCoolingW = Math.max(0, room.designLoadW - totals.coolingW);
  const remainingHeatingW = Math.max(0, room.designLoadW - totals.heatingW);
  const sizingProject = existingDevice
    ? {
        ...project,
        fanCoils: project.fanCoils?.filter(
          (item) => item.id !== existingDevice.id,
        ),
      }
    : project;
  const suggestion =
    sizeFanCoils(sizingProject, room, {
      manufacturer,
      mounting,
      installationId,
    })[0] ?? sizeFanCoils(sizingProject, room, { mounting, installationId })[0];
  const pose = initialFanCoilPose(
    existingDevice
      ? {
          ...project,
          fanCoils: project.fanCoils?.filter(
            (item) => item.id !== existingDevice.id,
          ),
        }
      : project,
    room,
    product,
    mounting,
  );
  return (
    <section
      className={styles.panel}
      aria-label="Configurazione ventilconvettori"
    >
      <header className={styles.heading}>
        <h3>Ventilconvettori</h3>
        <p className="nota">
          Scegli modello e velocità. Puoi aggiungere più apparecchi nello stesso
          ambiente.
        </p>
      </header>
      <dl className={styles.facts}>
        <div>
          <dt>Fabbisogno ambiente</dt>
          <dd>{formatNumber(room.designLoadW / 1000)} kW</dd>
        </div>
        <div>
          <dt>Installato · freddo</dt>
          <dd>{formatNumber(totals.coolingW / 1000)} kW</dd>
        </div>
        <div>
          <dt>Installato · caldo</dt>
          <dd>{formatNumber(totals.heatingW / 1000)} kW</dd>
        </div>
        <div>
          <dt>Apparecchi</dt>
          <dd>{installed.length}</dd>
        </div>
      </dl>
      {installed.length > 0 &&
        (remainingCoolingW > 0 || remainingHeatingW > 0) && (
          <p className={styles.remaining} role="status">
            <strong>Potenza ancora da coprire:</strong>{" "}
            {formatNumber(remainingCoolingW / 1000)} kW freddo ·{" "}
            {formatNumber(remainingHeatingW / 1000)} kW caldo. Aggiungi un
            apparecchio o scegli un modello più potente.
          </p>
        )}
      {totals.unknownCount > 0 && (
        <p role="status" className="nota">
          {totals.unknownCount} apparecchi con dati originali non disponibili:
          capacità esclusa dal totale.
        </p>
      )}
      <div className={styles.layout}>
        <div className={styles.controls}>
          <h4>Modello e funzionamento</h4>
          <label className="campo">
            <span>Marca ventilconvettore</span>
            <select
              value={manufacturer}
              onChange={(e) => {
                setManufacturer(e.target.value);
                setProductId(
                  fanCoilCatalog.products.find(
                    (p) => p.manufacturer === e.target.value,
                  )!.id,
                );
                setOperatingPointIndex(0);
                setControllerId("");
              }}
            >
              {[
                ...new Set(fanCoilCatalog.products.map((p) => p.manufacturer)),
              ].map((brand) => (
                <option key={brand}>{brand}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Serie e modello</span>
            <select
              value={product.id}
              onChange={(e) => {
                setProductId(e.target.value);
                setOperatingPointIndex(0);
                setControllerId("");
              }}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.family} · {p.model} · {p.pipes} tubi
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Velocità / punto di funzionamento</span>
            <select
              value={operatingPointIndex}
              onChange={(e) => setOperatingPointIndex(Number(e.target.value))}
            >
              {product.operatingPoints.map((p, i) => (
                <option key={i} value={i}>
                  {p.label} · {formatNumber(p.coolingW / 1000)} /{" "}
                  {formatNumber(p.heatingW / 1000)} kW ·{" "}
                  {p.noiseDbA === null
                    ? "rumore non pubblicato"
                    : `${formatNumber(p.noiseDbA)} dB(A)`}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Montaggio</span>
            <select
              value={mounting}
              onChange={(e) =>
                setMounting(e.target.value as "wall" | "ceiling")
              }
            >
              {product.mountings.map((m) => (
                <option key={m} value={m}>
                  {m === "wall" ? "Parete" : "Soffitto"}
                </option>
              ))}
            </select>
          </label>
          {point.noiseDbA === null ? (
            <p role="status" className="nota">
              Rumore non pubblicato per questo punto. Rispetto del limite
              acustico non verificabile.
            </p>
          ) : (
            <p className="nota">
              {formatNumber(point.noiseDbA)} dB(A) alla velocità scelta.
              {point.noiseDbA > project.projectSettings.maxNoiseDbA
                ? " Supera il limite acustico impostato."
                : ""}{" "}
              Il rumore complessivo di più apparecchi richiede verifica
              separata.
            </p>
          )}
          {controls.length > 0 ? (
            <>
              <label className="campo">
                <span>Comando originale Innova M7</span>
                <select
                  value={controller?.id ?? ""}
                  onChange={(e) => setControllerId(e.target.value)}
                >
                  <option value="">Da definire</option>
                  {controls.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.series} {c.model} ·{" "}
                      {c.connection === "bluetooth"
                        ? "Bluetooth"
                        : c.connection === "wifi-wired"
                          ? "Wi-Fi / cablato"
                          : "Cablato"}
                    </option>
                  ))}
                </select>
              </label>
              {controller && (
                <>
                  {controller.productPhoto && (
                    <Image
                      unoptimized
                      src={controller.productPhoto.localPath}
                      alt={controller.productPhoto.caption}
                      width={240}
                      height={120}
                      style={{
                        width: "100%",
                        height: 100,
                        objectFit: "contain",
                      }}
                    />
                  )}
                  <p className="nota">
                    {controller.features.join(" · ")}
                    <br />
                    Scheda richiesta: {controllerBoardFor(
                      product,
                      controller,
                    )}{" "}
                    · {product.pipes} tubi.
                  </p>
                </>
              )}
            </>
          ) : (
            <p className="nota">
              Comando M7: abbinamento non documentato per questa famiglia.
              Specificare il comando previsto dal produttore.
            </p>
          )}
        </div>
        <div className={styles.result}>
          {suggestion ? (
            <div
              className={styles.recommendation}
              aria-label="Ventilconvettore consigliato"
            >
              <strong>Consigliato</strong>
              <button
                className="bottone piccolo"
                type="button"
                onClick={() => {
                  setManufacturer(suggestion.product.manufacturer);
                  setProductId(suggestion.product.id);
                  setOperatingPointIndex(suggestion.operatingPointIndex);
                  setControllerId("");
                }}
              >
                Usa consigliato: {suggestion.product.manufacturer} ·{" "}
                {suggestion.product.model} · {suggestion.point.label}
              </button>
            </div>
          ) : (
            <p className="nota">
              Nessun singolo modello di questa marca copre il fabbisogno residuo
              rispettando spazio e limite acustico verificabile. Puoi
              configurare più apparecchi.
            </p>
          )}
          <h4>Apparecchio da aggiungere</h4>
          <div className={styles.product}>
            {product.productPhoto && (
              <Image
                unoptimized
                src={product.productPhoto.localPath}
                alt={product.productPhoto.caption}
                width={420}
                height={200}
              />
            )}
            <div>
              <h4>{product.model}</h4>
              <p>
                {product.manufacturer} · {product.family}
              </p>
              <p>
                {point.label} · {mounting === "wall" ? "Parete" : "Soffitto"} ·{" "}
                {product.pipes} tubi
              </p>
            </div>
          </div>
          <button
            type="button"
            className="bottone chiara"
            disabled={!pose}
            ref={saveButtonRef}
            hidden={!!saveButtonRef}
            style={saveButtonRef ? { display: "none" } : undefined}
            onClick={() =>
              (onPlace ?? commit)((p) =>
                applyFanCoil(p, room.id, product.id, operatingPointIndex, {
                  mounting,
                  controllerId: controller?.id ?? null,
                  installationId,
                }),
              )
            }
          >
            Aggiungi ventilconvettore
          </button>
          <dl className={styles.facts}>
            <div>
              <dt>Raffrescamento</dt>
              <dd>{formatNumber(point.coolingW / 1000)} kW</dd>
            </div>
            <div>
              <dt>Riscaldamento</dt>
              <dd>{formatNumber(point.heatingW / 1000)} kW</dd>
            </div>
            <div>
              <dt>Rumore</dt>
              <dd>
                {point.noiseDbA === null
                  ? "Non pubblicato"
                  : `${formatNumber(point.noiseDbA)} dB(A)`}
              </dd>
            </div>
          </dl>
          {!pose && (
            <p role="status" className="nota">
              Nessuno spazio libero per questo ingombro. Cambia modello o
              montaggio.
            </p>
          )}
          <p className="nota">
            {existingDevice
              ? "Modifica l’apparecchio selezionato conservando i collegamenti."
              : "Aggiunge un apparecchio. Quelli già posizionati restano nel progetto."}
          </p>
          {!saveButtonRef && installed.length > 0 && (
            <h4>Apparecchi nella stanza</h4>
          )}
          {!saveButtonRef &&
            installed.map((unit, i) => {
              const model = fanCoilProductAtVersion(
                unit.productId,
                unit.catalogVersion,
              );
              const speed = model?.operatingPoints[unit.operatingPointIndex];
              return (
                <div key={unit.id} className={styles.installed}>
                  <div>
                    <strong>
                      {i + 1}. {model?.model ?? unit.productId}
                    </strong>
                    <br />
                    {speed?.label ?? "Punto non verificabile"} ·{" "}
                    {unit.mounting === "wall" ? "Parete" : "Soffitto"}
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className="bottone piccolo"
                      onClick={() => select({ kind: "device", id: unit.id })}
                    >
                      Posizione e dettagli
                    </button>{" "}
                    <button
                      type="button"
                      className="bottone piccolo pericolo"
                      disabled={unit.locked}
                      onClick={() => commit((p) => removeFanCoil(p, unit.id))}
                    >
                      Rimuovi
                    </button>
                  </div>
                </div>
              );
            })}
          <details>
            <summary>Condizioni dei dati e fonte</summary>
            <p className="nota">{product.features.join(" · ")}</p>
            <p className="nota">
              Suggerimento conservativo: capacità freddo e caldo dello stesso
              punto devono coprire separatamente il fabbisogno residuo. Le
              potenze valgono alle condizioni originali, senza correzioni
              inventate per altre temperature dell’acqua.
            </p>
            <p className="nota">
              Freddo: {point.coolingConditions}
              <br />
              Caldo: {point.heatingConditions}
              <br />
              Rumore: {point.noiseConditions}
              <br />
              {product.dimensionNote}
            </p>
            <a
              className="fonte-catalogo"
              href={product.sourceMetadata.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Scheda ufficiale {product.manufacturer}
              {product.sourceMetadata.page
                ? ` · pagina ${product.sourceMetadata.page}`
                : ""}
            </a>
          </details>
        </div>
      </div>
    </section>
  );
}
