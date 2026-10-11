"use client";
import { useEffect, useRef, useState } from "react";
import type { Project, Room } from "@/schemas/project";
import { ductedRoomAllocation } from "@/domain/ducted/apply";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { sizeAirTerminal } from "@/domain/air-terminals/size";
import { terminalAirflowBalance } from "@/domain/air-terminals/airflow-balance";
import { OperatorTerminalControls } from "./OperatorTerminalControls";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber } from "@/utils/format";
import styles from "./RoomAirTerminals.module.css";
import { TerminalFamilyPicker } from "./TerminalFamilyPicker";
import { installationRoom } from "@/domain/installations";

export function RoomAirTerminals({
  project,
  room: initialRoom,
  installationId,
}: {
  project: Project;
  room: Room;
  installationId?: string;
}) {
  const room = installationRoom(project, initialRoom, installationId);
  const allocation = ductedRoomAllocation(project, room.id, installationId);
  const [use, setUse] = useState<"supply" | "return">("supply");
  const [familyCode, setFamilyCode] = useState<string | null>(null);
  const [slotCount, setSlotCount] = useState<number | null>(null);
  const [choice, setChoice] = useState(0);
  const [mounting, setMounting] = useState<"wall" | "ceiling">("ceiling");
  const [completed, setCompleted] = useState(false);
  const stepHeading = useRef<HTMLDivElement>(null);
  const balanceHeading = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (familyCode || completed)
      balanceHeading.current?.scrollIntoView({ block: "start" });
    if (familyCode && !completed) {
      stepHeading.current?.focus({ preventScroll: true });
    }
  }, [familyCode, completed]);
  if (!allocation) return null;
  const systemId = allocation.system.id;
  const balance = terminalAirflowBalance(project, systemId, use, room.id);
  const total = terminalAirflowBalance(project, systemId, use);
  const points = use === "supply" ? room.supplyPoints : room.returnPoints;
  const options = airTerminalCatalog.families
    .filter((family) => family.use.includes(use))
    .map((family) => ({
      family,
      compatible:
        sizeAirTerminal(balance.required, points, family, use).length > 0,
    }));
  const family = options.find(
    (item) => item.family.familyCode === familyCode,
  )?.family;
  const allSolutions = family
    ? sizeAirTerminal(balance.required, points, family, use)
    : [];
  const slots = [
    ...new Set(
      allSolutions
        .map((item) => item.variant.slotCount)
        .filter((count) => count !== null),
    ),
  ].sort((a, b) => a - b);
  const solutions = allSolutions.filter(
    (item) => slotCount === null || item.variant.slotCount === slotCount,
  );
  const solution = solutions[choice] ?? solutions[0];
  function reset() {
    setFamilyCode(null);
    setSlotCount(null);
    setChoice(0);
    setCompleted(false);
  }
  return (
    <section className={styles.panel} aria-label="Bocchette della stanza">
      <h3>Bocchette · {room.name}</h3>
      <p
        className={styles.balance}
        ref={balanceHeading}
        role="status"
        aria-live="polite"
      >
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
        {use === "supply" && allocation.system.roomIds.length > 1 && (
          <span>
            Restano {formatNumber(total.remaining, 0)} m³/h nell’intero
            impianto. Ogni ambiente richiede la propria mandata.
          </span>
        )}
      </p>
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
      {completed ? (
        <div className={styles.result}>
          <p role="status">Bocchetta posizionata. Totale aggiornato.</p>
          <button className="bottone pieno" onClick={reset}>
            Aggiungi un’altra bocchetta
          </button>
        </div>
      ) : !family ? (
        <TerminalFamilyPicker
          key={use}
          use={use}
          options={options}
          onSelect={(selected) => {
            setFamilyCode(selected.familyCode);
            const first = sizeAirTerminal(
              balance.required,
              points,
              selected,
              use,
            )[0];
            setSlotCount(first?.variant.slotCount ?? null);
            setChoice(0);
            setMounting(selected.mountings?.[0] ?? "wall");
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
                Passo 2 di 3 · {family.familyCode}
              </h4>
              <button className="bottone piccolo" onClick={reset}>
                Cambia modello bocchetta
              </button>
            </div>
            <div className={styles.selection}>
              {slots.length > 0 && (
                <label className="campo">
                  <span>Numero di feritoie</span>
                  <select
                    value={slotCount ?? ""}
                    onChange={(event) => {
                      setSlotCount(Number(event.target.value));
                      setChoice(0);
                    }}
                  >
                    {slots.map((count) => (
                      <option key={count} value={count}>
                        {count} {count === 1 ? "feritoia" : "feritoie"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="campo">
                <span>Montaggio terminale</span>
                <select
                  value={mounting}
                  onChange={(event) =>
                    setMounting(event.target.value as "wall" | "ceiling")
                  }
                >
                  {(family.mountings ?? ["wall", "ceiling"]).map((value) => (
                    <option key={value} value={value}>
                      {value === "wall" ? "Parete" : "Soffitto"}
                    </option>
                  ))}
                </select>
              </label>
              <details
                className={styles.technical}
                open={!family.isLinearPerMeter}
              >
                <summary>
                  {family.isLinearPerMeter
                    ? "Prestazioni e misura feritoie"
                    : "Dimensioni della bocchetta"}
                </summary>
                <label className="campo">
                  <span>Soluzione terminale</span>
                  <select
                    value={Math.min(choice, solutions.length - 1)}
                    onChange={(event) => setChoice(Number(event.target.value))}
                  >
                    {solutions.map((item, index) => (
                      <option key={index} value={index}>
                        {item.variant.widthMm && item.variant.heightMm
                          ? `${item.variant.widthMm} × ${item.variant.heightMm} mm`
                          : item.variant.slotWidthMm
                            ? `Feritoia ${item.variant.slotWidthMm} mm`
                            : item.variant.id}{" "}
                        ·{" "}
                        {item.operatingPoint.airflowPerMeterM3h ??
                          item.operatingPoint.airflowM3h}{" "}
                        {family.isLinearPerMeter ? "m³/h per metro" : "m³/h"} ·{" "}
                        {item.operatingPoint.noiseLabel} dB(A)
                      </option>
                    ))}
                  </select>
                </label>
                {use === "return" && (
                  <p className="nota">
                    Macchina: {formatNumber(balance.required)} m³/h. Griglia
                    scelta: {formatNumber(solution.operatingPoint.airflowM3h)}{" "}
                    m³/h al punto di catalogo. Ogni inserimento aggiunge una
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
              <OperatorTerminalControls
                key={`${use}-${family.familyCode}-${solution.variant.id}`}
                project={project}
                room={room}
                systemId={systemId}
                family={family}
                solution={solution}
                use={use}
                mounting={mounting}
                selectOnAdd={false}
                compact
                onPlaced={() => setCompleted(true)}
              />
            </div>
          </>
        )
      )}
      <details className={styles.technical}>
        <summary>Impostazioni avanzate di dimensionamento</summary>
        <label className="campo">
          <span>{use === "supply" ? "Punti mandata" : "Punti ripresa"}</span>
          <input
            type="number"
            min="1"
            max="100"
            value={points}
            onChange={(event) => {
              const count = Number(event.target.value);
              if (!Number.isInteger(count) || count < 1 || count > 100) return;
              useProjectStore.getState().commit((current) =>
                installationId
                  ? {
                      ...current,
                      installations: current.installations.map((item) =>
                        item.id === installationId
                          ? {
                              ...item,
                              roomAirPoints: {
                                ...item.roomAirPoints,
                                [room.id]: {
                                  supply: room.supplyPoints,
                                  return: room.returnPoints,
                                  [use]: count,
                                },
                              },
                            }
                          : item,
                      ),
                    }
                  : {
                      ...current,
                      rooms: current.rooms.map((item) =>
                        item.id === room.id
                          ? {
                              ...item,
                              [use === "supply"
                                ? "supplyPoints"
                                : "returnPoints"]: count,
                            }
                          : item,
                      ),
                    },
              );
              setChoice(0);
            }}
          />
        </label>
      </details>
      <details className={styles.technical}>
        <summary>Terminali posizionati</summary>
        {project.airTerminals
          .filter(
            (item) => item.systemId === systemId && item.roomId === room.id,
          )
          .map((item) => (
            <button
              className="bottone piccolo"
              key={item.id}
              onClick={() =>
                useProjectStore
                  .getState()
                  .select({ kind: "device", id: item.id })
              }
            >
              {item.use === "supply" ? "Mandata" : "Ripresa"} · {item.family} ·{" "}
              {formatNumber(item.availableAirflowM3h, 0)} m³/h
            </button>
          ))}
      </details>
    </section>
  );
}
