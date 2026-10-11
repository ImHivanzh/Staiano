"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { Project, Room, Wall } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import {
  radiatorProducts,
  radiatorProductPhoto,
} from "@/domain/catalogs/radiators";
import { ManualMachineForm } from "@/configurator/systems/ManualMachineForm";
import { sizeRadiatorsInWorker } from "@/domain/radiators/size-client";
import type { RadiatorSolution } from "@/domain/radiators/size";
import { applyRadiatorSolution } from "@/domain/radiators/apply";
import { splitCatalog } from "@/domain/catalogs/splits";
import { sizeSplitSystems } from "@/domain/air-conditioning/size";
import { applySplitSystem } from "@/domain/air-conditioning/apply";

import { formatNumber, numberFromForm } from "@/utils/format";
import { roomWallSpan } from "@/domain/geometry/placement";
import styles from "./ProductTools.module.css";
import { FullscreenDialog } from "../FullscreenDialog";
import { DuctedPanel } from "../systems/DuctedPanel";
import { createInstallation } from "@/domain/installations";

import { splitUnitPresentation } from "@/domain/catalogs/split-presentation";

export type ProductTool = "radiator" | "split" | "terminal" | "machine";
export type ProductToolsProps = {
  type: ProductTool;
  project: Project;
  activeFloorId: string;
  selectedRoom?: Room;
  selectedWall?: Wall;
  onClose: () => void;
};
type PlacementProps = {
  installationId?: string;
  project: Project;
  room: Room;
  selectedWall?: Wall;
  apply: (change: (project: Project) => Project, close?: boolean) => void;
};
const brands = ["Daikin", "Mitsubishi Electric", "Gree"];
const radiatorFamilies = [
  ...new Map(
    radiatorProducts.map((product) => [
      `${product.manufacturer}|${product.family}`,
      product,
    ]),
  ).values(),
];

function RadiatorIllustration({ columns }: { columns: number | null }) {
  return (
    <svg viewBox="0 0 180 90" aria-hidden="true">
      <defs>
        <linearGradient id={`enamel-${columns}`}>
          <stop stopColor="#d5dcd9" />
          <stop offset=".38" stopColor="#fcfcf8" />
          <stop offset="1" stopColor="#a8b4b2" />
        </linearGradient>
      </defs>
      {Array.from({ length: columns ?? 1 }, (_, depth) =>
        Array.from({ length: 7 }, (_, element) => (
          <rect
            key={`${depth}-${element}`}
            x={32 + element * 14 + depth * 3}
            y={14 - depth * 1.5}
            width={columns ? 7 : 11}
            height={columns ? 60 : 64}
            rx={columns ? 3.5 : 2}
            fill={`url(#enamel-${columns})`}
            stroke="#849795"
            strokeWidth=".6"
          />
        )),
      )}
      <rect
        x="29"
        y="17"
        width={103 + (columns ?? 1) * 3}
        height="6"
        rx="3"
        fill="#d7dfda"
      />
      <rect
        x="29"
        y="66"
        width={103 + (columns ?? 1) * 3}
        height="6"
        rx="3"
        fill="#d7dfda"
      />
    </svg>
  );
}
function BrandChoice({
  value,
  onChange,
}: {
  value: string;
  onChange: (brand: string) => void;
}) {
  return (
    <div className={styles.brands} aria-label="Marca climatizzatori">
      {brands.map((brand) => (
        <button
          type="button"
          key={brand}
          aria-pressed={value === brand}
          onClick={() => onChange(brand)}
        >
          {brand === "Mitsubishi Electric" ? "Mitsubishi" : brand}
        </button>
      ))}
    </div>
  );
}

