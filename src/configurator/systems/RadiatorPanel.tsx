"use client";
import { useEffect, useRef, useState, type Ref } from "react";
import Image from "next/image";
import type { Project, Room } from "@/schemas/project";
import {
  radiatorCatalogs,
  radiatorProducts,
  radiatorProductPhoto,
} from "@/domain/catalogs/radiators";
import {
  type RadiatorSolution,
  type RadiatorProgress,
} from "@/domain/radiators/size";
import { sizeRadiatorsInWorker } from "@/domain/radiators/size-client";
import { applyRadiatorSolution } from "@/domain/radiators/apply";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber, numberFromForm } from "@/utils/format";
import styles from "./SystemConfiguration.module.css";
import radiatorStyles from "./RadiatorPanel.module.css";
import {
  radiatorFamilyGroup,
  radiatorSizeChoices,
} from "@/domain/radiators/catalog-selection";
import {
  getRadiatorFinishOptions,
  radiatorFinishCatalogVersion,
  radiatorFinishPreviewDisclaimer,
} from "@/domain/catalogs/radiator-finishes";
export function RadiatorPanel({
  room,
  project,
  installationId,
  onPlace,
  saveButtonRef,
  existingDeviceId,
}: {
  room: Room;
  project: Project;
  installationId?: string;
  onPlace?: (change: (project: Project) => Project) => void;
  saveButtonRef?: Ref<HTMLButtonElement>;
  existingDeviceId?: string;
}) {
  const installed = project.radiators.filter(
    (radiator) =>
      radiator.roomId === room.id &&
      (!installationId || radiator.installationId === installationId),
  );
  const [selectedSolution, setSelectedSolution] = useState(0);
  const existingDevice = project.radiators.find(
    (item) => item.id === existingDeviceId,
  );
  const savedManufacturer =
    existingDevice?.manufacturer ??
    (new Set(installed.map((radiator) => radiator.manufacturer)).size === 1
      ? (installed[0]?.manufacturer ?? "")
      : "");
  const savedFamily =
    existingDevice?.family ??
    (new Set(installed.map((radiator) => radiator.family)).size === 1
      ? (installed[0]?.family ?? "")
      : "");
  const savedProduct = radiatorProducts.find(
    (item) => item.id === existingDevice?.productId,
  );
  const [family, setFamily] = useState(radiatorFamilyGroup(savedFamily));
  const [columns, setColumns] = useState<number | null>(
    savedProduct?.columns ?? null,
  );
  const [size, setSize] = useState(
    savedProduct ? `${savedProduct.heightMm}|${savedProduct.interaxisMm}` : "",
  );
  const [bodyColorId, setBodyColorId] = useState(
    existingDevice?.finishes?.bodyColorId ?? "",
  );
  const [manufacturer, setManufacturer] = useState(
      savedManufacturer || project.radiators.at(-1)?.manufacturer || "",
    ),
    [solutions, setSolutions] = useState<RadiatorSolution[] | null>(null),
    [solutionSignature, setSolutionSignature] = useState<string | null>(null),
    [wallId, setWallId] = useState<string | null>(null),
    [searching, setSearching] = useState(false),
    [progress, setProgress] = useState<RadiatorProgress | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  useEffect(
    () => () => {
      searchController.current?.abort();
    },
    [room.id, room.designLoadW, room.heightM, room.geometryStatus],
  );
  const roomSignature = `${room.id}|${room.designLoadW}|${room.heightM}|${room.geometryStatus}`;
  const visibleSolutions =
    solutionSignature === roomSignature ? solutions : null;
  const { commit, setError } = useProjectStore();
  const brandProducts = radiatorProducts.filter(
    (product) => !manufacturer || product.manufacturer === manufacturer,
  );
  const families = [
    ...new Set(
      brandProducts.map((product) => radiatorFamilyGroup(product.family)),
    ),
  ];
  const familyProducts = brandProducts.filter(
    (product) => !family || radiatorFamilyGroup(product.family) === family,
  );
  const columnChoices = [
    ...new Set(
      familyProducts
        .map((product) => product.columns)
        .filter((value): value is number => value !== null),
    ),
  ].sort((a, b) => a - b);
  const columnProducts = familyProducts.filter(
    (product) => columns === null || product.columns === columns,
  );
  const sizeChoices = radiatorSizeChoices(columnProducts);
  const selectedProducts = columnProducts.filter(
    (product) => !size || `${product.heightMm}|${product.interaxisMm}` === size,
  );
  const exactFamily =
    family && !columnChoices.length
      ? family
      : family && columns !== null
        ? `${family} ${columns} colonne`
        : "";
  const finishOptions = getRadiatorFinishOptions(
    manufacturer,
    exactFamily,
    "body",
  );
  function resetSearch() {
    searchController.current?.abort();
    requestId.current++;
    setSearching(false);
    setSolutions(null);
    setProgress(null);
  }
  function choose(change: () => void) {
    change();
    resetSearch();
  }
  if (room.geometryStatus === "unresolved")
    return (
      <section className="pannello-radiatori">
        <h3>Dimensiona radiatori</h3>
        <p className="avviso attenzione">
          Chiudi il contorno della stanza: superficie e fabbisogno devono essere
          ricalcolati.
        </p>
      </section>
    );
  if (!project.floors.find((f) => f.id === room.floorId)?.scaleVerified)
    return (
      <section className="pannello-radiatori">
        <h3>Dimensiona radiatori</h3>
        <p className="avviso attenzione">
          Verifica la scala della planimetria prima del dimensionamento.
        </p>
      </section>
    );
  async function search(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget),
      optional = (name: string) =>
        data.get(name) ? numberFromForm(data.get(name)) : undefined;
    const selectedWall = String(data.get("wallId"));
    setWallId(selectedWall || null);
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    const currentRequest = ++requestId.current;
    setSearching(true);
    setSolutions(null);
    setProgress(null);
    try {
      const found = await sizeRadiatorsInWorker(
        onPlace ? numberFromForm(data.get("pointLoad")) : room.designLoadW,
        selectedProducts,
        numberFromForm(data.get("deltaT")),
        {
          manufacturer,
          family: exactFamily,
          numberOfRadiators: data.get("number")
            ? numberFromForm(data.get("number"))
            : 1,
          maxWidthMm: optional("maxWidth"),
          maxHeightMm: Math.min(
            optional("maxHeight") ?? Infinity,
            room.heightM * 1000 - 100,
          ),
          maxDepthMm: optional("maxDepth"),
          minElements: optional("minElements"),
          maxElements: optional("maxElements"),
        },
        controller.signal,
        (value) => {
          if (currentRequest === requestId.current) setProgress(value);
        },
      );
      if (currentRequest !== requestId.current) return;
      setSolutions(found);
      setSelectedSolution(0);
      setSolutionSignature(roomSignature);
      setError(null);
    } catch (e) {
      if (
        currentRequest !== requestId.current ||
        (e instanceof DOMException && e.name === "AbortError")
      )
        return;
      setError(
        e instanceof Error ? e.message : "Dimensionamento radiatori fallito.",
      );
    } finally {
      if (currentRequest === requestId.current) setSearching(false);
    }
  }
  return (
    <section
      className={`${styles.panel} ${radiatorStyles.panel}`}
      aria-label="Configurazione radiatori"
    >
      <header className={styles.heading}>
        <h3>Dimensiona radiatori</h3>
        <p className="nota">
          Imposta marca e numero di radiatori. Confronta le soluzioni che
          coprono il fabbisogno della stanza.
        </p>
      </header>
      <div className={`${styles.layout} ${radiatorStyles.layout}`}>
        <form
          className={styles.controls}
          onSubmit={search}
          onChange={() => {
            searchController.current?.abort();
            requestId.current++;
            setSearching(false);
            setSolutions(null);
            setProgress(null);
          }}
        >
          <h4>Criteri di scelta</h4>
          <fieldset>
            <legend>Marca radiatori</legend>
            <div className={radiatorStyles.choices}>
              {[
                "",
                ...new Set(
                  radiatorCatalogs.map((catalog) => catalog.manufacturer),
                ),
              ]
                .filter(
                  (brand) => !manufacturer || !brand || brand === manufacturer,
                )
                .map((brand) => (
                  <button
                    type="button"
                    className={radiatorStyles.choice}
                    key={brand}
                    aria-pressed={manufacturer === brand}
                    onClick={() =>
                      choose(() => {
                        setManufacturer(brand);
                        setFamily("");
                        setColumns(null);
                        setSize("");
                        setBodyColorId("");
                      })
                    }
                  >
                    {brand || "Tutte le marche"}
                  </button>
                ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Famiglia radiatori</legend>
            <div className={radiatorStyles.choices}>
              <button
                type="button"
                className={radiatorStyles.choice}
                aria-pressed={!family}
                onClick={() =>
                  choose(() => {
                    setFamily("");
                    setColumns(null);
                    setSize("");
                    setBodyColorId("");
                  })
                }
              >
                Tutte le famiglie
              </button>
              {families
                .filter((name) => !family || name === family)
                .map((name) => {
                  const sample = brandProducts.find(
                    (product) => radiatorFamilyGroup(product.family) === name,
                  )!;
                  const photo = radiatorProductPhoto(sample);
                  return (
                    <button
                      type="button"
                      className={radiatorStyles.choice}
                      key={name}
                      aria-pressed={family === name}
                      onClick={() =>
                        choose(() => {
                          setFamily(name);
                          setColumns(null);
                          setSize("");
                          setBodyColorId("");
                        })
                      }
                    >
                      {photo && (
                        <Image
                          unoptimized
                          src={photo.localPath}
                          alt=""
                          width={160}
                          height={90}
                        />
                      )}
                      <strong>{name}</strong>
                    </button>
                  );
                })}
            </div>
          </fieldset>
          {family && columnChoices.length > 0 && (
            <fieldset>
              <legend>Colonne</legend>
              <div className={radiatorStyles.choices}>
                <button
                  type="button"
                  className={radiatorStyles.choice}
                  aria-pressed={columns === null}
                  onClick={() =>
                    choose(() => {
                      setColumns(null);
                      setSize("");
                      setBodyColorId("");
                    })
                  }
                >
                  Tutte le colonne
                </button>
                {columnChoices
                  .filter((value) => columns === null || value === columns)
                  .map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={radiatorStyles.choice}
                      aria-pressed={columns === value}
                      onClick={() =>
                        choose(() => {
                          setColumns(value);
                          setSize("");
                          setBodyColorId("");
                        })
                      }
                    >
                      <strong>{value} colonne</strong>
                    </button>
                  ))}
              </div>
            </fieldset>
          )}
          {family && (
            <fieldset>
              <legend>Altezza e interasse verificati · mm</legend>
              <div className={radiatorStyles.choices}>
                <button
                  type="button"
                  className={radiatorStyles.choice}
                  aria-pressed={!size}
                  onClick={() => choose(() => setSize(""))}
                >
                  Tutte le altezze
                </button>
                {sizeChoices
                  .filter(
                    (choice) =>
                      !size ||
                      size === `${choice.heightMm}|${choice.interaxisMm}`,
                  )
                  .map((choice) => {
                    const value = `${choice.heightMm}|${choice.interaxisMm}`;
                    return (
                      <button
                        type="button"
                        key={value}
                        className={radiatorStyles.choice}
                        aria-pressed={size === value}
                        onClick={() => choose(() => setSize(value))}
                      >
                        <strong>ALTEZZA {choice.heightMm}</strong>
                        <small>INTERASSE {choice.interaxisMm}</small>
                      </button>
                    );
                  })}
              </div>
              <a
                className="nota"
                href={columnProducts[0]?.sourceMetadata.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Scheda produttore · quote verificate
                {columnProducts[0]?.construction === "fixed"
                  ? " (interasse orizzontale)"
                  : ""}
              </a>
            </fieldset>
          )}
          {family && (
            <fieldset>
              <legend>Colore radiatore</legend>
              {finishOptions.length ? (
                <>
                  <div
                    className={`${radiatorStyles.choices} ${radiatorStyles.palette}`}
                  >
                    <button
                      type="button"
                      className={radiatorStyles.choice}
                      aria-pressed={!bodyColorId}
                      onClick={() => setBodyColorId("")}
                    >
                      Standard produttore
                    </button>
                    {finishOptions.map((finish) => (
                      <button
                        type="button"
                        key={finish.id}
                        className={radiatorStyles.choice}
                        aria-pressed={bodyColorId === finish.id}
                        onClick={() => setBodyColorId(finish.id)}
                      >
                        <span
                          className={radiatorStyles.swatch}
                          style={{ backgroundColor: finish.colorHex }}
                          aria-hidden="true"
                        />
                        <strong>{finish.code}</strong>
                        <small>{finish.label}</small>
                      </button>
                    ))}
                  </div>
                  <p className="nota">{radiatorFinishPreviewDisclaimer}</p>
                </>
              ) : (
                <p className="nota">
                  {columnChoices.length && columns === null
                    ? "Scegli le colonne per vedere la palette disponibile."
                    : "Finiture documentate disponibili nelle proprietà del modello; nessuna palette verificata per questa famiglia."}
                </p>
              )}
            </fieldset>
          )}
          <div className="griglia-misure">
            {onPlace && (
              <label className="campo">
                <span>Potenza da coprire con questo punto (W)</span>
                <input
                  name="pointLoad"
                  aria-label="Potenza da coprire con questo punto (W)"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={Math.max(
                    1,
                    existingDevice?.outputW ??
                      Math.ceil(
                        room.designLoadW -
                          installed.reduce(
                            (sum, device) => sum + device.outputW,
                            0,
                          ),
                      ),
                  )}
                  required
                />
                <small className="nota">
                  Per distribuire il fabbisogno su più punti, indica la quota di
                  questo radiatore. Il totale resta visibile nella vista
                  impianto.
                </small>
              </label>
            )}
            <label className="campo">
              <span>Numero radiatori</span>
              <input
                name="number"
                aria-label="Numero radiatori"
                type="number"
                min="1"
                max={onPlace ? "1" : "10"}
                readOnly={!!onPlace}
                defaultValue={onPlace ? 1 : installed.length || 1}
              />
              <small className="nota">
                {onPlace
                  ? "Un radiatore su questo punto. Per aggiungerne altri, crea altri punti sulla pianta."
                  : "Se vuoto: 1 radiatore."}
              </small>
            </label>
            <label className="campo">
              <span>ΔT progetto (K)</span>
              <input
                name="deltaT"
                type="number"
                min="1"
                max="100"
                step="1"
                defaultValue={
                  existingDevice?.deltaTK ??
                  project.installations.find(
                    (item) => item.id === installationId,
                  )?.radiatorDeltaTK ??
                  project.projectSettings.radiatorDeltaTK
                }
                required
              />
            </label>
          </div>
          <button className="bottone chiara" type="submit" disabled={searching}>
            {searching ? "Ricerca radiatori…" : "Trova radiatori compatibili"}
          </button>
          <label className="campo">
            <span>Parete</span>
            <select name="wallId">
              <option value="">Distribuzione automatica sulle pareti</option>
              {project.walls
                .filter((w) => room.wallIds.includes(w.id))
                .map((w, i) => (
                  <option key={w.id} value={w.id}>
                    Parete {i + 1}
                  </option>
                ))}
            </select>
          </label>
          <details>
            <summary>Vincoli dimensionali opzionali</summary>
            <label className="campo">
              <span>Larghezza max ciascuno (mm)</span>
              <input type="number" name="maxWidth" min="1" />
            </label>
            <label className="campo">
              <span>Altezza max (mm)</span>
              <input type="number" name="maxHeight" min="1" />
            </label>
            <label className="campo">
              <span>Profondità max (mm)</span>
              <input type="number" name="maxDepth" min="1" />
            </label>
            <div className="griglia-misure">
              <label className="campo">
                <span>Min elementi</span>
                <input type="number" name="minElements" min="1" max="500" />
              </label>
              <label className="campo">
                <span>Max elementi</span>
                <input type="number" name="maxElements" min="1" max="500" />
              </label>
            </div>
          </details>
          <p className="nota">
            Base iniziale a 0,10 m dal pavimento. Verificare le distanze nel
            manuale del modello.
          </p>
          {searching && (
            <button
              className="bottone piccolo"
              type="button"
              onClick={() => {
                searchController.current?.abort();
                requestId.current++;
                setSearching(false);
                setProgress(null);
              }}
            >
              Annulla ricerca
            </button>
          )}
        </form>
        <div
          className={`${styles.result} ${radiatorStyles.solutions}`}
          aria-label="Soluzioni radiatori"
        >
          <h4>Soluzioni compatibili</h4>
          {visibleSolutions === null && !searching && (
            <div className={styles.empty}>
              <h4>Trova la soluzione per questa stanza</h4>
              <p>
                Completa i criteri e premi “Trova radiatori compatibili”. Potrai
                confrontare potenza, ingombri e numero di elementi.
              </p>
            </div>
          )}
          {searching && (
            <p className="nota" role="status">
              Ricerca completa in corso.
              {progress
                ? ` ${progress.phase} · ${formatNumber(progress.states, 0)} stati verificati.${progress.bestPowerW !== null ? ` Potenza provvisoria ${formatNumber(progress.bestPowerW)} W.` : ""}`
                : " Preparazione calcolo…"}{" "}
              Le soluzioni saranno applicabili al termine della verifica.
            </p>
          )}
          {visibleSolutions?.length === 0 && (
            <div className="avviso attenzione">
              Nessuna configurazione commerciale soddisfa fabbisogno e vincoli.
              {onPlace
                ? "Riduci la potenza da coprire su questo punto e distribuisci il resto su altri punti, oppure scegli un altro modello."
                : "Aumenta numero radiatori o modifica i vincoli."}
            </div>
          )}
          {visibleSolutions?.slice(0, 3).map((solution, index) => (
            <div
              className={`soluzione-radiatore ${index === 0 ? `${styles.recommendation} ${radiatorStyles.recommendation}` : ""}`}
              key={solution.units
                .map((u) => `${u.variant.id}:${u.elements}`)
                .join("|")}
            >
              <span className="etichetta tinta">
                {index === 0 ? "Consigliata" : `Alternativa ${index}`}
              </span>
              <h3>
                {[
                  ...new Set(solution.units.map((u) => u.variant.manufacturer)),
                ].join(" + ")}{" "}
                ·{" "}
                {new Set(solution.units.map((u) => u.variant.id)).size > 1
                  ? `${[...new Set(solution.units.map((u) => u.variant.family))].join(" + ")} · combinazione mista`
                  : solution.variant.model}
              </h3>
              <p>
                {solution.elements.length}{" "}
                {solution.elements.length === 1 ? "radiatore" : "radiatori"} ·{" "}
                {solution.units
                  .map((unit) =>
                    unit.variant.construction === "fixed"
                      ? "corpo unico"
                      : `${unit.elements} elementi`,
                  )
                  .join(" + ")}
              </p>
              <strong>
                {formatNumber(solution.totalPowerW / 1000)} kW · +
                {formatNumber(solution.marginPercent, 1)}%
              </strong>
              <p className="nota">
                Ingombri L × H × P:{" "}
                {solution.units
                  .map(
                    (unit) =>
                      `${unit.widthMm} × ${unit.variant.heightMm} × ${unit.variant.depthMm} mm`,
                  )
                  .join(" · ")}
              </p>
              <details>
                <summary>Misure e dati dei radiatori</summary>
                {solution.units.map((unit, unitIndex) => (
                  <p className="nota" key={unitIndex}>
                    {unitIndex + 1}. {unit.variant.manufacturer}{" "}
                    {unit.variant.model} ·{" "}
                    {unit.variant.construction === "fixed"
                      ? "corpo unico"
                      : `${unit.elements} elementi`}
                    {unit.variant.columns
                      ? ` · ${unit.variant.columns} colonne`
                      : ""}
                    <br />
                    Ingombro L × H × P: {unit.widthMm} × {unit.variant.heightMm}{" "}
                    × {unit.variant.depthMm} mm
                    {unit.variant.geometryAccuracy === "schematic" && (
                      <>
                        <br />
                        Ingombro 3D schematico:{" "}
                        {unit.variant.geometryNote ??
                          "verificare profondità e posa sul disegno originale."}
                      </>
                    )}
                    <br />
                    Interasse: {unit.variant.interaxisMm} mm ·{" "}
                    {formatNumber(unit.powerW)} W a ΔT {solution.deltaTK} K
                    <br />
                    Peso:{" "}
                    {unit.variant.weightKg === null
                      ? "Dato non disponibile"
                      : `${formatNumber(unit.variant.weightKg * unit.elements)} kg`}{" "}
                    · Acqua:{" "}
                    {unit.variant.waterContentL === null
                      ? "Dato non disponibile"
                      : `${formatNumber(unit.variant.waterContentL * unit.elements)} l`}
                  </p>
                ))}
              </details>
              {!solution.searchComplete && (
                <p className="avviso attenzione">
                  Risultato non definitivo. Attendere il completamento della
                  ricerca prima di applicare la soluzione.
                </p>
              )}
              <details>
                <summary>Calcolo e fonte</summary>
                {solution.log.map((line, i) => (
                  <p key={i} className="nota">
                    {line}
                  </p>
                ))}
                {[
                  ...new Map(
                    solution.units.map((u) => [u.variant.id, u.variant]),
                  ).values(),
                ].map((variant) => (
                  <div key={variant.id}>
                    <p className="nota">
                      {variant.model}: {variant.widthNote}
                    </p>
                    <a
                      className="fonte-catalogo"
                      href={variant.sourceMetadata.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Scheda originale produttore · {variant.model}
                    </a>
                  </div>
                ))}
              </details>
              <button
                className="bottone pieno"
                disabled={!solution.searchComplete}
                ref={index === selectedSolution ? saveButtonRef : undefined}
                hidden={!!saveButtonRef}
                style={saveButtonRef ? { display: "none" } : undefined}
                onClick={() => {
                  (onPlace ?? commit)((p) => {
                    const result = applyRadiatorSolution(
                      p,
                      room.id,
                      solution,
                      wallId,
                      installationId,
                      !!onPlace,
                    );
                    const oldIds = new Set(
                      p.radiators.map((radiator) => radiator.id),
                    );
                    return {
                      ...result,
                      radiators: result.radiators.map((radiator) =>
                        oldIds.has(radiator.id)
                          ? radiator
                          : {
                              ...radiator,
                              finishes: {
                                ...(existingDevice?.manufacturer ===
                                  radiator.manufacturer &&
                                existingDevice.family === radiator.family
                                  ? existingDevice.finishes
                                  : {}),
                                bodyColorId:
                                  bodyColorId &&
                                  getRadiatorFinishOptions(
                                    radiator.manufacturer,
                                    radiator.family,
                                    "body",
                                  ).some((finish) => finish.id === bodyColorId)
                                    ? bodyColorId
                                    : undefined,
                                catalogVersion: radiatorFinishCatalogVersion,
                              },
                            },
                      ),
                    };
                  });
                  if (!useProjectStore.getState().error) setSolutions(null);
                }}
              >
                Applica e posiziona
              </button>
              {saveButtonRef && (
                <button
                  className="bottone"
                  aria-pressed={index === selectedSolution}
                  disabled={!solution.searchComplete}
                  onClick={() => setSelectedSolution(index)}
                >
                  {index === selectedSolution
                    ? "Selezionata"
                    : "Scegli soluzione"}
                </button>
              )}
            </div>
          ))}
          {!!installed.length && (
            <div className={styles.installed}>
              {installed.length} radiatori posizionati ·{" "}
              {formatNumber(
                installed.reduce((sum, r) => sum + r.outputW, 0) / 1000,
              )}{" "}
              kW{" "}
              <button
                className="bottone piccolo pericolo"
                onClick={() => {
                  if (window.confirm("Rimuovere i radiatori della stanza?"))
                    commit((p) => ({
                      ...p,
                      radiators: p.radiators.filter(
                        (r) =>
                          r.roomId !== room.id ||
                          (!!installationId &&
                            r.installationId !== installationId),
                      ),
                      rooms: p.rooms.map((r) =>
                        r.id === room.id ? { ...r, systemType: "none" } : r,
                      ),
                    }));
                }}
              >
                Rimuovi radiatori
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
