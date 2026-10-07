"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { Project, Room, Wall } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import {
  radiatorProducts,
  radiatorProductPhoto,
} from "@/domain/catalogs/radiators";
import { maximumAirflowOption } from "@/domain/catalogs/hvac-airflow";
import { ManualMachineForm } from "@/configurator/systems/ManualMachineForm";
import { TerminalDistribution } from "@/configurator/systems/TerminalDistribution";
import { sizeRadiatorsInWorker } from "@/domain/radiators/size-client";
import type { RadiatorSolution } from "@/domain/radiators/size";
import { applyRadiatorSolution } from "@/domain/radiators/apply";
import { splitCatalog } from "@/domain/catalogs/splits";
import { sizeSplitSystems } from "@/domain/air-conditioning/size";
import { applySplitSystem } from "@/domain/air-conditioning/apply";
import { hvacCatalog } from "@/domain/catalogs/hvac";
import { selectDuctedMachine } from "@/domain/ducted/calculate";
import { applyDuctedSystem, ductedRoomAllocation } from "@/domain/ducted/apply";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { sizeAirTerminal } from "@/domain/air-terminals/size";
import { OperatorTerminalControls } from "@/configurator/systems/OperatorTerminalControls";
import { airTerminalModelDescription } from "@/domain/air-terminals/description";
import { formatNumber, numberFromForm } from "@/utils/format";
import { roomWallSpan } from "@/domain/geometry/placement";
import styles from "./ProductTools.module.css";
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
}: PlacementProps) {
  const installed = project.radiators.filter((item) => item.roomId === room.id);
  const [familyKey, setFamilyKey] = useState<string | null>(null);
  const [count, setCount] = useState(installed.length || 1);
  const [deltaT, setDeltaT] = useState(project.projectSettings.radiatorDeltaTK);
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
            ),
          )
        }
      >
        Inserisci radiatori
      </button>
    </>
  );
}

function SplitProducts({ project, room, apply }: PlacementProps) {
  const existing = project.hvacSystems.find(
    (system) => system.type === "split" && system.roomIds.includes(room.id),
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
            ),
          )
        }
      >
        {existing ? "Aggiorna climatizzatori" : "Inserisci climatizzatori"}
      </button>
    </>
  );
}

