"use client";
import { useState, type Ref } from "react";
import type { Point, Project, Room } from "@/schemas/project";
import { saveTerminalOnPlan } from "@/domain/ducted/graphic-installation";
import { linearRunMembers } from "@/domain/air-terminals/linear-run";
import type { AirTerminalFamily } from "@/domain/catalogs/air-terminal-schema";
import type { AirTerminalSolution } from "@/domain/air-terminals/size";
import { useProjectStore } from "@/stores/project-store";
import { type OperatorTerminalInput } from "@/domain/air-terminals/operator";
import styles from "./RoomAirTerminals.module.css";
import { SizeButtons } from "./TerminalSizeChoices";
import { systemLinearBalances } from "@/domain/air-terminals/linear-meters";
import {
  continuityModuleLengths,
  terminalPlenumConnections,
} from "@/domain/air-terminals/commercial-bom";
import { formatNumber, numberFromForm } from "@/utils/format";
import { RoomMeterDistribution } from "./TerminalDistribution";
import { TerminalPlenumFields } from "./TerminalPlenumFields";
import type { TerminalPlenumOptions } from "@/domain/catalogs/ecoclima-price-schema";
import {
  terminalFinishChoices,
  terminalFinishLabel,
  terminalFinishSpecification,
} from "@/domain/air-terminals/finishes";

export function LinearSummary({
  project,
  systemId,
}: {
  project: Project;
  systemId: string;
}) {
  const balances = systemLinearBalances(project, systemId);
  return (
    <div aria-label="Bilancio metri lineari">
      {balances.map((b) => (
        <section
          key={b.use}
          aria-label={
            b.use === "supply" ? "Mandata per ambiente" : "Ripresa del sistema"
          }
        >
          <p
            className={b.status === "deficit" ? "avviso attenzione" : "nota"}
            role={b.status === "deficit" ? "alert" : "status"}
          >
            <strong>
              {b.use === "supply" ? "Mandata" : "Ripresa"}: minimo richiesto{" "}
              {formatNumber(b.requiredM)} m
            </strong>
            <br />
            Richiesti: {formatNumber(b.requiredM * 1000, 0)} mm · Installati:{" "}
            {formatNumber(b.installedM * 1000, 0)} mm
            <br />
            {b.marginM < -1e-9 ? "Deficit" : "Margine"}:{" "}
            {b.marginM >= 0 ? "+" : ""}
            {formatNumber(b.marginM * 1000, 0)} mm
            {b.mixedModels && (
              <>
                <br />
                Modelli misti: il requisito in metri usa {b.familyCode} come
                riferimento. Capacità installata:{" "}
                {formatNumber(b.availableAirflowM3h)} /{" "}
                {formatNumber(b.airflowM3h)} m³/h. Equivalente al modello di
                riferimento: {formatNumber(b.equivalentInstalledM)} m. Il
                margine fisico non certifica la portata.
              </>
            )}
          </p>
          {b.use === "supply" && (
            <>
              <p className="nota">
                Ogni ambiente servito richiede mandata propria. I metri in
                eccesso in una stanza non compensano quelli mancanti nelle
                altre.
                {b.mixedModels &&
                  " Con modelli misti confronta la portata, non solo i metri."}
              </p>
              <RoomMeterDistribution rows={b.rooms} />
            </>
          )}
        </section>
      ))}
    </div>
  );
}

