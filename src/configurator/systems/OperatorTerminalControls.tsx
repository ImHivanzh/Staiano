"use client";
import { useState } from "react";
import type { Project, Room } from "@/schemas/project";
import type { AirTerminalFamily } from "@/domain/catalogs/air-terminal-schema";
import type { AirTerminalSolution } from "@/domain/air-terminals/size";
import { useProjectStore } from "@/stores/project-store";
import { addOperatorTerminal } from "@/domain/air-terminals/operator";
import {
  buildLinearPlan,
  saveLinearPlan,
  systemLinearBalances,
  type LinearArm,
} from "@/domain/air-terminals/linear-meters";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import {
  acceptTerminalProposal,
  cancelTerminalProposal,
} from "@/domain/air-terminals/proposal";
import { formatNumber, numberFromForm } from "@/utils/format";

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
        <p
          key={b.use}
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
              riferimento: {formatNumber(b.equivalentInstalledM)} m. Il margine
              fisico non certifica la portata.
            </>
          )}
        </p>
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
  use,
  mounting,
}: {
  project: Project;
  room: Room;
  systemId: string;
  family: AirTerminalFamily;
  solution: AirTerminalSolution;
  use: "supply" | "return";
  mounting: "wall" | "ceiling";
}) {
  const { commit, select } = useProjectStore();
  const [length, setLength] = useState("");
  const [style, setStyle] = useState("");
  const [color, setColor] = useState("");
  const [finish, setFinish] = useState("");
  const [manualWidth, setManualWidth] = useState("");
  const [manualHeight, setManualHeight] = useState("");
  const [manualDepth, setManualDepth] = useState("");
  const missingFace =
    !solution.variant.faceHeightMm ||
    (!family.isLinearPerMeter && !solution.variant.faceWidthMm);
  const plan = project.hvacSystems.find((s) => s.id === systemId)?.linearPlan;
  const opIndex = solution.variant.operatingPoints.indexOf(
    solution.operatingPoint,
  );
  const snapshot = (p: Project) => {
    const arms: { supply?: LinearArm; return?: LinearArm } = {};
    if (plan?.supplyVariantId && plan.supplyOperatingPointIndex !== undefined)
      arms.supply = {
        familyCode: plan.familyCode,
        variantId: plan.supplyVariantId,
        operatingPointIndex: plan.supplyOperatingPointIndex,
      };
    if (
      plan?.returnFamilyCode &&
      plan.returnVariantId &&
      plan.returnOperatingPointIndex !== undefined
    )
      arms.return = {
        familyCode: plan.returnFamilyCode,
        variantId: plan.returnVariantId,
        operatingPointIndex: plan.returnOperatingPointIndex,
      };
    arms[use] = {
      familyCode: family.familyCode,
      variantId: solution.variant.id,
      operatingPointIndex: opIndex,
    };
    const next = buildLinearPlan(p, systemId, arms, airTerminalCatalog.version);
    if (!next)
      throw new Error(
        "Dati per metro insufficienti: nessun requisito inventato.",
      );
    return saveLinearPlan(p, systemId, next);
  };
  return (
    <section aria-label="Scelta singola bocchetta">
      {family.isLinearPerMeter && (
        <>
          <p>
            <strong>
              Requisito con il modello e punto attualmente selezionati:{" "}
              {formatNumber(
                (project.hvacSystems.find((s) => s.id === systemId)
                  ?.airflowM3h ?? 0) /
                  solution.operatingPoint.airflowPerMeterM3h!,
              )}{" "}
              m
            </strong>
          </p>
          <p className="nota">
            Suggerimento automatico per {room.name}:{" "}
            {formatNumber(
              solution.theoreticalLengthM! * solution.numberOfPoints,
            )}{" "}
            m. Distribuzione per carico termico. Ogni lunghezza resta una tua
            scelta.
          </p>
        </>
      )}
      <LinearSummary project={project} systemId={systemId} />
      <label className="campo">
        <span>Lunghezza singola bocchetta (mm)</span>
        <input
          aria-label="Lunghezza singola bocchetta"
          inputMode="decimal"
          value={
            family.isLinearPerMeter
              ? length
              : (solution.variant.faceWidthMm ?? "")
          }
          disabled={!family.isLinearPerMeter}
          onChange={(e) => setLength(e.target.value)}
          placeholder="Scegli la lunghezza"
        />
      </label>
      {missingFace && (
        <>
          <p className="avviso attenzione">
            Ingombro frontale non disponibile nella fonte. Inserisci quote reali
            dichiarate dall’operatore; non saranno presentate come dati di
            catalogo.
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
      <label className="campo">
        <span>Stile scelto</span>
        <input
          value={style}
          maxLength={100}
          onChange={(e) => setStyle(e.target.value)}
        />
      </label>
      <label className="campo">
        <span>Colore scelto</span>
        <input
          value={color}
          maxLength={100}
          onChange={(e) => setColor(e.target.value)}
          placeholder="Dichiarato dall’operatore"
        />
      </label>
      <label className="campo">
        <span>Finitura scelta</span>
        <input
          value={finish}
          maxLength={100}
          onChange={(e) => setFinish(e.target.value)}
          placeholder="Verificare disponibilità commerciale"
        />
      </label>
      <button
        className="bottone pieno"
        disabled={
          (family.isLinearPerMeter && !length.trim()) ||
          (missingFace && (!manualWidth.trim() || !manualHeight.trim()))
        }
        onClick={() => {
          commit((p) => {
            const sized = family.isLinearPerMeter && !plan ? snapshot(p) : p;
            return addOperatorTerminal(sized, {
              roomId: room.id,
              systemId,
              familyCode: family.familyCode,
              variantId: solution.variant.id,
              operatingPointIndex: opIndex,
              use,
              mounting,
              lengthMm: family.isLinearPerMeter
                ? numberFromForm(length)
                : (solution.variant.faceWidthMm ?? numberFromForm(manualWidth)),
              style,
              color,
              finish,
              ...(missingFace
                ? {
                    manualDimensions: {
                      widthMm: family.isLinearPerMeter
                        ? numberFromForm(length)
                        : numberFromForm(manualWidth),
                      heightMm: numberFromForm(manualHeight),
                      depthMm: manualDepth.trim()
                        ? numberFromForm(manualDepth)
                        : null,
                    },
                  }
                : {}),
            });
          });
          const state = useProjectStore.getState();
          if (!state.error) {
            const terminal = state.project?.airTerminals.at(-1);
            if (terminal) select({ kind: "device", id: terminal.id });
          }
        }}
      >
        Aggiungi singola bocchetta
      </button>
      {family.isLinearPerMeter && (
        <details>
          <summary>Proposta automatica facoltativa</summary>
          <p className="nota">
            Genera il suggerimento per tutti gli ambienti del sistema. Non crea
            pezzi finché scegli di accettarlo; conserva le modifiche manuali.
          </p>
          <button className="bottone piccolo" onClick={() => commit(snapshot)}>
            Genera proposta
          </button>
          {plan && (
            <>
              {plan.distribution.map((row) => (
                <p key={`${row.roomId}-${row.use}`} className="nota">
                  {project.rooms.find((r) => r.id === row.roomId)?.name} ·{" "}
                  {row.use === "supply" ? "Mandata" : "Ripresa"}: circa{" "}
                  {formatNumber(row.suggestedM)} m (suggerimento)
                </p>
              ))}
              <button
                className="bottone piccolo"
                disabled={plan.status !== "proposed"}
                onClick={() =>
                  commit((p) =>
                    acceptTerminalProposal(p, systemId, mounting, {
                      style,
                      color,
                      finish,
                    }),
                  )
                }
              >
                Accetta proposta e crea moduli di catalogo
              </button>
              <button
                className="bottone piccolo tenue"
                onClick={() =>
                  commit((p) => cancelTerminalProposal(p, systemId))
                }
              >
                Cancella proposta
              </button>
              <p className="nota">
                Stato:{" "}
                {plan.status === "modified"
                  ? "modificato manualmente"
                  : plan.status === "accepted"
                    ? "confermato dall’operatore"
                    : "suggerito automaticamente"}
                .
              </p>
            </>
          )}
        </details>
      )}
    </section>
  );
}