function TerminalProducts({ project, room, apply }: PlacementProps) {
  const allocation = ductedRoomAllocation(project, room.id);
  const [manufacturer, setManufacturer] = useState(brands[0]);
  const [use, setUse] = useState<"supply" | "return">("supply");
  const [familyCode, setFamilyCode] = useState<string | null>(null);
  const [mounting, setMounting] = useState<"wall" | "ceiling">("ceiling");
  const [choice, setChoice] = useState(0);
  const [familySearch, setFamilySearch] = useState("");
  const [showAllFamilies, setShowAllFamilies] = useState(false);
  const [servedRoomIds, setServedRoomIds] = useState([room.id]);
  const points = use === "supply" ? room.supplyPoints : room.returnPoints;
  const options = airTerminalCatalog.families.map((family) => ({
    family,
    solutions: allocation
      ? sizeAirTerminal(allocation.airflowM3h, points, family, use)
      : [],
  }));
  const selected = options.find(
    (option) => option.family.familyCode === familyCode,
  );
  const solution = selected?.solutions[choice] ?? selected?.solutions[0];
  if (!allocation) {
    const machine = selectDuctedMachine(
      project.rooms
        .filter((item) => servedRoomIds.includes(item.id))
        .reduce((total, item) => total + item.designLoadW, 0),
      manufacturer,
      hvacCatalog.products,
    )[0];
    const conflicting = project.hvacSystems.some((system) =>
      system.roomIds.some((id) => servedRoomIds.includes(id)),
    );
    return (
      <>
        <p className={styles.hint}>
          Prima delle bocchette serve la portata della macchina canalizzata.
          Configurala per questo ambiente, poi scegli il terminale.
        </p>
        <BrandChoice value={manufacturer} onChange={setManufacturer} />
        <p className={styles.hint}>
          Impianto autonomo:{" "}
          {project.rooms
            .filter((item) => servedRoomIds.includes(item.id))
            .map((item) => item.name)
            .join(", ")}
          .
        </p>
        <details className={styles.advanced}>
          <summary>Ambienti di questo impianto</summary>
          <fieldset>
            <legend>Stanze indipendenti dagli altri impianti</legend>
            {project.rooms
              .filter((item) => item.floorId === room.floorId)
              .map((item) => {
                const assigned = project.hvacSystems.find((system) =>
                  system.roomIds.includes(item.id),
                );
                return (
                  <label key={item.id} className={styles.check}>
                    <input
                      type="checkbox"
                      checked={servedRoomIds.includes(item.id)}
                      disabled={
                        item.id === room.id ||
                        Boolean(assigned) ||
                        item.geometryStatus !== "closed"
                      }
                      onChange={(e) =>
                        setServedRoomIds(
                          e.target.checked
                            ? [...servedRoomIds, item.id]
                            : servedRoomIds.filter((id) => id !== item.id),
                        )
                      }
                    />
                    {item.name}
                    {assigned ? " · già servito" : ""}
                  </label>
                );
              })}
          </fieldset>
        </details>
        {machine && (
          <div className={styles.result}>
            <strong>{machine.indoorModel}</strong>
            <p>
              {formatNumber(machine.coolingCapacityW / 1000)} kW ·{" "}
              {formatNumber(maximumAirflowOption(machine)?.airflowM3h ?? 0)}{" "}
              m³/h
            </p>
          </div>
        )}
        {conflicting && (
          <p className={styles.warning}>
            Ambiente già servito da un altro sistema. Modifica prima quel
            sistema nelle proprietà.
          </p>
        )}
        <button
          type="button"
          className={styles.cta}
          disabled={!machine || conflicting}
          onClick={() =>
            apply(
              (currentProject) =>
                applyDuctedSystem(
                  currentProject,
                  servedRoomIds,
                  manufacturer,
                  null,
                ),
              false,
            )
          }
        >
          Configura canalizzato
        </button>
      </>
    );
  }
  return (
    <>
      <p className={styles.hint}>
        Impianto autonomo:{" "}
        {project.rooms
          .filter((item) => allocation.system.roomIds.includes(item.id))
          .map((item) => item.name)
          .join(", ")}
        .<br />
        Portata assegnata: {formatNumber(allocation.airflowM3h)} m³/h. Scegli
        l’aspetto tra famiglie verificate.
      </p>
      <div className={styles.brands}>
        {(["supply", "return"] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={use === value}
            onClick={() => {
              setUse(value);
              setFamilyCode(null);
              setChoice(0);
            }}
          >
            {value === "supply" ? "Mandata" : "Ripresa"}
          </button>
        ))}
      </div>
      <label className={styles.room}>
        Cerca nel catalogo Ecoclima
        <input
          aria-label="Cerca bocchette Ecoclima"
          value={familySearch}
          onChange={(e) => setFamilySearch(e.target.value)}
          placeholder="EDLS, EDSC, EGA, push…"
        />
      </label>
      <div className={styles.gallery}>
        {options
          .filter(({ family }) =>
            familySearch.trim()
              ? familySearch
                  .trim()
                  .toLowerCase()
                  .split(/\s+/)
                  .every((word) =>
                    `${family.familyCode} ${family.name} ${family.description} ${family.closureOptions?.join(" ") ?? ""}`
                      .toLowerCase()
                      .includes(word),
                  )
              : showAllFamilies ||
                [
                  "EDLS",
                  "EDSC-C",
                  "EDSC-Q",
                  "EGA6",
                  "EGQ-PUSH",
                  "EBLF",
                  "EGQ",
                  "EVVMC",
                ].includes(family.familyCode),
          )
          .map(({ family, solutions }) => (
            <button
              type="button"
              key={family.familyCode}
              className={styles.product}
              disabled={!solutions.length}
              aria-label={`Scegli ${family.familyCode}`}
              aria-pressed={familyCode === family.familyCode}
              onClick={() => {
                setFamilyCode(family.familyCode);
                setChoice(0);
                setMounting(family.mountings?.[0] ?? "wall");
              }}
            >
              {family.image && (
                <Image
                  src={family.image}
                  alt={family.name}
                  width={180}
                  height={100}
                  unoptimized
                />
              )}
              <strong>{family.familyCode}</strong>
              <span>{family.name}</span>
              {!solutions.length && (
                <small>Dati o portata non compatibili</small>
              )}
            </button>
          ))}
      </div>
      <button
        type="button"
        className="bottone piccolo tenue"
        onClick={() => setShowAllFamilies(!showAllFamilies)}
      >
        {showAllFamilies
          ? "Mostra i modelli comuni"
          : "Tutti i modelli Ecoclima"}
      </button>
      <details className={styles.advanced}>
        <summary>Quantità e montaggio</summary>
        <label>
          {use === "supply" ? "Punti mandata" : "Punti ripresa"}
          <input
            type="number"
            min={1}
            max={100}
            value={points}
            onChange={(e) => {
              const count = Number(e.target.value);
              if (Number.isInteger(count) && count >= 1 && count <= 100) {
                apply(
                  (currentProject) => ({
                    ...currentProject,
                    rooms: currentProject.rooms.map((item) =>
                      item.id === room.id
                        ? {
                            ...item,
                            [use === "supply"
                              ? "supplyPoints"
                              : "returnPoints"]: count,
                          }
                        : item,
                    ),
                  }),
                  false,
                );
                setChoice(0);
              }
            }}
          />
        </label>
        {selected && (
          <>
            <label>
              Montaggio terminale
              <select
                aria-label="Montaggio terminale"
                value={mounting}
                onChange={(e) =>
                  setMounting(e.target.value as "wall" | "ceiling")
                }
              >
                {selected.family.mountings?.map((value) => (
                  <option key={value} value={value}>
                    {value === "wall" ? "Parete" : "Soffitto"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Misura commerciale
              <select
                aria-label="Soluzione terminale"
                value={choice}
                onChange={(e) => setChoice(Number(e.target.value))}
              >
                {selected.solutions.map((item, index) => (
                  <option key={index} value={index}>
                    {airTerminalModelDescription(
                      selected.family,
                      item.variant.id,
                    )}
                    {item.commercialLengthM
                      ? ` · ${formatNumber(item.commercialLengthM)} m`
                      : ` · ${item.quantityPerPoint} unità/punto`}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </details>
      {selected && solution && (
        <div className={styles.result}>
          <TerminalDistribution
            project={project}
            systemId={allocation.system.id}
            family={selected.family}
            solution={solution}
            use={use}
          />
          <strong>
            {airTerminalModelDescription(selected.family, solution.variant.id)}
          </strong>
          <p>
            {solution.commercialLengthM
              ? `${formatNumber(solution.commercialLengthM)} m · `
              : ""}
            {points * solution.quantityPerPoint}{" "}
            {points * solution.quantityPerPoint === 1
              ? "terminale"
              : "terminali"}{" "}
            · {mounting === "wall" ? "parete" : "soffitto"}
          </p>
          <p>
            {formatNumber(solution.availableAirflowPerPointM3h)} m³/h per punto
            · {solution.operatingPoint.noiseLabel} dB(A) di riferimento
          </p>
          <details>
            <summary>Scheda e calcolo</summary>
            {solution.log.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
            <p>{selected.family.operatingConditions}</p>
            <a
              href={selected.family.sourceMetadata.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Scheda ufficiale
            </a>
          </details>
        </div>
      )}
      {selected && solution && (
        <OperatorTerminalControls
          project={project}
          room={room}
          systemId={allocation.system.id}
          family={selected.family}
          solution={solution}
          use={use}
          mounting={mounting}
        />
      )}
    </>
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
  const incompatibleSystem = project.hvacSystems.find(
    (system) =>
      system.roomIds.includes(roomId) &&
      ((type === "split" && system.type === "ducted") ||
        (type === "terminal" && system.type === "split")),
  );
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
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
    project.floors.find((floor) => floor.id === room.floorId)?.scaleVerified &&
    !incompatibleSystem;
  const title =
    type === "radiator"
      ? "Radiatori"
      : type === "split"
        ? "Climatizzatori"
        : type === "machine"
          ? "Macchine"
          : "Bocchette";
  return (
    <aside
      ref={dialog}
      className={styles.panel}
      role="dialog"
      aria-label={`Catalogo ${title.toLowerCase()}`}
      aria-modal="false"
    >
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
      <div className={styles.content}>
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
              const blocked =
                (type === "split" && system?.type === "ducted") ||
                (type === "terminal" && system?.type === "split");
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
        {incompatibleSystem && (
          <p className={styles.warning}>
            Questo ambiente è già servito da un altro tipo di impianto. Scegli
            un ambiente libero o modifica l’impianto nelle proprietà.
          </p>
        )}
        {room && !valid && !incompatibleSystem && (
          <p className={styles.warning}>
            Richiudi il contorno e verifica la scala della stanza prima di
            configurare gli apparecchi.
          </p>
        )}
        {valid && room && (
          <div key={`${type}-${room.id}`}>
            {type === "radiator" ? (
              <RadiatorProducts
                project={project}
                room={room}
                selectedWall={selectedWall}
                apply={apply}
              />
            ) : type === "split" ? (
              <SplitProducts project={project} room={room} apply={apply} />
            ) : type === "machine" ? (
              <ManualMachineForm
                project={project}
                roomIds={[room.id]}
                onApplied={onClose}
              />
            ) : (
              <TerminalProducts project={project} room={room} apply={apply} />
            )}
          </div>
        )}
        {error && (
          <p className={styles.warning} role="alert">
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}