export function OperatorTerminalControls({
  project,
  room,
  systemId,
  family,
  solution,
  recommendedSolution,
  use,
  mounting,
  compact = false,
  plenumOnly = false,
  onPlaced,
  point,
  existingTerminalId,
  installationId,
  draftId,
  saveButtonRef,
}: {
  project: Project;
  room: Room;
  systemId: string | null;
  installationId?: string;
  draftId?: string;
  saveButtonRef?: Ref<HTMLButtonElement>;
  family: AirTerminalFamily;
  solution: AirTerminalSolution;
  recommendedSolution?: AirTerminalSolution;
  use: "supply" | "return";
  mounting: "wall" | "ceiling";
  compact?: boolean;
  plenumOnly?: boolean;
  onPlaced?: () => void;
  point: Point;
  existingTerminalId?: string;
}) {
  const { commit } = useProjectStore();
  const existing = project.airTerminals.find(
    (item) => item.id === existingTerminalId,
  );
  const members = existing ? linearRunMembers(project, existing) : [];
  const [customLength, setCustomLength] = useState(
    members.length === 1 &&
      !solution.variant.commercialLengthsMm.includes(members[0].widthMm),
  );
  const recommendedLength = recommendedSolution?.commercialLengthM
    ? recommendedSolution.commercialLengthM * 1000
    : null;
  const [length, setLength] = useState(
    members[0]?.widthMm.toString() ?? recommendedLength?.toString() ?? "",
  );
  const [moduleLengths, setModuleLengths] = useState<string[]>(
    members.slice(1).map((item) => item.widthMm.toString()),
  );
  const [style, setStyle] = useState(
    existing?.style ??
      (family.familyCode === "EGA6" ? "Chiusura Push (a richiesta)" : ""),
  );
  const [color, setColor] = useState(existing?.color ?? "");
  const [finish, setFinish] = useState(existing?.finish ?? "");
  const publishedConnections = terminalPlenumConnections(family.familyCode);
  const [plenumOptions, setPlenumOptions] = useState<TerminalPlenumOptions>({
    insulatedPlenum: existing?.commercialOptions?.insulatedPlenum ?? true,
    plenumModelCode: existing?.commercialOptions?.plenumModelCode,
    plenumMaterial: existing?.commercialOptions?.plenumMaterial,
    plenumShape: existing?.commercialOptions?.plenumShape,
    connectionPosition:
      existing?.commercialOptions?.connectionPosition ??
      (!existing && publishedConnections.length === 1
        ? publishedConnections[0].position
        : undefined),
    connectionNote: existing?.commercialOptions?.connectionNote,
  });
  const finishChoices = terminalFinishChoices(family);
  const finishSpecification = terminalFinishSpecification(family.familyCode);
  const [customRal, setCustomRal] = useState(
    !!finishSpecification?.customRal &&
      !!color &&
      !finishChoices.includes(color),
  );
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [manualWidth, setManualWidth] = useState(
    existing?.widthMm.toString() ?? "",
  );
  const [manualHeight, setManualHeight] = useState(
    existing?.heightMm.toString() ?? "",
  );
  const [manualDepth, setManualDepth] = useState(
    existing?.depthMm?.toString() ?? "",
  );
  const missingFace =
    !solution.variant.faceHeightMm ||
    (!family.isLinearPerMeter && !solution.variant.faceWidthMm);
  const [faceVariant, setFaceVariant] = useState(solution.variant.id);
  if (faceVariant !== solution.variant.id) {
    setFaceVariant(solution.variant.id);
    if (!family.isLinearPerMeter && missingFace) {
      // Le misure dichiarate appartengono alla taglia, non all’intera famiglia.
      const original =
        existing?.productId === solution.variant.id ? existing : undefined;
      setManualWidth(original?.widthMm.toString() ?? "");
      setManualHeight(original?.heightMm.toString() ?? "");
      setManualDepth(original?.depthMm?.toString() ?? "");
    }
  }
  const commercialModules = family.isLinearPerMeter
    ? continuityModuleLengths(family.familyCode, solution.variant)
    : [];
  const composable = commercialModules.length > 0;
  const availableLengths = moduleLengths.length
    ? commercialModules
    : solution.variant.commercialLengthsMm;
  const lengthsMm = [length, ...moduleLengths].map((value) =>
    numberFromForm(value),
  );
  const totalLengthMm = lengthsMm.reduce((sum, value) => sum + value, 0);
  const opIndex = solution.variant.operatingPoints.indexOf(
    solution.operatingPoint,
  );
  return (
    <section aria-label="Scelta singola bocchetta">
      <div hidden={plenumOnly} className={styles.operatorSettings}>
        {family.isLinearPerMeter && (
          <>
            <SizeButtons
              label={
                moduleLengths.length
                  ? "Lunghezza modulo 1"
                  : "Lunghezza singola bocchetta"
              }
              values={[
                ...availableLengths,
                ...(!customLength &&
                length &&
                !availableLengths.includes(numberFromForm(length))
                  ? [numberFromForm(length)]
                  : []),
              ]}
              value={customLength ? null : numberFromForm(length) || null}
              recommended={recommendedLength}
              onChange={(value) => {
                setCustomLength(false);
                setLength(String(value));
              }}
            />
            {recommendedSolution && recommendedLength && (
              <p
                className="nota"
                aria-label="Portata della lunghezza consigliata"
              >
                {recommendedSolution.quantityPerPoint === 1
                  ? `Lunghezza consigliata: ${formatNumber(recommendedLength, 0)} mm`
                  : `Composizione consigliata: ${recommendedSolution.quantityPerPoint} moduli da ${formatNumber(recommendedLength, 0)} mm`}
                {" · "}Fabbisogno per punto:{" "}
                {formatNumber(recommendedSolution.requiredAirflowPerPointM3h)}{" "}
                m³/h
                {" · "}Capacità:{" "}
                {formatNumber(recommendedSolution.availableAirflowPerPointM3h)}{" "}
                m³/h
              </p>
            )}
            {!moduleLengths.length && (
              <button
                type="button"
                className="bottone"
                aria-pressed={customLength}
                onClick={() => {
                  setCustomLength(true);
                  setLength("");
                }}
              >
                SU MISURA · quotazione Ecoclima
              </button>
            )}
            {recommendedLength &&
              recommendedSolution &&
              (recommendedSolution.quantityPerPoint === 1 || composable) && (
                <button
                  type="button"
                  className="bottone"
                  onClick={() => {
                    setCustomLength(false);
                    setLength(String(recommendedLength));
                    setModuleLengths(
                      Array.from(
                        { length: recommendedSolution.quantityPerPoint - 1 },
                        () => String(recommendedLength),
                      ),
                    );
                  }}
                >
                  Usa taglia consigliata ·{" "}
                  {recommendedSolution.quantityPerPoint}{" "}
                  {recommendedSolution.quantityPerPoint === 1
                    ? "modulo"
                    : "moduli"}
                </button>
              )}
            {customLength && (
              <>
                <label className={`campo ${styles.moduleLength}`}>
                  <span>Lunghezza su misura (mm)</span>
                  <input
                    aria-label="Lunghezza su misura (mm)"
                    inputMode="decimal"
                    value={length}
                    onChange={(event) => setLength(event.target.value)}
                    placeholder="Inserisci la misura richiesta"
                  />
                </label>
                <p className="avviso attenzione" role="status">
                  SU MISURA: quotazione da richiedere a Ecoclima. Prezzo e
                  fattibilità da confermare.
                </p>
              </>
            )}
            {moduleLengths.map((value, index) => (
              <div key={index} className={styles.moduleLength}>
                <SizeButtons
                  label={`Lunghezza modulo ${index + 2}`}
                  values={commercialModules}
                  value={numberFromForm(value) || null}
                  recommended={recommendedLength}
                  onChange={(length) =>
                    setModuleLengths((current) =>
                      current.map((item, i) =>
                        i === index ? String(length) : item,
                      ),
                    )
                  }
                />
                <button
                  className="bottone piccolo tenue"
                  onClick={() =>
                    setModuleLengths((current) =>
                      current.filter((_, i) => i !== index),
                    )
                  }
                >
                  Rimuovi modulo {index + 2}
                </button>
              </div>
            ))}
            {composable && (
              <>
                <button
                  className="bottone piccolo"
                  disabled={customLength || moduleLengths.length >= 99}
                  onClick={() =>
                    setModuleLengths((current) => [...current, ""])
                  }
                >
                  Aggiungi modulo nello stesso punto
                </button>
                <p className="nota" role="status">
                  {moduleLengths.length > 0
                    ? `Punto composto: ${formatNumber(totalLengthMm, 0)} mm · ${moduleLengths.length} kit di continuità.`
                    : "Per punti separati, inserisci e posiziona una bocchetta alla volta. Per unirle, aggiungi moduli nello stesso punto."}
                </p>
                {moduleLengths.length > 0 && (
                  <p className="nota">
                    Misure componibili:{" "}
                    {commercialModules
                      .map((value) => formatNumber(value, 0))
                      .join(", ")}{" "}
                    mm.
                  </p>
                )}
              </>
            )}
          </>
        )}
        {missingFace && (
          <>
            <p className="avviso attenzione">
              Ingombro frontale non disponibile nella fonte. Inserisci quote
              reali dichiarate dall’operatore; non saranno presentate come dati
              di catalogo.
            </p>
            <label className="campo">
              <span>Larghezza faccia dichiarata (mm)</span>
              <input
                aria-label="Larghezza faccia dichiarata"
                inputMode="decimal"
                value={manualWidth}
                onChange={(e) => setManualWidth(e.target.value)}
              />
            </label>
            <label className="campo">
              <span>Altezza faccia dichiarata (mm)</span>
              <input
                aria-label="Altezza faccia dichiarata"
                inputMode="decimal"
                value={manualHeight}
                onChange={(e) => setManualHeight(e.target.value)}
              />
            </label>
            <label className="campo">
              <span>Profondità dichiarata, se nota (mm)</span>
              <input
                aria-label="Profondità dichiarata"
                inputMode="decimal"
                value={manualDepth}
                onChange={(e) => setManualDepth(e.target.value)}
              />
            </label>
          </>
        )}
        <div className="campo">
          <span>Colore / finitura · obbligatorio</span>
          {finishChoices.length ? (
            <div
              role="group"
              aria-label="Colore scelto"
              className="scelta-colore"
            >
              {(color && !customRal && !finishChoices.includes(color)
                ? [color, ...finishChoices]
                : finishChoices
              ).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`bottone${color === value ? " pieno" : ""}`}
                  aria-pressed={color === value}
                  onClick={() => {
                    setColor(value);
                    setFinish(value);
                    setCustomRal(false);
                  }}
                >
                  {terminalFinishLabel(value)}
                  {value === "RAL9016" &&
                    finishSpecification?.whiteSurchargePercent &&
                    ` · +${finishSpecification.whiteSurchargePercent}%`}
                  {!finishChoices.includes(value) && " · valore precedente"}
                </button>
              ))}
              {finishSpecification?.customRal && (
                <button
                  type="button"
                  className={`bottone${customRal ? " pieno" : ""}`}
                  aria-pressed={customRal}
                  onClick={() => {
                    setCustomRal(true);
                    setColor("");
                    setFinish("");
                  }}
                >
                  RAL a scelta · da quotare
                </button>
              )}
            </div>
          ) : (
            <input
              aria-label="Colore scelto"
              required
              maxLength={100}
              placeholder="Specifica colore o codice RAL"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          )}
        </div>
        {customRal && (
          <label className="campo">
            <span>Codice RAL a scelta</span>
            <input
              aria-label="Codice RAL a scelta"
              maxLength={8}
              placeholder="Es. RAL 7035"
              value={color}
              onChange={(event) => {
                const value = event.target.value
                  .toUpperCase()
                  .replace(/\s/g, "");
                setColor(value);
                setFinish(value);
              }}
            />
          </label>
        )}
        {finishSpecification?.whiteSurchargePercent && (
          <p className="nota">
            Verniciatura Bianco RAL 9016: +
            {finishSpecification.whiteSurchargePercent}% sul prezzo base del
            terminale anodizzato. Gli altri colori richiedono quotazione.{" "}
            <a
              href={finishSpecification.surchargeSourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Listino Ecoclima
            </a>
          </p>
        )}
        {finishSpecification?.customRal && (
          <p className="nota">
            {finishSpecification.requestNote?.includes("solo pannello")
              ? finishSpecification.requestNote
              : "Verniciatura RAL a scelta disponibile su richiesta."}{" "}
            Prezzo da quotare. Eventuali supplementi del bianco valgono solo per
            RAL 9016.
          </p>
        )}
        {!finishChoices.length && (
          <p className="nota">
            Colore richiesto da verificare con Ecoclima: il catalogo non
            dichiara le finiture disponibili.
          </p>
        )}
        <p className="nota">
          Portata di questa bocchetta:{" "}
          {formatNumber(
            family.isLinearPerMeter
              ? (totalLengthMm / 1000) *
                  (solution.operatingPoint.airflowPerMeterM3h ?? 0)
              : solution.operatingPoint.airflowM3h,
            0,
          )}{" "}
          m³/h. Il totale cambia dopo la conferma della posizione.
        </p>
        <details open={!compact}>
          <summary>Aspetto e finiture facoltativi</summary>
          <label className="campo">
            <span>Stile scelto</span>
            <input
              value={style}
              maxLength={100}
              onChange={(event) => setStyle(event.target.value)}
            />
          </label>
        </details>
      </div>
      <div hidden={!plenumOnly} className={styles.plenumPanel}>
        <TerminalPlenumFields
          familyCode={family.familyCode}
          options={plenumOptions}
          onChange={(patch) =>
            setPlenumOptions((current) => ({
              ...current,
              ...patch,
              plenumModelCode: undefined,
            }))
          }
        />
      </div>
      {placementError && (
        <p className="avviso attenzione" role="alert">
          {placementError}
        </p>
      )}
      <button
        ref={saveButtonRef}
        style={saveButtonRef ? { display: "none" } : undefined}
        className="bottone pieno"
        disabled={
          (family.isLinearPerMeter &&
            [length, ...moduleLengths].some((value) => !value.trim())) ||
          (missingFace && (!manualWidth.trim() || !manualHeight.trim()))
        }
        onClick={() => {
          try {
            const input: OperatorTerminalInput = {
              roomId: room.id,
              systemId,
              installationId,
              familyCode: family.familyCode,
              variantId: solution.variant.id,
              operatingPointIndex: opIndex,
              use,
              mounting,
              lengthMm: family.isLinearPerMeter
                ? totalLengthMm
                : (solution.variant.faceWidthMm ?? numberFromForm(manualWidth)),
              customLength,
              ...(moduleLengths.length ? { moduleLengthsMm: lengthsMm } : {}),
              style,
              color: color.trim(),
              finish,
              plenumOptions,
              ...(missingFace
                ? {
                    manualDimensions: {
                      widthMm: family.isLinearPerMeter
                        ? totalLengthMm
                        : numberFromForm(manualWidth),
                      heightMm: numberFromForm(manualHeight),
                      depthMm: manualDepth.trim()
                        ? numberFromForm(manualDepth)
                        : null,
                    },
                  }
                : {}),
            };
            commit((current) =>
              saveTerminalOnPlan(
                current,
                input,
                point,
                existingTerminalId,
                draftId,
              ),
            );
            const failure = useProjectStore.getState().error;
            if (failure) throw new Error(failure);
            onPlaced?.();
            setPlacementError(null);
          } catch (cause) {
            setPlacementError(
              cause instanceof Error ? cause.message : "Bocchetta non valida.",
            );
          }
        }}
      >
        Salva bocchetta sul punto
      </button>
    </section>
  );
}
