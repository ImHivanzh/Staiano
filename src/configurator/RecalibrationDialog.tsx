"use client";
import { NotificationToast } from "./NotificationToast";
import { useEffect, useRef, useState } from "react";
import type { Project } from "@/schemas/project";
import { rescaleFloor } from "@/domain/geometry/rescale-floor";
import { checkLockedObjects } from "@/domain/project-commands";
import { validateProject } from "@/domain/validation";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber } from "@/utils/format";
import { LengthInput } from "./LengthInput";

export function RecalibrationDialog({
  project,
  floorId,
  measuredM,
  onClose,
}: {
  project: Project;
  floorId: string;
  measuredM: number;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [realM, setRealM] = useState(measuredM);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      if (
        previous &&
        previous !== document.body &&
        previous.isConnected &&
        previous.getClientRects().length
      )
        previous.focus();
      else
        document
          .querySelector<HTMLElement>(".menu-modifica > summary")
          ?.focus();
    };
  }, []);
  const factor = realM / measuredM;
  const origin = project.floors.find((floor) => floor.id === floorId)
    ?.background?.origin;
  let preview: Project | null = null;
  let error = "";
  try {
    if (!origin)
      throw new Error("Sfondo non disponibile per la ricalibrazione.");
    preview = rescaleFloor(project, floorId, factor, origin);
    checkLockedObjects(project, preview);
  } catch (reason) {
    preview = null;
    error = reason instanceof Error ? reason.message : "Misura non valida.";
  }
  const totals = (p: Project) =>
    p.rooms
      .filter(
        (room) => room.floorId === floorId && room.geometryStatus === "closed",
      )
      .reduce(
        (sum, room) => ({
          area: sum.area + room.netAreaM2,
          load: sum.load + room.designLoadW,
        }),
        { area: 0, load: 0 },
      );
  const before = totals(project),
    after = preview ? totals(preview) : null;
  const beforeIssues = new Set(
    validateProject(project)
      .filter((check) => check.status !== "valid")
      .map((check) => `${check.code}:${check.entityId}:${check.status}`),
  );
  const newIssues = preview
    ? validateProject(preview).filter(
        (check) =>
          check.status !== "valid" &&
          !beforeIssues.has(`${check.code}:${check.entityId}:${check.status}`),
      )
    : [];
  return (
    <dialog
      ref={dialog}
      className="dialogo"
      aria-label="Anteprima ricalibrazione"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.stopPropagation();
      }}
    >
      <h2>Anteprima ricalibrazione</h2>
      <p>
        Misura attuale tra i punti: {formatNumber(measuredM, 3)} m. Controlla
        l’effetto prima di confermare.
      </p>
      <LengthInput
        label="Distanza reale tra i punti"
        defaultValue={measuredM}
        min={0.001}
        required
        onValueChange={setRealM}
      />
      {error && <NotificationToast message={error} />}
      {after && (
        <dl className="anteprima-calibrazione">
          <dt>Superficie netta del piano</dt>
          <dd>
            {formatNumber(before.area)} m² prima ·{" "}
            <strong>{formatNumber(after.area)} m² dopo</strong>
          </dd>
          <dt>Fabbisogno da dimensionare</dt>
          <dd>
            {formatNumber(before.load / 1000)} kW prima ·{" "}
            <strong>{formatNumber(after.load / 1000)} kW dopo</strong>
          </dd>
        </dl>
      )}
      <p className="nota">
        Il rapporto modifica la planimetria e le posizioni; gli ingombri fisici
        degli apparecchi restano espressi nelle loro misure reali.
      </p>
      {!!newIssues.length && (
        <div role="status">
          <strong>{newIssues.length} nuove anomalie da verificare</strong>
          <ul>
            {newIssues.map((check, index) => (
              <li key={index}>{check.message}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="azioni">
        <button className="bottone" onClick={onClose}>
          Annulla ricalibrazione
        </button>
        <button
          className="bottone pieno"
          disabled={!preview}
          onClick={() => {
            if (!origin) return;
            useProjectStore
              .getState()
              .commit((current) =>
                rescaleFloor(current, floorId, factor, origin),
              );
            if (!useProjectStore.getState().error) {
              useProjectStore.getState().setTool("select");
              onClose();
            }
          }}
        >
          Conferma ricalibrazione
        </button>
      </div>
    </dialog>
  );
}
