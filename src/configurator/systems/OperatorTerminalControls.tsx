"use client";
import { useId, useState } from "react";
import type { Project, Room } from "@/schemas/project";
import type { AirTerminalFamily } from "@/domain/catalogs/air-terminal-schema";
import type { AirTerminalSolution } from "@/domain/air-terminals/size";
import { useProjectStore } from "@/stores/project-store";
import {
  addOperatorTerminal,
  type OperatorTerminalInput,
} from "@/domain/air-terminals/operator";
import { TerminalPlacement } from "./TerminalPlacement";
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
import {
  RoomMeterDistribution,
  TerminalDistribution,
} from "./TerminalDistribution";

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
  use,
  mounting,
  selectOnAdd = true,
  compact = false,
  onPlaced,
}: {
  project: Project;
  room: Room;
  systemId: string;
  family: AirTerminalFamily;
  solution: AirTerminalSolution;
  use: "supply" | "return";
  mounting: "wall" | "ceiling";
  selectOnAdd?: boolean;
  compact?: boolean;
  onPlaced?: () => void;
}) {
  const { commit, select } = useProjectStore();
  const [length, setLength] = useState("");
  const [style, setStyle] = useState(
    family.familyCode === "EGA6" ? "Chiusura Push (a richiesta)" : "",
  );
  const [color, setColor] = useState("");
  const [finish, setFinish] = useState("");
  const finishListId = useId();
  const [placement, setPlacement] = useState<{
    project: Project;
    input: OperatorTerminalInput;
  } | null>(null);
  const [placementError, setPlacementError] = useState<string | null>(null);
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
      {!compact && (
        <>
          <TerminalDistribution
            project={project}
            systemId={systemId}
            family={family}
            solution={solution}
            use={use}
          />
          <LinearSummary project={project} systemId={systemId} />
        </>
      )}
      {family.isLinearPerMeter && (
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
      )}
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
        <span>Finitura scelta</span>
        <input
          value={finish}
          aria-label="Finitura scelta"
          maxLength={100}
          list={finishListId}
          onChange={(event) => setFinish(event.target.value)}
          placeholder="Scegli o dichiara la finitura"
        />
        <datalist id={finishListId}>
          {family.finishes?.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      </label>
      <p className="nota">
        Portata di questa bocchetta:{" "}
        {formatNumber(
          family.isLinearPerMeter
            ? (numberFromForm(length || "0") / 1000) *
                (solution.operatingPoint.airflowPerMeterM3h ?? 0)
            : solution.operatingPoint.airflowM3h,
          0,
        )}{" "}
        m³/h. Il totale cambia dopo la conferma della posizione.
      </p>
      {placementError && (
        <p className="avviso attenzione" role="alert">
          {placementError}
        </p>
      )}
      <button
        className="bottone pieno"
        disabled={
          (family.isLinearPerMeter && !length.trim()) ||
          (missingFace && (!manualWidth.trim() || !manualHeight.trim()))
        }
        onClick={() => {
          try {
            const input: OperatorTerminalInput = {
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
            };
            setPlacement({
              project: addOperatorTerminal(project, input),
              input,
            });
            setPlacementError(null);
          } catch (cause) {
            setPlacementError(
              cause instanceof Error ? cause.message : "Bocchetta non valida.",
            );
          }
        }}
      >
        Posiziona nell’ambiente
      </button>
      {placement && (
        <TerminalPlacement
          preview={placement.project}
          input={placement.input}
          onClose={() => setPlacement(null)}
          onConfirmed={() => {
            setPlacement(null);
            const terminal = useProjectStore
              .getState()
              .project?.airTerminals.at(-1);
            if (terminal && selectOnAdd)
              select({ kind: "device", id: terminal.id });
            onPlaced?.();
          }}
        />
      )}
      <details open={!compact}>
        <summary>Aspetto e finiture facoltativi</summary>
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
      </details>
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
