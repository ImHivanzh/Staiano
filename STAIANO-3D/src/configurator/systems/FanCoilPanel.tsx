"use client";
import { useState, type Ref } from "react";
import Image from "next/image";
import type { Project, Room } from "@/schemas/project";
import {
  fanCoilCatalog,
  fanCoilProductAtVersion,
  compatibleFanCoilControls,
  controllerBoardFor,
  fanCoilCategories,
  fanCoilCategory,
  fanCoilCategoryLabels,
  fanCoilDefaultPanelType,
  fanCoilCoverAccessory,
  fanCoilPanelOptions,
  fanCoilPanelTypeLabel,
  fanCoilRecessDepthMm,
  isConcealedFanCoil,
  isRecessedFanCoil,
  type FanCoilCoverType,
  type FanCoilPanelType,
} from "@/domain/catalogs/fan-coils";
import { applyFanCoil, removeFanCoil } from "@/domain/fan-coils/apply";
import {
  ensureFanCoilAirSystem,
  fanCoilAirSystem,
} from "@/domain/fan-coils/air";
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
  const [family, setFamily] = useState(existingProduct?.family ?? "");
  const [productId, setProductId] = useState(existingDevice?.productId ?? "");
  const [operatingPointIndex, setOperatingPointIndex] = useState(
    existingDevice?.operatingPointIndex ?? 0,
  );
  const [mounting, setMounting] = useState<"wall" | "ceiling">(
    existingDevice?.mounting ?? "wall",
  );
  const [controllerId, setControllerId] = useState(
    existingDevice?.controllerId ?? "",
  );
  const [panelType, setPanelType] = useState<FanCoilPanelType | null>(
    existingDevice?.panelType ??
      (existingProduct
        ? fanCoilDefaultPanelType(
            existingProduct,
            existingDevice?.mounting ?? "wall",
          )
        : null),
  );
  const [coverType, setCoverType] = useState<FanCoilCoverType | null>(
    existingDevice?.coverType ?? null,
  );
  const brandProducts = fanCoilCatalog.products.filter(
    (p) => p.manufacturer === manufacturer,
  );
  const families = [...new Set(brandProducts.map((p) => p.family))];
  const familyProducts = brandProducts.filter((p) => p.family === family);
  const product = productId
    ? (familyProducts.find((p) => p.id === productId) ?? familyProducts[0])
    : undefined;
  const point = product
    ? (product.operatingPoints[operatingPointIndex] ??
      product.operatingPoints[0])
    : undefined;
  const panelOptions = product ? fanCoilPanelOptions(product, mounting) : [];
  const selectedPanelType = panelOptions.includes(panelType as FanCoilPanelType)
    ? panelType
    : product
      ? fanCoilDefaultPanelType(product, mounting)
      : null;
  const controls = product ? compatibleFanCoilControls(product) : [];
  const controller = controls.find((c) => c.id === controllerId);
  const installed = (project.fanCoils ?? []).filter(
    (u) => u.roomId === room.id,
  );
  const totals = installedFanCoilCapacity(project, room.id);
  const existingPoint = existingDevice
    ? existingProduct?.operatingPoints[existingDevice.operatingPointIndex]
    : undefined;
  const airSystem = existingDevice
    ? fanCoilAirSystem(project, existingDevice.id)
    : undefined;
  const airVents = project.airTerminals.filter(
    (terminal) => terminal.systemId === airSystem?.id,
  );
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
  const suggestion = family
    ? sizeFanCoils(sizingProject, room, { manufacturer, family, mounting })[0]
    : undefined;
  const mountings = [
    ...new Set(familyProducts.flatMap((item) => item.mountings)),
  ];
  const pose = product
    ? initialFanCoilPose(
        sizingProject,
        room,
        product,
        mounting,
        selectedPanelType,
      )
    : null;
  function chooseManufacturer(next: string) {
    setManufacturer(next);
    setFamily("");
    setProductId("");
    setOperatingPointIndex(0);
    setControllerId("");
    setPanelType(null);
    setCoverType(null);
  }
  function chooseFamily(next: string) {
    const nextProducts = fanCoilCatalog.products.filter(
      (p) => p.manufacturer === manufacturer && p.family === next,
    );
    const nextMountings = [
      ...new Set(nextProducts.flatMap((item) => item.mountings)),
    ];
    const nextMounting = nextMountings.includes(mounting)
      ? mounting
      : (nextMountings[0] ?? mounting);
    const recommended = next
      ? sizeFanCoils(sizingProject, room, {
          manufacturer,
          family: next,
          mounting: nextMounting,
        })[0]
      : undefined;
    setFamily(next);
    setMounting(nextMounting);
    setControllerId("");
    setProductId(recommended?.product.id ?? "");
    setOperatingPointIndex(recommended?.operatingPointIndex ?? 0);
    setPanelType(
      recommended
        ? fanCoilDefaultPanelType(recommended.product, nextMounting)
        : null,
    );
    setCoverType(null);
  }
  function chooseMounting(next: "wall" | "ceiling") {
    const recommended = family
      ? sizeFanCoils(sizingProject, room, {
          manufacturer,
          family,
          mounting: next,
        })[0]
      : undefined;
    const kept = familyProducts.find(
      (item) => item.id === productId && item.mountings.includes(next),
    );
    setMounting(next);
    setControllerId("");
    setProductId(kept?.id ?? recommended?.product.id ?? "");
    setOperatingPointIndex(
      kept ? operatingPointIndex : (recommended?.operatingPointIndex ?? 0),
    );
    const nextProduct = kept ?? recommended?.product;
    setPanelType(
      nextProduct ? fanCoilDefaultPanelType(nextProduct, next) : null,
    );
    if (nextProduct?.family !== "FCZ P") setCoverType(null);
  }
  function chooseTaglia(next: string) {
    const nextProduct = familyProducts.find((item) => item.id === next);
    if (nextProduct && !nextProduct.mountings.includes(mounting))
      setMounting(nextProduct.mountings[0]);
    setProductId(next);
    setOperatingPointIndex(0);
    setControllerId("");
    setPanelType(
      nextProduct
        ? fanCoilDefaultPanelType(
            nextProduct,
            nextProduct.mountings.includes(mounting)
              ? mounting
              : nextProduct.mountings[0],
          )
        : null,
    );
    if (nextProduct?.family !== "FCZ P") setCoverType(null);
  }
  function useSuggestion() {
    if (!suggestion) return;
    setFamily(suggestion.product.family);
    setProductId(suggestion.product.id);
    setOperatingPointIndex(suggestion.operatingPointIndex);
    setControllerId("");
    setPanelType(fanCoilDefaultPanelType(suggestion.product, mounting));
    setCoverType(null);
  }
  return (
    <section
      className={styles.panel}
      aria-label="Configurazione ventilconvettori"
    >
      <header className={styles.heading}>
        <h3>Ventilconvettori</h3>
        <p className="nota">
          Scegli la marca e il modello: il sistema indica poi la taglia che
          copre il fabbisogno residuo, con velocità e rumore del punto scelto.
          Puoi aggiungere più apparecchi nello stesso ambiente: il consiglio
          considera la potenza già installata da tutti i ventilconvettori
          presenti, anche di impianti diversi.
        </p>
      </header>
      {existingDevice && (
        <div className="formula" aria-label="Distribuzione aeraulica">
          <strong>Distribuzione aeraulica</strong>
          {!existingPoint?.airflowM3h ? (
            <p className="nota">
              Il punto di funzionamento scelto non dichiara la portata d’aria:
              scegli un’altra velocità per alimentare canali e bocchette.
            </p>
          ) : airSystem ? (
            <p className="nota">
              {airVents.length}{" "}
              {airVents.length === 1
                ? "bocchetta collegata"
                : "bocchette collegate"}{" "}
              · portata {formatNumber(airSystem.airflowM3h ?? 0)} m³/h. Usa
              Collega in pianta per associarne altre; plenum, canali e attacco
              di mandata sono nella scheda dell’apparecchio (Proprietà).
            </p>
          ) : (
            <>
              <p className="nota">
                La FCZ è canalizzabile: alimenta plenum, canali e bocchette con
                la portata del punto scelto.
              </p>
              <button
                type="button"
                className="bottone piccolo"
                onClick={() =>
                  commit(
                    (p) => ensureFanCoilAirSystem(p, existingDevice.id).project,
                  )
                }
              >
                Aggiungi distribuzione aeraulica
              </button>
            </>
          )}
        </div>
      )}
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
          <h4>Marca, modello e taglia</h4>
          <p className="nota">
            Scegli la marca e il modello: il sistema indica la taglia che copre
            il fabbisogno residuo. Puoi poi sceglierne un’altra o cambiare
            velocità.
          </p>
          <label className="campo">
            <span>Marca ventilconvettore</span>
            <select
              aria-label="Marca ventilconvettore"
              value={manufacturer}
              onChange={(e) => chooseManufacturer(e.target.value)}
            >
              {[
                ...new Set(fanCoilCatalog.products.map((p) => p.manufacturer)),
              ].map((brand) => (
                <option key={brand}>{brand}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Modello</span>
            <select
              aria-label="Modello ventilconvettore"
              value={family}
              onChange={(e) => chooseFamily(e.target.value)}
              disabled={!families.length}
            >
              <option value="">Scegli il modello</option>
              {fanCoilCategories.map((category) => {
                const options = families.filter((name) => {
                  const sample = brandProducts.find((p) => p.family === name);
                  return sample && fanCoilCategory(sample) === category;
                });
                if (!options.length) return null;
                return (
                  <optgroup
                    key={category}
                    label={fanCoilCategoryLabels[category]}
                  >
                    {options.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </label>
          <label className="campo">
            <span>Taglia</span>
            <select
              aria-label="Taglia ventilconvettore"
              value={product?.id ?? ""}
              onChange={(e) => chooseTaglia(e.target.value)}
              disabled={!family}
            >
              <option value="">
                {suggestion
                  ? `Consigliata: ${suggestion.product.model}`
                  : family
                    ? "Scegli la taglia"
                    : "Scegli prima il modello"}
              </option>
              {familyProducts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.model} · {item.pipes} tubi
                  {suggestion?.product.id === item.id ? " · consigliata" : ""}
                </option>
              ))}
            </select>
          </label>
          {product && point && (
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
              {product.family.startsWith("Bi2 Naked") &&
                selectedPanelType?.startsWith("grilles") && (
                  <small>
                    Il pannello di copertura va realizzato in cantiere.
                  </small>
                )}
            </label>
          )}
          {family && (
            <label className="campo">
              <span>Montaggio</span>
              <select
                value={mounting}
                onChange={(e) =>
                  chooseMounting(e.target.value as "wall" | "ceiling")
                }
              >
                {mountings.map((m) => (
                  <option key={m} value={m}>
                    {m === "wall" ? "Parete" : "Soffitto"}
                  </option>
                ))}
              </select>
            </label>
          )}
          {product && panelOptions.length > 0 && (
            <label className="campo">
              <span>
                {product.family.startsWith("AirLeaf")
                  ? "Finitura incasso"
                  : "Configurazione incasso"}
              </span>
              <select
                value={selectedPanelType ?? ""}
                onChange={(e) =>
                  setPanelType(e.target.value as FanCoilPanelType)
                }
              >
                {panelOptions.map((option) => (
                  <option key={option} value={option}>
                    {fanCoilPanelTypeLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {product?.family === "FCZ P" && (
            <label className="campo">
              <span>Mobile di copertura Aermec</span>
              <select
                value={coverType ?? ""}
                onChange={(event) =>
                  setCoverType(
                    event.target.value
                      ? (event.target.value as FanCoilCoverType)
                      : null,
                  )
                }
              >
                <option value="">Senza mobile</option>
                <option value="fixed">
                  {fanCoilCoverAccessory(product, "fixed")?.code} · alette fisse
                </option>
                <option value="adjustable">
                  {fanCoilCoverAccessory(product, "adjustable")?.code} · alette
                  orientabili
                </option>
              </select>
              <small>
                L’ingombro del mobile non è quotato nella fonte acquisita: la
                scelta compare in distinta, ma non modifica la mesh né le
                collisioni.
              </small>
            </label>
          )}
          {product && isRecessedFanCoil(product) && (
            <p className="nota" data-testid="fan-coil-recess-panel-note">
              Modello ad incasso: il corpo non va a vista. A parete serve una
              muratura o controparete di almeno{" "}
              {fanCoilRecessDepthMm(product, selectedPanelType)} mm (faccia
              anteriore a filo); a soffitto serve un controsoffitto o un vuoto
              tecnico.
            </p>
          )}
          {product && point && mounting === "ceiling" && (
            <p className="nota">
              {isConcealedFanCoil(product)
                ? "Modello senza mobile: usa il vuoto tecnico disponibile, oppure viene appeso sotto il soffitto. Verifica pannelli e accessori del modello."
                : "Posa a vista: il corpo resta sotto il soffitto; la quota indica la faccia inferiore."}
              {product.ceilingInstallation && (
                <>
                  {" "}
                  {product.ceilingInstallation.note}{" "}
                  <a
                    href={product.ceilingInstallation.sourceMetadata.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Vincoli di posa · pagina{" "}
                    {product.ceilingInstallation.sourceMetadata.page}
                  </a>
                </>
              )}
            </p>
          )}
          {product && point && (
            <>
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
                        Scheda richiesta:{" "}
                        {controllerBoardFor(product, controller)} ·{" "}
                        {product.pipes} tubi.
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
            </>
          )}
          {!product && (
            <p className="nota">
              {family
                ? "Scegli una taglia per vedere velocità, rumore, comando e posa."
                : "Scegli il modello: poi indico la taglia consigliata per questo ambiente."}
            </p>
          )}
        </div>
        <div className={styles.result}>
          {suggestion ? (
            <div
              className={styles.recommendation}
              aria-label="Ventilconvettore consigliato"
            >
              <strong>Taglia consigliata</strong>
              <button
                className="bottone piccolo"
                type="button"
                onClick={useSuggestion}
              >
                Usa taglia consigliata: {suggestion.product.model} ·{" "}
                {suggestion.point.label}
              </button>
            </div>
          ) : (
            <p className="nota">
              {family
                ? "Nessuna taglia di questo modello copre il fabbisogno residuo con lo spazio e la quota disponibili. Per un modello ad incasso servono una parete abbastanza spessa a parete o un controsoffitto/vuoto tecnico a soffitto. Puoi anche configurare più apparecchi."
                : "Scegli marca e modello: poi indico la taglia che copre il fabbisogno residuo."}
            </p>
          )}
          <h4>
            {existingDevice
              ? "Apparecchio da modificare"
              : "Apparecchio da aggiungere"}
          </h4>
          {product && point ? (
            <>
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
                  <p className="nota">
                    {fanCoilCategoryLabels[fanCoilCategory(product)]}
                  </p>
                  <p>
                    {point.label} ·{" "}
                    {mounting === "wall" ? "Parete" : "Soffitto"} ·{" "}
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
                      panelType: selectedPanelType,
                      coverType,
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
                  {product && isRecessedFanCoil(product)
                    ? mounting === "ceiling"
                      ? "Modello ad incasso: serve un controsoffitto o un vuoto tecnico abbastanza profondo; non viene appeso a vista. Aggiungi il controsoffitto o scegli un altro montaggio."
                      : `Modello ad incasso: nessuna parete ha i ${fanCoilRecessDepthMm(product, selectedPanelType)} mm necessari. Ispessisci la parete o aggiungi una controparete.`
                    : `Nessuno spazio libero per questo ingombro. ${
                        mounting === "ceiling"
                          ? "Controlla quota del soffitto, vuoto tecnico e vincoli di posa, oppure cambia montaggio."
                          : "Cambia modello o montaggio."
                      }`}
                </p>
              )}
              <p className="nota">
                {existingDevice
                  ? "Modifica l’apparecchio selezionato conservando i collegamenti."
                  : "Aggiunge un apparecchio. Quelli già posizionati restano nel progetto."}
              </p>
              <details>
                <summary>Condizioni dei dati e fonte</summary>
                <p className="nota">{product.features.join(" · ")}</p>
                <p className="nota">
                  Suggerimento conservativo: capacità freddo e caldo dello
                  stesso punto devono coprire separatamente il fabbisogno
                  residuo. Le potenze valgono alle condizioni originali, senza
                  correzioni inventate per altre temperature dell’acqua.
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
            </>
          ) : (
            <p className="nota">
              {family
                ? "Scegli una taglia per vederne ingombri, prestazioni e posa."
                : "Scegli il modello per ricevere la taglia consigliata."}
            </p>
          )}
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
        </div>
      </div>
    </section>
  );
}
