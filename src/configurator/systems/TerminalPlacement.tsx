"use client";
import { useState } from "react";
import type { Point, Project } from "@/schemas/project";
import {
  addOperatorTerminal,
  type OperatorTerminalInput,
} from "@/domain/air-terminals/operator";
import { movePlacedDevice } from "@/domain/geometry/move-device";
import { pointInPolygon } from "@/domain/geometry/primitives";
import { terminalAirflowBalance } from "@/domain/air-terminals/airflow-balance";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber } from "@/utils/format";
import { FullscreenDialog } from "../FullscreenDialog";
import { Editor2D } from "../editor2d/Editor2D";
import styles from "./RoomAirTerminals.module.css";

export function TerminalPlacement({
  preview,
  input,
  onClose,
  onConfirmed,
}: {
  preview: Project;
  input: OperatorTerminalInput;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const { project, commit, snap } = useProjectStore();
  const [draft, setDraft] = useState(preview);
  const [positioned, setPositioned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const terminal = draft.airTerminals.at(-1)!;
  const balance = terminalAirflowBalance(
    project!,
    input.systemId,
    input.use,
    terminal.roomId,
  );
  function move(target: Point) {
    try {
      const room = draft.rooms.find(
        (item) =>
          item.floorId === terminal.floorId &&
          pointInPolygon(target, item.polygon),
      );
      if (
        !room ||
        room.conditioningExclusion ||
        !draft.hvacSystems
          .find((item) => item.id === input.systemId)
          ?.roomIds.includes(room.id)
      )
        throw new Error(
          "Clicca dentro un ambiente climatizzato servito dalla macchina.",
        );
      const snapped =
        terminal.mounting === "ceiling"
          ? movePlacedDevice(draft, terminal.id, target, snap)
          : draft;
      const next = movePlacedDevice(
        snapped,
        terminal.id,
        terminal.mounting === "ceiling"
          ? snapped.airTerminals.at(-1)!.position
          : target,
      );
      if (next.airTerminals.at(-1)!.roomId !== room.id)
        throw new Error("Scegli una parete dell’ambiente selezionato.");
      setDraft(next);
      setPositioned(true);
      setError(null);
    } catch (cause) {
      setPositioned(false);
      setError(
        cause instanceof Error ? cause.message : "Posizione non valida.",
      );
    }
  }
  return (
    <FullscreenDialog
      open
      title="Posiziona bocchetta"
      closeLabel="Annulla inserimento"
      onClose={onClose}
    >
      <div className={styles.placement}>
        <p className={styles.intro}>
          Passo 3 di 3 · {input.familyCode} ·{" "}
          {formatNumber(terminal.widthMm, 0)} mm ·{" "}
          {input.finish || "Finitura da definire"}. Clicca nell’ambiente, poi
          trascina la bocchetta o usa le frecce sulla pianta. Conferma quando
          hai finito.
        </p>
        <p role="status">
          Restano <strong>{formatNumber(balance.remaining, 0)} m³/h</strong>{" "}
          {input.use === "supply"
            ? "nell’ambiente"
            : "di ripresa della macchina"}
          . Totale aggiornato alla conferma.
        </p>
        <Editor2D
          placement={{ project: draft, terminalId: terminal.id, onMove: move }}
        />
        {error && (
          <p className="avviso attenzione" role="alert">
            {error}
          </p>
        )}
        <button
          className="bottone pieno"
          disabled={!positioned}
          onClick={() => {
            commit((current) => {
              const next = addOperatorTerminal(current, {
                ...input,
                roomId: terminal.roomId,
              });
              const added = next.airTerminals.at(-1)!;
              added.rotation = terminal.rotation;
              return movePlacedDevice(next, added.id, terminal.position);
            });
            const failure = useProjectStore.getState().error;
            if (failure) setError(failure);
            else onConfirmed();
          }}
        >
          Conferma posizione
        </button>
      </div>
    </FullscreenDialog>
  );
}