function RadiatorProducts({
  project,
  room,
  selectedWall,
  apply,
  installationId,
}: PlacementProps) {
  const installed = project.radiators.filter(
    (item) =>
      item.roomId === room.id &&
      (!installationId || item.installationId === installationId),
  );
  const [familyKey, setFamilyKey] = useState<string | null>(null);
  const [count, setCount] = useState(installed.length || 1);
  const [deltaT, setDeltaT] = useState(
    project.installations.find((item) => item.id === installationId)
      ?.radiatorDeltaTK ?? project.projectSettings.radiatorDeltaTK,
  );
  const [maxWidth, setMaxWidth] = useState("");
  const [maxHeight, setMaxHeight] = useState("");
  const [maxDepth, setMaxDepth] = useState("");
  const [wallId, setWallId] = useState(
    selectedWall && room.wallIds.includes(selectedWall.id)
      ? selectedWall.id
      : "",
  );
  const [result, setResult] = useState<{
    key: string;
    solution?: RadiatorSolution;
    error?: string;
  } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [cancelled, setCancelled] = useState<string | null>(null);
  const family = radiatorFamilies.find(
    (item) => `${item.manufacturer}|${item.family}` === familyKey,
  );
  const availableWidthMm = Math.max(
    0,
    ...project.walls
      .filter(
        (wall) =>
          room.wallIds.includes(wall.id) && (!wallId || wall.id === wallId),
      )
      .map((wall) => ((roomWallSpan(room, wall)?.lengthM ?? 0) - 0.2) * 1000),
  );
  const key = `${familyKey}|${room.id}|${room.designLoadW}|${room.heightM}|${project.projectSettings.radiatorDeltaTK}|${count}|${deltaT}|${maxWidth}|${maxHeight}|${maxDepth}|${wallId}|${availableWidthMm}`;
  useEffect(() => {
    if (!family || cancelled === key) return;
    const abort = new AbortController();
    controller.current = abort;
    const optional = (value: string) =>
      value.trim() ? numberFromForm(value) : undefined;
    sizeRadiatorsInWorker(
      room.designLoadW,
      radiatorProducts,
      deltaT,
      {
        manufacturer: family.manufacturer,
        family: family.family,
        numberOfRadiators: count,
        maxWidthMm: Math.min(optional(maxWidth) ?? Infinity, availableWidthMm),
        maxHeightMm: Math.min(
          optional(maxHeight) ?? Infinity,
          room.heightM * 1000 - 100,
        ),
        maxDepthMm: optional(maxDepth),
      },
      abort.signal,
    )
      .then((solutions) => {
        if (!abort.signal.aborted)
          setResult({
            key,
            solution: solutions.find((solution) => {
              if (!solution.searchComplete) return false;
              try {
                applyRadiatorSolution(
                  project,
                  room.id,
                  solution,
                  wallId || null,
                  installationId,
                );
                return true;
              } catch {
                return false;
              }
            }),
          });
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setResult({
            key,
            error:
              error instanceof Error
                ? error.message
                : "Ricerca non disponibile.",
          });
      });
    return () => abort.abort();
  }, [
    family,
    key,
    room.designLoadW,
    room.heightM,
    deltaT,
    count,
    maxWidth,
    maxHeight,
    maxDepth,
    cancelled,
    availableWidthMm,
    project,
    room.id,
    wallId,
    installationId,
  ]);
  const current = result?.key === key ? result : null;
  const solution = current?.solution;
  return (
    <>
      <p className={styles.hint}>
        Scegli una famiglia. Il modello e gli elementi vengono dimensionati per{" "}
        {room.name || "questo ambiente"}.
      </p>
      <div className={styles.gallery}>
        {radiatorFamilies.map((item) => {
          const value = `${item.manufacturer}|${item.family}`;
          return (
            <button
              type="button"
              key={value}
              className={styles.product}
              aria-label={`Scegli ${item.manufacturer} ${item.family}`}
              aria-pressed={familyKey === value}
              onClick={() => setFamilyKey(value)}
            >
              {radiatorProductPhoto(item) ? (
                <Image
                  src={radiatorProductPhoto(item)!.localPath}
                  alt={radiatorProductPhoto(item)!.caption}
                  width={180}
                  height={100}
                  unoptimized
                />
              ) : (
                <RadiatorIllustration columns={item.columns} />
              )}
              <span>{item.manufacturer}</span>
              <strong>{item.family}</strong>
            </button>
          );
        })}
      </div>
      <details className={styles.advanced}>
        <summary>Quantità e misure</summary>
        <label>
          Numero radiatori
          <input
            aria-label="Numero radiatori"
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (Number.isInteger(value) && value >= 1 && value <= 10)
                setCount(value);
            }}
          />
        </label>
        <label>
          ΔT progetto (K)
          <input
            type="number"
            min={1}
            max={100}
            value={deltaT}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (value >= 1 && value <= 100) setDeltaT(value);
            }}
          />
        </label>
        <label>
          Parete
          <select
            aria-label="Parete radiatore"
            value={wallId}
            onChange={(e) => setWallId(e.target.value)}
          >
            <option value="">Posizione automatica</option>
            {project.walls
              .filter((wall) => room.wallIds.includes(wall.id))
              .map((wall, index) => (
                <option key={wall.id} value={wall.id}>
                  Parete {index + 1}
                </option>
              ))}
          </select>
        </label>
        <div className={styles.measurements}>
          {[
            ["Larghezza max (mm)", maxWidth, setMaxWidth],
            ["Altezza max (mm)", maxHeight, setMaxHeight],
            ["Profondità max (mm)", maxDepth, setMaxDepth],
          ].map(([label, value, setter]) => (
            <label key={label as string}>
              {label as string}
              <input
                type="number"
                min={1}
                value={value as string}
                onChange={(e) =>
                  (setter as (value: string) => void)(e.target.value)
                }
                placeholder="Libera"
              />
            </label>
          ))}
        </div>
      </details>
      {family && !current && cancelled !== key && (
        <p className={styles.hint} role="status">
          Dimensionamento in corso…{" "}
          <button
            className={styles.inline}
            type="button"
            onClick={() => {
              controller.current?.abort();
              setCancelled(key);
            }}
          >
            Annulla
          </button>
        </p>
      )}
      {cancelled === key && (
        <button
          type="button"
          className={styles.inline}
          onClick={() => setCancelled(null)}
        >
          Riprendi dimensionamento
        </button>
      )}
      {current && !solution && (
        <p className={styles.warning} role="status">
          {current.error ??
            "Nessuna configurazione soddisfa i vincoli. Aumenta la quantità o libera le misure."}
        </p>
      )}
      {solution && (
        <div className={styles.result}>
          <span>Configurazione consigliata</span>
          <strong>
            {solution.units
              .map(
                (item) =>
                  `${item.variant.model} · ${item.variant.construction === "fixed" ? "corpo unico" : `${item.elements} elementi`}`,
              )
              .join(" + ")}
          </strong>
          <p>
            {formatNumber(solution.totalPowerW / 1000)} kW ·{" "}
            {solution.units
              .map(
                (item) =>
                  `${item.widthMm} × ${item.variant.heightMm} × ${item.variant.depthMm} mm`,
              )
              .join(" / ")}
          </p>
          <details>
            <summary>Scheda e calcolo</summary>
            {solution.log.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
            <a
              href={solution.variant.sourceMetadata.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Scheda ufficiale
            </a>
          </details>
        </div>
      )}
      <button
        type="button"
        className={styles.cta}
        disabled={!solution}
        onClick={() =>
          solution &&
          apply((currentProject) =>
            applyRadiatorSolution(
              currentProject,
              room.id,
              solution,
              wallId || null,
              installationId,
            ),
          )
        }
      >
        Inserisci radiatori
      </button>
    </>
  );
}

