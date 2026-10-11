"use client";
import { useState } from "react";
import type { Project, Room } from "@/schemas/project";
import { RadiatorPanel } from "./RadiatorPanel";
import { DuctedPanel } from "./DuctedPanel";
import { SplitPanel } from "./SplitPanel";
import { FanCoilPanel } from "./FanCoilPanel";
import { HydronicPanel } from "./HydronicPanel";
import styles from "./RoomSystems.module.css";
import { FullscreenDialog } from "../FullscreenDialog";
import { Columns, Wind, Snowflake } from "@phosphor-icons/react";
import { formatNumber } from "@/utils/format";
import {
  createInstallation,
  ensureInstallations,
  installationLabels,
  type Installation,
} from "@/domain/installations";
import { useProjectStore } from "@/stores/project-store";
export function RoomSystems({
  project,
  room: initialRoom,
  installationId: requestedInstallationId,
  initialOpen = false,
  onClosed,
}: {
  project: Project;
  room: Room;
  installationId?: string;
  initialOpen?: boolean;
  onClosed?: () => void;
}) {
  const [mode, setMode] = useState<"radiator" | "ducted" | "split" | "fanCoil">(
    project.installations.find((item) => item.id === requestedInstallationId)
      ?.type ??
      (initialRoom.systemType === "none" ? "radiator" : initialRoom.systemType),
  );
  const [installationId, setInstallationId] = useState<string | null>(
    requestedInstallationId ?? null,
  );
  const [roomId, setRoomId] = useState(initialRoom.id);
  const room = project.rooms.find((item) => item.id === roomId) ?? initialRoom;
  const installation = project.installations.find(
    (item) => item.id === installationId,
  );
  const { commit } = useProjectStore();
  const populated =
    !!installationId &&
    [
      ...project.hvacSystems,
      ...project.radiators,
      ...(project.fanCoils ?? []),
    ].some((item) => item.installationId === installationId);
  const selectMode = (type: Installation["type"]) => {
    if (populated && installation?.type !== type) return;
    setMode(type);
    if (installationId)
      commit((p) => ({
        ...p,
        installations: p.installations.map((item) =>
          item.id === installationId ? { ...item, type } : item,
        ),
      }));
  };
  const newInstallation = () => {
    commit((p) => createInstallation(p, "radiator", room.id));
    const latest = useProjectStore.getState().project?.installations.at(-1);
    if (latest) {
      setInstallationId(latest.id);
      setMode(latest.type);
    }
  };
  const [open, setOpen] = useState(initialOpen);
  if (room.conditioningExclusion)
    return (
      <p className="nota">
        Ambiente non climatizzato: {room.conditioningExclusion.reason}. Riattiva
        la climatizzazione per configurare nuovi apparecchi.
      </p>
    );
  return (
    <>
      {!initialOpen && (
        <button
          type="button"
          className="bottone chiara"
          onClick={() => {
            const initialized = ensureInstallations(project);
            const existing =
              initialized.installations.find(
                (item) =>
                  item.roomIds.includes(initialRoom.id) &&
                  item.type === initialRoom.systemType,
              ) ??
              initialized.installations.find((item) =>
                item.roomIds.includes(initialRoom.id),
              );
            commit((p) =>
              existing
                ? ensureInstallations(p)
                : createInstallation(p, mode, initialRoom.id),
            );
            const selected =
              existing ??
              useProjectStore.getState().project?.installations.at(-1);
            if (selected) {
              setInstallationId(selected.id);
              setRoomId(initialRoom.id);
              setMode(selected.type);
            }
            setOpen(true);
          }}
        >
          Configura impianto
        </button>
      )}
      <FullscreenDialog
        open={open}
        title="Configura impianto"
        onClose={() => {
          setOpen(false);
          onClosed?.();
        }}
      >
        <section className={`sistemi-stanza ${styles.configuration}`}>
          <div className={styles.installationBar}>
            <label className="campo">
              <span>Impianto corrente</span>
              <select
                aria-label="Impianto corrente"
                value={installationId ?? ""}
                onChange={(event) => {
                  const selected = project.installations.find(
                    (item) => item.id === event.target.value,
                  );
                  if (selected) {
                    setInstallationId(selected.id);
                    setMode(selected.type);
                    setRoomId(
                      selected.roomIds.includes(room.id)
                        ? room.id
                        : selected.roomIds[0],
                    );
                  }
                }}
              >
                {project.installations.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name} · {installationLabels[item.type]} ·{" "}
                    {item.roomIds.length}{" "}
                    {item.roomIds.length === 1 ? "stanza" : "stanze"}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="bottone chiara"
              onClick={newInstallation}
            >
              Nuovo impianto
            </button>
          </div>
          {installation && (
            <details className={styles.membership}>
              <summary>
                Stanze di {installation.name} · {installation.roomIds.length}
              </summary>
              <p className="nota">
                Ogni impianto ha un solo tipo. La stessa stanza può essere
                servita da impianti distinti.
              </p>
              {project.rooms
                .filter(
                  (item) =>
                    item.floorId === room.floorId &&
                    !item.conditioningExclusion,
                )
                .map((item) => {
                  const occupied =
                    [...project.radiators, ...(project.fanCoils ?? [])].some(
                      (device) =>
                        device.installationId === installationId &&
                        device.roomId === item.id,
                    ) ||
                    project.hvacSystems.some(
                      (system) =>
                        system.installationId === installationId &&
                        system.roomIds.includes(item.id),
                    );
                  return (
                    <label className="ambiente-servito" key={item.id}>
                      <input
                        type="checkbox"
                        checked={installation.roomIds.includes(item.id)}
                        disabled={
                          occupied ||
                          (installation.roomIds.length === 1 &&
                            installation.roomIds.includes(item.id))
                        }
                        onChange={(event) =>
                          commit((p) => ({
                            ...p,
                            installations: p.installations.map((current) =>
                              current.id === installationId
                                ? {
                                    ...current,
                                    roomIds: event.target.checked
                                      ? [...current.roomIds, item.id]
                                      : current.roomIds.filter(
                                          (id) => id !== item.id,
                                        ),
                                  }
                                : current,
                            ),
                          }))
                        }
                      />
                      {item.name}
                      {occupied && " · apparecchi già configurati"}
                    </label>
                  );
                })}
            </details>
          )}
          <div className={styles.roomHeading}>
            <div>
              <h3>{room.name}</h3>
              {installation && installation.roomIds.length > 1 && (
                <label className="campo">
                  <span>Stanza da configurare</span>
                  <select
                    aria-label="Stanza da configurare"
                    value={room.id}
                    onChange={(event) => setRoomId(event.target.value)}
                  >
                    {project.rooms
                      .filter((item) => installation.roomIds.includes(item.id))
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            <p className={styles.load}>
              Fabbisogno{" "}
              <strong>{formatNumber(room.designLoadW / 1000)} kW</strong>
            </p>
          </div>
          <div
            className="scelta-impianto"
            role="group"
            aria-label="Impianto da configurare"
          >
            <button
              type="button"
              aria-pressed={mode === "radiator"}
              disabled={populated && mode !== "radiator"}
              onClick={() => selectMode("radiator")}
            >
              <Columns size={23} aria-hidden="true" />
              Radiatori
            </button>
            <button
              type="button"
              aria-pressed={mode === "ducted"}
              disabled={populated && mode !== "ducted"}
              onClick={() => selectMode("ducted")}
            >
              <Wind size={23} aria-hidden="true" />
              Canalizzato
            </button>
            <button
              type="button"
              aria-pressed={mode === "fanCoil"}
              disabled={populated && mode !== "fanCoil"}
              onClick={() => selectMode("fanCoil")}
            >
              <Wind size={23} aria-hidden="true" />
              Ventilconvettori
            </button>
            <button
              type="button"
              aria-pressed={mode === "split"}
              disabled={populated && mode !== "split"}
              onClick={() => selectMode("split")}
            >
              <Snowflake size={23} aria-hidden="true" />
              Split
            </button>
          </div>
          <div key={`${installationId}-${room.id}-${mode}`}>
            {mode === "radiator" ? (
              <RadiatorPanel
                project={project}
                room={room}
                installationId={installationId ?? undefined}
              />
            ) : mode === "ducted" ? (
              <DuctedPanel
                project={project}
                room={room}
                installationId={installationId ?? undefined}
              />
            ) : mode === "fanCoil" ? (
              <>
                <FanCoilPanel
                  project={project}
                  room={room}
                  installationId={installationId ?? undefined}
                />
                <details>
                  <summary>Impianto idronico · pompa di calore</summary>
                  <HydronicPanel project={project} floorId={room.floorId} />
                </details>
              </>
            ) : (
              <SplitPanel
                project={project}
                room={room}
                installationId={installationId ?? undefined}
              />
            )}
          </div>
        </section>
      </FullscreenDialog>
    </>
  );
}
