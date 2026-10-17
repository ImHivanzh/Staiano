"use client";
import { useEffect, useId, useRef, useState, type Ref } from "react";
import type { Point, Project, Room } from "@/schemas/project";
import { ductedRoomAllocation } from "@/domain/ducted/apply";
import {
  airTerminalCatalog,
  airTerminalMountings,
} from "@/domain/catalogs/air-terminals";
import { sizeAirTerminal } from "@/domain/air-terminals/size";
import { terminalAirflowBalance } from "@/domain/air-terminals/airflow-balance";
import { OperatorTerminalControls } from "./OperatorTerminalControls";
import { formatNumber } from "@/utils/format";
import styles from "./RoomAirTerminals.module.css";
import { TerminalFamilyPicker } from "./TerminalFamilyPicker";
import { installationRoom } from "@/domain/installations";
import { SizeButtons, TerminalSolutionChoices } from "./TerminalSizeChoices";

export function RoomAirTerminals({
  project,
  room: initialRoom,
  installationId,
  point,
  existingTerminalId,
  initialUse = "supply",
  onPlaced,
  systemId: requestedSystemId,
  draftId,
  saveButtonRef,
}: {
  project: Project;
  room: Room;
  installationId?: string;
  point: Point;
  existingTerminalId?: string;
  initialUse?: "supply" | "return";
  onPlaced: () => void;
  systemId?: string | null;
  draftId?: string;
  saveButtonRef?: Ref<HTMLButtonElement>;
}) {
  const room = installationRoom(project, initialRoom, installationId);
  const allocation =
    requestedSystemId === null
      ? null
      : ductedRoomAllocation(
          project,
          room.id,
          installationId,
          requestedSystemId ?? undefined,
        );
  const existing = project.airTerminals.find(
    (item) => item.id === existingTerminalId,
  );
  const existingVariant = airTerminalCatalog.families
    .find((family) => family.familyCode === existing?.family)
    ?.variants.find((variant) => variant.id === existing?.productId);
  const [use, setUse] = useState<"supply" | "return">(
    existing?.use ?? initialUse,
  );
  const [familyCode, setFamilyCode] = useState<string | null>(
    existing?.family ?? null,
  );
  const [slotCount, setSlotCount] = useState<number | null>(
    existingVariant?.slotCount ?? null,
  );
  const [slotWidth, setSlotWidth] = useState<number | null>(
    existingVariant?.slotWidthMm ?? null,
  );
  const [choice, setChoice] = useState<number | null>(null);
  const [tab, setTab] = useState<"terminal" | "plenum">("terminal");
  const tabId = useId();
  const [mounting, setMounting] = useState<"wall" | "ceiling">(
    existing?.mounting === "wall" ? "wall" : "ceiling",
  );
  const stepHeading = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (familyCode) {
      stepHeading.current?.focus({ preventScroll: true });
    }
  }, [familyCode]);
  const systemId = allocation?.system.id ?? null;
  const sizingSystems = project.hvacSystems.filter(
    (system) =>
      system.type === "ducted" &&
      (system.indoorUnits.some((unit) => unit.floorId === room.floorId) ||
        (!system.indoorUnits.length && system.roomIds.includes(room.id))) &&
      (!installationId || system.installationId === installationId),
  );
  const [sizingChoice, setSizingChoice] = useState("");
  const sizingSystem =
    allocation?.system ??
    sizingSystems.find((system) => system.id === sizingChoice) ??
    sizingSystems.find(
      (system) =>
        system.id === (existing?.pendingSystemId ?? requestedSystemId),
    ) ??
    (sizingSystems.length === 1 ? sizingSystems[0] : undefined);
  const sizingAllocation = sizingSystem
    ? ductedRoomAllocation(
        {
          ...project,
          hvacSystems: project.hvacSystems.map((system) =>
            system.id === sizingSystem.id
              ? {
                  ...system,
                  roomIds: [...new Set([...system.roomIds, room.id])],
                }
              : system,
          ),
        },
        room.id,
        sizingSystem.installationId,
        sizingSystem.id,
      )
    : null;
  const requiredForSizing = sizingAllocation?.airflowM3h || null;
  const balance = systemId
    ? terminalAirflowBalance(project, systemId, use, room.id)
    : { required: 0, installed: 0, remaining: 0, excess: 0 };
  const total = systemId
    ? terminalAirflowBalance(project, systemId, use)
    : balance;
  const points = use === "supply" ? room.supplyPoints : room.returnPoints;
  const options = airTerminalCatalog.families
    .filter((family) => family.use.includes(use))
    .map((family) => ({
      family,
      compatible:
        sizeAirTerminal(requiredForSizing, points, family, use).length > 0,
    }));
  const family = options.find(
    (item) => item.family.familyCode === familyCode,
  )?.family;
  const allSolutions = family
    ? sizeAirTerminal(requiredForSizing, points, family, use)
    : [];
  const slots = [
    ...new Set(
      allSolutions
        .map((item) => item.variant.slotCount)
        .filter((count) => count !== null),
    ),
  ].sort((a, b) => a - b);
  const recommendedSolution = requiredForSizing ? allSolutions[0] : undefined;
  const countSolutions = allSolutions.filter(
    (item) => slotCount === null || item.variant.slotCount === slotCount,
  );
  const slotWidths = [
    ...new Set(
      countSolutions
        .map((item) => item.variant.slotWidthMm)
        .filter((width) => width !== null),
    ),
  ].sort((a, b) => a - b);
  const selectedWidth =
    slotWidth ??
    recommendedSolution?.variant.slotWidthMm ??
    (slotWidths.includes(30) ? 30 : (slotWidths[0] ?? null));
  const solutions = countSolutions.filter(
    (item) =>
      selectedWidth === null || item.variant.slotWidthMm === selectedWidth,
  );
  const solution =
    (choice === null && existing
      ? solutions.find(
          (item) =>
            item.variant.id === existing.productId &&
            item.variant.operatingPoints.indexOf(item.operatingPoint) ===
              existing.operatingPointIndex,
        )
      : solutions[choice ?? 0]) ?? solutions[0];
  function reset() {
    setTab("terminal");
    setFamilyCode(null);
    setSlotCount(null);
    setSlotWidth(null);
    setChoice(0);
  }
  return (
    <section className={styles.panel} aria-label="Bocchette della stanza">
      <h3>Bocchette · {room.name}</h3>
      {!systemId && (
        <p className="nota">
          Bocchetta indipendente. Configura modello e dimensioni; usa Collega
          per associarla a una macchina.
        </p>
      )}
      {!systemId && sizingSystems.length > 1 && (
        <label className="campo">
          <span>Macchina per dimensionamento</span>
          <select
            value={sizingSystem?.id ?? ""}
            onChange={(event) => {
              setSizingChoice(event.target.value);
              setChoice(null);
            }}
          >
            <option value="">Scegli la macchina per calcolare la taglia</option>
            {sizingSystems.map((system) => (
              <option key={system.id} value={system.id}>
                {system.name ??
                  system.genericMachine?.model ??
                  system.productId}
              </option>
            ))}
          </select>
        </label>
      )}
      {systemId && (
        <p className={styles.balance} role="status" aria-live="polite">
          Restano <strong>{formatNumber(balance.remaining, 0)} m³/h</strong>{" "}
          {use === "supply"
            ? "da distribuire nell’ambiente"
            : "di ripresa per la macchina"}
          .
          <span>
            Installati {formatNumber(balance.installed, 0)} /{" "}
            {formatNumber(balance.required, 0)} m³/h
          </span>
          {balance.excess > 0 && (
            <span>
              Capacità oltre il fabbisogno: {formatNumber(balance.excess, 0)}{" "}
              m³/h.
            </span>
          )}
          {use === "supply" && allocation!.system.roomIds.length > 1 && (
            <span>
              Restano {formatNumber(total.remaining, 0)} m³/h nell’intero
              impianto. Ogni ambiente richiede la propria mandata.
            </span>
          )}
        </p>
      )}
      <div
        className={styles.switch}
        role="group"
        aria-label="Funzione delle bocchette"
      >
        {(["supply", "return"] as const).map((value) => (
          <button
            key={value}
            className={`bottone piccolo ${use === value ? "chiara" : ""}`}
            aria-pressed={use === value}
            onClick={() => {
              setUse(value);
              reset();
            }}
          >
            {value === "supply" ? "Mandata" : "Ripresa"}
          </button>
        ))}
      </div>
      {!family ? (
        <TerminalFamilyPicker
          key={use}
          use={use}
          options={options}
          onSelect={(selected) => {
            setFamilyCode(selected.familyCode);
            setSlotWidth(null);
            const selectedSolutions = sizeAirTerminal(
              requiredForSizing,
              points,
              selected,
              use,
            );
            setSlotCount(
              requiredForSizing
                ? (selectedSolutions[0]?.variant.slotCount ?? null)
                : (selectedSolutions
                    .map((item) => item.variant.slotCount)
                    .filter((count) => count !== null)
                    .sort((a, b) => a - b)[0] ?? null),
            );
            setSlotWidth(
              requiredForSizing
                ? (selectedSolutions[0]?.variant.slotWidthMm ?? null)
                : null,
            );
            setChoice(0);
            setMounting(airTerminalMountings(selected)?.[0] ?? "wall");
          }}
        />
      ) : (
        solution && (
          <>
            <div
              className={styles.modelHeading}
              ref={stepHeading}
              tabIndex={-1}
            >
              <h4 className={styles.choiceHeading}>
                Modello · {family.familyCode}
              </h4>
              <button className="bottone piccolo" onClick={reset}>
                Cambia modello bocchetta
              </button>
            </div>
            <div
              className={styles.tabs}
              role="tablist"
              aria-label="Scheda bocchetta"
            >
              {(["terminal", "plenum"] as const).map((value, index) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  id={`${tabId}-${value}`}
                  aria-controls={`${tabId}-panel`}
                  aria-selected={tab === value}
                  tabIndex={tab === value ? 0 : -1}
                  onClick={() => setTab(value)}
                  onKeyDown={(event) => {
                    if (
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? 1
                          : 1 - index;
                    setTab(next === 0 ? "terminal" : "plenum");
                    event.currentTarget.parentElement
                      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                      [next]?.focus();
                  }}
                >
                  {value === "terminal" ? "Bocchetta" : "Plenum"}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id={`${tabId}-panel`}
              aria-labelledby={`${tabId}-${tab}`}
              tabIndex={0}
            >
              <div hidden={tab === "plenum"}>
                {systemId &&
                  family.isLinearPerMeter &&
                  solution.operatingPoint.airflowPerMeterM3h && (
                    <p
                      className="nota"
                      aria-label="Metri ancora necessari"
                      aria-live="polite"
                    >
                      Servono ancora{" "}
                      <strong>
                        {formatNumber(
                          Math.ceil(
                            balance.remaining /
                              solution.operatingPoint.airflowPerMeterM3h,
                          ),
                          0,
                        )}{" "}
                        m
                      </strong>{" "}
                      di questa bocchetta{" "}
                      {use === "supply"
                        ? `in ${room.name}`
                        : "per la ripresa della macchina"}{" "}
                      ·{" "}
                      {formatNumber(solution.operatingPoint.airflowPerMeterM3h)}{" "}
                      m³/h per metro. Totale equivalente:{" "}
                      {formatNumber(
                        Math.ceil(
                          balance.required /
                            solution.operatingPoint.airflowPerMeterM3h,
                        ),
                        0,
                      )}{" "}
                      m.
                    </p>
                  )}
                {recommendedSolution ? (
                  <p
                    className={styles.recommendedSize}
                    aria-label="Misura consigliata"
                  >
                    <strong>Misura consigliata per {room.name}:</strong>{" "}
                    {family.isLinearPerMeter
                      ? `${recommendedSolution.quantityPerPoint} ${recommendedSolution.quantityPerPoint === 1 ? "modulo" : "moduli"} da ${formatNumber((recommendedSolution.commercialLengthM ?? 0) * 1000, 0)} mm per punto`
                      : `${recommendedSolution.quantityPerPoint} ${recommendedSolution.quantityPerPoint === 1 ? "bocchetta" : "bocchette"}${recommendedSolution.variant.widthMm && recommendedSolution.variant.heightMm ? ` ${recommendedSolution.variant.widthMm} × ${recommendedSolution.variant.heightMm} mm` : ""} per punto`}
                    . Fabbisogno:{" "}
                    {formatNumber(
                      recommendedSolution.requiredAirflowPerPointM3h,
                      0,
                    )}{" "}
                    m³/h per punto; capacità consigliata:{" "}
                    {formatNumber(
                      recommendedSolution.availableAirflowPerPointM3h,
                      0,
                    )}{" "}
                    m³/h. {formatNumber(room.netAreaM2)} m² · fabbisogno{" "}
                    {formatNumber(room.designLoadW / 1000)} kW. La portata della
                    stanza è ripartita in proporzione al fabbisogno.
                  </p>
                ) : (
                  <p
                    className="nota"
                    aria-label="Portata necessaria per dimensionare"
                  >
                    Collega la bocchetta a una macchina per calcolare la misura
                    consigliata in base al fabbisogno della stanza.
                  </p>
                )}
                <div className={`${styles.selection} ${styles.terminalSetup}`}>
                  {slots.length > 0 && (
                    <SizeButtons
                      label="Numero di feritoie"
                      values={slots}
                      value={slotCount}
                      unit="feritoie"
                      recommended={recommendedSolution?.variant.slotCount}
                      onChange={(count) => {
                        setSlotCount(count);
                        setSlotWidth(null);
                        setChoice(0);
                      }}
                    />
                  )}
                  {slotWidths.length > 0 && (
                    <SizeButtons
                      label="Dimensione della feritoia (mm)"
                      values={slotWidths}
                      value={selectedWidth}
                      recommended={recommendedSolution?.variant.slotWidthMm}
                      onChange={(width) => {
                        setSlotWidth(width);
                        setChoice(0);
                      }}
                    />
                  )}
                  {family.isLinearPerMeter && use === "supply" && (
                    <p className="nota">
                      Rumore di riferimento:{" "}
                      {solution.operatingPoint.noiseLabel} dB(A). Sono
                      disponibili soltanto punti di catalogo entro 37 dB(A).
                    </p>
                  )}
                  <div
                    className={styles.mountingChoices}
                    role="group"
                    aria-label="Montaggio terminale"
                  >
                    <span className={styles.sizeLabel}>
                      Montaggio terminale
                    </span>
                    <div>
                      {(
                        airTerminalMountings(family) ?? ["wall", "ceiling"]
                      ).map((value) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={mounting === value}
                          onClick={() => setMounting(value)}
                        >
                          <svg viewBox="0 0 64 40" aria-hidden="true">
                            <path d="M10 34V6H58" />
                            {value === "wall" ? (
                              <path
                                className={styles.mountingTerminal}
                                d="M10 14V27"
                              />
                            ) : (
                              <path
                                className={styles.mountingTerminal}
                                d="M26 6H45"
                              />
                            )}
                            {value === "wall" ? (
                              <path
                                className={styles.mountingAir}
                                d="M17 20H40m-5-4 5 4-5 4"
                              />
                            ) : (
                              <path
                                className={styles.mountingAir}
                                d="M35 13V32m-4-5 4 5 4-5"
                              />
                            )}
                          </svg>
                          {value === "wall" ? "Parete" : "Soffitto"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <details
                    className={styles.technical}
                    open={!family.isLinearPerMeter}
                  >
                    <summary>
                      {family.isLinearPerMeter
                        ? "Prestazioni e misura feritoie"
                        : "Dimensioni della bocchetta"}
                    </summary>
                    <TerminalSolutionChoices
                      solutions={solutions}
                      value={solution}
                      onChange={setChoice}
                      recommended={recommendedSolution}
                      linear={family.isLinearPerMeter}
                    />
                    {systemId && use === "return" && (
                      <p className="nota">
                        Macchina: {formatNumber(balance.required)} m³/h. Griglia
                        scelta:{" "}
                        {formatNumber(solution.operatingPoint.airflowM3h)} m³/h
                        al punto di catalogo. Ogni inserimento aggiunge una
                        griglia.
                      </p>
                    )}
                    {solution.log.map((line, index) => (
                      <p key={index} className="nota">
                        {line}
                      </p>
                    ))}
                    <p className="nota">{family.geometryNote}</p>
                  </details>
                </div>
              </div>
              <div
                className={`${styles.selection} ${styles.operatorSelection}`}
              >
                <OperatorTerminalControls
                  plenumOnly={tab === "plenum"}
                  installationId={installationId}
                  draftId={draftId}
                  saveButtonRef={saveButtonRef}
                  key={`${use}-${family.familyCode}`}
                  project={project}
                  room={room}
                  systemId={systemId}
                  family={family}
                  solution={solution}
                  recommendedSolution={requiredForSizing ? solution : undefined}
                  use={use}
                  mounting={mounting}
                  compact
                  point={point}
                  existingTerminalId={existingTerminalId}
                  onPlaced={onPlaced}
                />
              </div>
            </div>
          </>
        )
      )}
    </section>
  );
}