function SplitProducts({
  project,
  room,
  apply,
  installationId,
}: PlacementProps) {
  const existing = project.hvacSystems.find(
    (system) =>
      system.type === "split" &&
      system.roomIds.includes(room.id) &&
      (!installationId || system.installationId === installationId),
  );
  const [manufacturer, setManufacturer] = useState(
    existing?.manufacturer ?? brands[0],
  );
  const [roomIds, setRoomIds] = useState(existing?.roomIds ?? [room.id]);
  const [combinationId, setCombinationId] = useState<string | null>(null);
  const solutions = useMemo(
    () => sizeSplitSystems(project, roomIds, manufacturer, splitCatalog),
    [project, roomIds, manufacturer],
  );
  const choices = [
    ...new Map(
      solutions.map((solution) => [
        solution.assignments
          .map((assignment) => assignment.indoor.model)
          .sort()
          .join(" + "),
        solution,
      ]),
    ).entries(),
  ].map(([, solution]) => solution);
  // Preserve the most economical approved pairing for each visible indoor model.
  const modelChoices = choices.map((choice) =>
    solutions.find(
      (solution) =>
        solution.assignments
          .map((assignment) => assignment.indoor.model)
          .sort()
          .join("|") ===
        choice.assignments
          .map((assignment) => assignment.indoor.model)
          .sort()
          .join("|"),
    )!,
  );
  const chosen =
    solutions.find((solution) => solution.combination.id === combinationId) ??
    modelChoices[0];
  return (
    <>
      <p className={styles.hint}>
        Scegli marca e modello. Le combinazioni mostrate coprono la potenza
        degli ambienti selezionati.
      </p>
      <BrandChoice
        value={manufacturer}
        onChange={(brand) => {
          setManufacturer(brand);
          setCombinationId(null);
        }}
      />
      <details className={styles.advanced}>
        <summary>Climatizza più ambienti</summary>
        <fieldset>
          <legend>Ambienti climatizzati</legend>
          {project.rooms
            .filter((item) => item.floorId === room.floorId)
            .map((item) => {
              const occupied = project.hvacSystems.find(
                (system) =>
                  system.id !== existing?.id &&
                  system.roomIds.includes(item.id),
              );
              return (
                <label className={styles.check} key={item.id}>
                  <input
                    type="checkbox"
                    disabled={
                      item.geometryStatus !== "closed" || Boolean(occupied)
                    }
                    checked={roomIds.includes(item.id)}
                    onChange={(e) => {
                      setRoomIds(
                        e.target.checked
                          ? [...roomIds, item.id]
                          : roomIds.filter((id) => id !== item.id),
                      );
                      setCombinationId(null);
                    }}
                  />
                  {item.name}
                  {occupied ? " · già servito da altro impianto" : ""}
                </label>
              );
            })}
        </fieldset>
      </details>
      <div className={styles.gallery}>
        {modelChoices.map((solution, index) => (
          <button
            type="button"
            className={styles.product}
            key={solution.combination.id}
            aria-label={`Scegli ${solution.assignments.map((assignment) => assignment.indoor.model).join(" + ")}`}
            aria-pressed={chosen?.combination.id === solution.combination.id}
            onClick={() => setCombinationId(solution.combination.id)}
          >
            {splitUnitPresentation(solution.assignments[0].indoor)
              ?.productPhoto ? (
              <Image
                src={
                  splitUnitPresentation(solution.assignments[0].indoor)!
                    .productPhoto.localPath
                }
                alt={
                  splitUnitPresentation(solution.assignments[0].indoor)!
                    .productPhoto.caption
                }
                width={420}
                height={210}
                unoptimized
              />
            ) : (
              <span>Immagine ufficiale non disponibile</span>
            )}
            <span>{index === 0 ? "Consigliato" : manufacturer}</span>
            <strong>
              {solution.assignments
                .map(
                  (a) =>
                    splitUnitPresentation(a.indoor)?.title ?? a.indoor.family,
                )
                .join(" + ")}
            </strong>
            <strong>
              {solution.assignments
                .map((assignment) => assignment.indoor.model)
                .join(" + ")}
            </strong>
            <small>
              {formatNumber(solution.combination.coolingCapacityW / 1000)} kW
            </small>
          </button>
        ))}
      </div>
      {!chosen && (
        <p className={styles.warning} role="status">
          Nessuna combinazione approvata soddisfa potenza e ingombri. Scegli
          un’altra marca o modifica gli ambienti.
        </p>
      )}
      {chosen && (
        <div className={styles.result}>
          {chosen.assignments.map((assignment) => {
            const series = splitUnitPresentation(assignment.indoor);
            return series ? (
              <div key={assignment.roomId}>
                <strong>{series.title}</strong>
                <p>{series.features.join(" · ")}</p>
                {series.gains.map((gain) => (
                  <p key={gain}>{gain}</p>
                ))}
                <small>
                  {assignment.indoor.region ?? "Disponibilità secondo la fonte"}
                </small>
              </div>
            ) : null;
          })}
          <strong>
            {chosen.combination.mode === "mono" ? "Monosplit" : "Multisplit"} ·{" "}
            {chosen.assignments.length}{" "}
            {chosen.assignments.length === 1
              ? "unità interna"
              : "unità interne"}
          </strong>
          <p>
            {formatNumber(chosen.combination.coolingCapacityW / 1000)} kW freddo
            · {formatNumber(chosen.combination.heatingCapacityW! / 1000)} kW
            caldo
          </p>
          <details>
            <summary>Scheda e abbinamento</summary>
            <p>{chosen.combination.outdoorModel}</p>
            {chosen.assignments.map((assignment) => (
              <p key={assignment.roomId}>
                {
                  project.rooms.find((item) => item.id === assignment.roomId)
                    ?.name
                }
                : {assignment.indoor.model} · {assignment.indoor.widthMm} ×{" "}
                {assignment.indoor.heightMm} × {assignment.indoor.depthMm} mm
              </p>
            ))}
            <p>{chosen.combination.notes}</p>
            <a
              href={chosen.combination.sourceMetadata.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Tabella ufficiale
            </a>
          </details>
        </div>
      )}
      <button
        type="button"
        className={styles.cta}
        disabled={!chosen}
        onClick={() =>
          chosen &&
          apply((currentProject) =>
            applySplitSystem(
              currentProject,
              roomIds,
              manufacturer,
              existing?.id ?? null,
              chosen.combination.id,
              installationId,
            ),
          )
        }
      >
        {existing ? "Aggiorna climatizzatori" : "Inserisci climatizzatori"}
      </button>
    </>
  );
}

function TerminalProducts({ project, room, installationId }: PlacementProps) {
  return (
    <DuctedPanel
      project={project}
      room={room}
      installationId={installationId}
    />
  );
}
export function ProductTools({
  type,
  project,
  activeFloorId,
  selectedRoom,
  selectedWall,
  onClose,
}: ProductToolsProps) {
  const rooms = project.rooms.filter((room) => room.floorId === activeFloorId);
  const [roomId, setRoomId] = useState(
    selectedRoom?.id ?? (rooms.length === 1 ? rooms[0].id : ""),
  );
  const room = rooms.find((item) => item.id === roomId);
  const installationType =
    type === "terminal" || type === "machine" ? "ducted" : type;
  const [installationId, setInstallationId] = useState<string | null>(null);
  const installation =
    project.installations.find(
      (item) =>
        item.id === installationId &&
        item.type === installationType &&
        item.roomIds.includes(roomId),
    ) ??
    project.installations.find(
      (item) => item.type === installationType && item.roomIds.includes(roomId),
    );
  useEffect(() => {
    if (!roomId || installation) return;
    const state = useProjectStore.getState();
    const existing = state.project?.installations.find(
      (item) => item.type === installationType && item.roomIds.includes(roomId),
    );
    if (existing) return;
    state.commit((p) => createInstallation(p, installationType, roomId));
  }, [roomId, installation, installationType]);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLElement>(null);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest("dialog"))
        return;
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key === "Tab" && dialog.current) {
        const items = [
          ...dialog.current.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,a[href]",
          ),
        ].filter((item) => item.getClientRects().length);
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const element = dialog.current;
    element?.addEventListener("keydown", keydown);
    return () => {
      element?.removeEventListener("keydown", keydown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);
  const apply: PlacementProps["apply"] = (change, close = true) => {
    const previousRevision = useProjectStore.getState().revision;
    useProjectStore.getState().commit(change);
    const state = useProjectStore.getState();
    if (state.revision === previousRevision || state.error) {
      setError(state.error ?? "Configurazione non applicabile.");
      return;
    }
    setError(null);
    if (close) {
      const devices =
        type === "radiator"
          ? state.project?.radiators
          : type === "terminal"
            ? state.project?.airTerminals
            : state.project?.hvacSystems.flatMap(
                (system) => system.indoorUnits,
              );
      const placed = devices?.filter((item) => item.roomId === roomId).at(-1);
      if (placed) state.select({ kind: "device", id: placed.id });
      onClose();
    }
  };
  const valid =
    room &&
    room.geometryStatus === "closed" &&
    project.floors.find((floor) => floor.id === room.floorId)?.scaleVerified;
  const title =
    type === "radiator"
      ? "Radiatori"
      : type === "split"
        ? "Climatizzatori"
        : type === "machine"
          ? "Macchine"
          : "Bocchette";
  const content = (
    <div className={styles.catalogContent}>
      <label className={styles.room}>
        Ambiente destinazione
        <select
          aria-label="Ambiente destinazione"
          value={roomId}
          onChange={(e) => {
            setRoomId(e.target.value);
            setError(null);
          }}
        >
          <option value="">Scegli un ambiente</option>
          {rooms.map((item) => {
            const system = project.hvacSystems.find((entry) =>
              entry.roomIds.includes(item.id),
            );
            const blocked = !!item.conditioningExclusion;
            return (
              <option key={item.id} value={item.id} disabled={blocked}>
                {item.name || "Ambiente"}
                {system
                  ? ` · ${system.type === "ducted" ? "canalizzato" : "split"} ${system.manufacturer}`
                  : ""}
              </option>
            );
          })}
        </select>
      </label>
      {!room && (
        <p className={styles.hint}>
          Scegli l’ambiente in cui inserire l’apparecchio.
        </p>
      )}
      {room && !valid && (
        <p className={styles.warning}>
          Richiudi il contorno e verifica la scala della stanza prima di
          configurare gli apparecchi.
        </p>
      )}
      {valid && room && (
        <div key={`${type}-${room.id}-${installation?.id}`}>
          <div className="azioni">
            <label className="campo">
              <span>Impianto di destinazione</span>
              <select
                aria-label="Impianto di destinazione"
                value={installation?.id ?? ""}
                onChange={(event) => {
                  const selected = project.installations.find(
                    (item) => item.id === event.target.value,
                  );
                  if (selected) {
                    setInstallationId(selected.id);
                    if (!selected.roomIds.includes(roomId))
                      setRoomId(selected.roomIds[0]);
                  }
                }}
              >
                {project.installations
                  .filter((item) => item.type === installationType)
                  .map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name} · {item.roomIds.length} stanze
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              className="bottone piccolo"
              onClick={() => {
                useProjectStore
                  .getState()
                  .commit((p) =>
                    createInstallation(p, installationType, room.id),
                  );
                const added = useProjectStore
                  .getState()
                  .project?.installations.at(-1);
                if (added) setInstallationId(added.id);
              }}
            >
              Nuovo impianto
            </button>
          </div>
          {type === "radiator" ? (
            <RadiatorProducts
              project={project}
              room={room}
              selectedWall={selectedWall}
              apply={apply}
              installationId={installation?.id}
            />
          ) : type === "split" ? (
            <SplitProducts
              project={project}
              room={room}
              apply={apply}
              installationId={installation?.id}
            />
          ) : type === "machine" ? (
            <ManualMachineForm
              project={project}
              roomIds={[room.id]}
              onApplied={onClose}
              installationId={installation?.id}
            />
          ) : (
            <TerminalProducts
              project={project}
              room={room}
              apply={apply}
              installationId={installation?.id}
            />
          )}
        </div>
      )}
      {error && (
        <p className={styles.warning} role="alert">
          {error}
        </p>
      )}
    </div>
  );
  return (
    <aside
      ref={dialog}
      className={styles.panel}
      role={type === "terminal" ? "dialog" : undefined}
      aria-label={type === "terminal" ? "Catalogo bocchette" : undefined}
      aria-modal="false"
    >
      {type === "terminal" && (
        <header className={styles.header}>
          <div>
            <span>Catalogo</span>
            <h2>{title}</h2>
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label="Chiudi catalogo"
            onClick={onClose}
          >
            ×
          </button>
        </header>
      )}
      {type === "terminal" ? (
        <>
          <div className={styles.content}>
            <p className={styles.hint}>
              Configura macchina, mandata, ripresa e bocchette in uno spazio
              dedicato.
            </p>
            <button
              type="button"
              className={styles.cta}
              onClick={() => setConfigurationOpen(true)}
            >
              Configura canalizzazione
            </button>
          </div>
          <FullscreenDialog
            open={configurationOpen}
            title="Configura canalizzazione"
            onClose={() => setConfigurationOpen(false)}
          >
            {content}
          </FullscreenDialog>
        </>
      ) : (
        <FullscreenDialog
          open
          title={`Catalogo ${title.toLowerCase()}`}
          closeLabel="Chiudi catalogo"
          onClose={onClose}
        >
          {content}
        </FullscreenDialog>
      )}
    </aside>
  );
}
