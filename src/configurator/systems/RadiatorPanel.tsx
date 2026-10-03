"use client";
import { useEffect, useRef, useState } from "react";
import type { Project, Room } from "@/schemas/project";
import {
  radiatorCatalogs,
  radiatorProducts,
} from "@/domain/catalogs/radiators";
import {
  type RadiatorSolution,
  type RadiatorProgress,
} from "@/domain/radiators/size";
import { sizeRadiatorsInWorker } from "@/domain/radiators/size-client";
import { applyRadiatorSolution } from "@/domain/radiators/apply";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber, numberFromForm } from "@/utils/format";
export function RadiatorPanel({
  room,
  project,
}: {
  room: Room;
  project: Project;
}) {
  const installed = project.radiators.filter(
    (radiator) => radiator.roomId === room.id,
  );
  const savedManufacturer =
    new Set(installed.map((radiator) => radiator.manufacturer)).size === 1
      ? (installed[0]?.manufacturer ?? "")
      : "";
  const savedFamily =
    new Set(installed.map((radiator) => radiator.family)).size === 1
      ? (installed[0]?.family ?? "")
      : "";
  const [manufacturer, setManufacturer] = useState(savedManufacturer),
    [solutions, setSolutions] = useState<RadiatorSolution[] | null>(null),
    [solutionSignature, setSolutionSignature] = useState<string | null>(null),
    [wallId, setWallId] = useState<string | null>(null),
    [searching, setSearching] = useState(false),
    [progress, setProgress] = useState<RadiatorProgress | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  useEffect(
    () => () => {
      searchController.current?.abort();
    },
    [room.id, room.designLoadW, room.heightM, room.geometryStatus],
  );
  const roomSignature = `${room.id}|${room.designLoadW}|${room.heightM}|${room.geometryStatus}`;
  const visibleSolutions =
    solutionSignature === roomSignature ? solutions : null;
  const { commit, setError } = useProjectStore();
  const families = [
    ...new Set(
      radiatorProducts
        .filter((p) => !manufacturer || p.manufacturer === manufacturer)
        .map((p) => p.family),
    ),
  ];
  if (room.geometryStatus === "unresolved")
    return (
      <section className="pannello-radiatori">
        <h3>Dimensiona radiatori</h3>
        <p className="avviso attenzione">
          Chiudi il contorno della stanza: superficie e fabbisogno devono essere
          ricalcolati.
        </p>
      </section>
    );
  if (!project.floors.find((f) => f.id === room.floorId)?.scaleVerified)
    return (
      <section className="pannello-radiatori">
        <h3>Dimensiona radiatori</h3>
        <p className="avviso attenzione">
          Verifica la scala della planimetria prima del dimensionamento.
        </p>
      </section>
    );
  async function search(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget),
      optional = (name: string) =>
        data.get(name) ? numberFromForm(data.get(name)) : undefined;
    const selectedWall = String(data.get("wallId"));
    setWallId(selectedWall || null);
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    const currentRequest = ++requestId.current;
    setSearching(true);
    setSolutions(null);
    setProgress(null);
    try {
      const found = await sizeRadiatorsInWorker(
        room.designLoadW,
        radiatorProducts,
        numberFromForm(data.get("deltaT")),
        {
          manufacturer,
          family: String(data.get("family")),
          numberOfRadiators: data.get("number")
            ? numberFromForm(data.get("number"))
            : 1,
          maxWidthMm: optional("maxWidth"),
          maxHeightMm: Math.min(
            optional("maxHeight") ?? Infinity,
            room.heightM * 1000 - 100,
          ),
          maxDepthMm: optional("maxDepth"),
          minElements: optional("minElements"),
          maxElements: optional("maxElements"),
        },
        controller.signal,
        (value) => {
          if (currentRequest === requestId.current) setProgress(value);
        },
      );
      if (currentRequest !== requestId.current) return;
      setSolutions(found);
      setSolutionSignature(roomSignature);
      setError(null);
    } catch (e) {
      if (
        currentRequest !== requestId.current ||
        (e instanceof DOMException && e.name === "AbortError")
      )
        return;
      setError(
        e instanceof Error ? e.message : "Dimensionamento radiatori fallito.",
      );
    } finally {
      if (currentRequest === requestId.current) setSearching(false);
    }
  }
  return (
    <section className="pannello-radiatori">
      <h3>Dimensiona radiatori</h3>
      <p className="nota">
        Quota iniziale di disegno: base a 0,10 m dal pavimento. Verificare le
        distanze di installazione nelle istruzioni del modello.
      </p>
      <p className="nota">
        Cataloghi ufficiali locali. Famiglia scelta dall&apos;operatore.
      </p>
      <form
        onSubmit={search}
        onChange={() => {
          searchController.current?.abort();
          requestId.current++;
          setSearching(false);
          setSolutions(null);
          setProgress(null);
        }}
      >
        <label className="campo">
          <span>Marca radiatori</span>
          <select
            aria-label="Marca radiatori"
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
          >
            <option value="">Qualsiasi marca</option>
            {radiatorCatalogs.map((c) => (
              <option key={c.manufacturer}>{c.manufacturer}</option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Famiglia radiatori</span>
          <select
            key={manufacturer}
            name="family"
            aria-label="Famiglia radiatori"
            defaultValue={manufacturer === savedManufacturer ? savedFamily : ""}
          >
            <option value="">Qualsiasi famiglia</option>
            {families.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <div className="griglia-misure">
          <label className="campo">
            <span>Numero radiatori</span>
            <input
              name="number"
              aria-label="Numero radiatori"
              type="number"
              min="1"
              max="10"
              defaultValue={installed.length || 1}
            />
            <small className="nota">Se vuoto: 1 radiatore.</small>
          </label>
          <label className="campo">
            <span>ΔT progetto (K)</span>
            <input
              name="deltaT"
              type="number"
              min="1"
              max="100"
              step="1"
              defaultValue={project.projectSettings.radiatorDeltaTK}
              required
            />
          </label>
        </div>
        <label className="campo">
          <span>Parete</span>
          <select name="wallId">
            <option value="">Distribuzione automatica sulle pareti</option>
            {project.walls
              .filter((w) => room.wallIds.includes(w.id))
              .map((w, i) => (
                <option key={w.id} value={w.id}>
                  Parete {i + 1}
                </option>
              ))}
          </select>
        </label>
        <details>
          <summary>Vincoli dimensionali opzionali</summary>
          <label className="campo">
            <span>Larghezza max ciascuno (mm)</span>
            <input type="number" name="maxWidth" min="1" />
          </label>
          <label className="campo">
            <span>Altezza max (mm)</span>
            <input type="number" name="maxHeight" min="1" />
          </label>
          <label className="campo">
            <span>Profondità max (mm)</span>
            <input type="number" name="maxDepth" min="1" />
          </label>
          <div className="griglia-misure">
            <label className="campo">
              <span>Min elementi</span>
              <input type="number" name="minElements" min="1" max="500" />
            </label>
            <label className="campo">
              <span>Max elementi</span>
              <input type="number" name="maxElements" min="1" max="500" />
            </label>
          </div>
        </details>
        <button className="bottone chiara" type="submit" disabled={searching}>
          {searching ? "Ricerca radiatori…" : "Trova radiatori compatibili"}
        </button>
        {searching && (
          <button
            className="bottone piccolo"
            type="button"
            onClick={() => {
              searchController.current?.abort();
              requestId.current++;
              setSearching(false);
              setProgress(null);
            }}
          >
            Annulla ricerca
          </button>
        )}
      </form>
      {searching && (
        <p className="nota" role="status">
          Ricerca completa in corso.
          {progress
            ? ` ${progress.phase} · ${formatNumber(progress.states, 0)} stati verificati.${progress.bestPowerW !== null ? ` Potenza provvisoria ${formatNumber(progress.bestPowerW)} W.` : ""}`
            : " Preparazione calcolo…"}{" "}
          Le soluzioni saranno applicabili al termine della verifica.
        </p>
      )}
      {visibleSolutions?.length === 0 && (
        <div className="avviso attenzione">
          Nessuna configurazione commerciale soddisfa fabbisogno e vincoli.
          Aumenta numero radiatori o modifica i vincoli.
        </div>
      )}
      {visibleSolutions?.slice(0, 3).map((solution, index) => (
        <div
          className="soluzione-radiatore"
          key={solution.units
            .map((u) => `${u.variant.id}:${u.elements}`)
            .join("|")}
        >
          <span className="etichetta tinta">
            {index === 0 ? "Consigliata" : `Alternativa ${index}`}
          </span>
          <h3>
            {[
              ...new Set(solution.units.map((u) => u.variant.manufacturer)),
            ].join(" + ")}{" "}
            ·{" "}
            {new Set(solution.units.map((u) => u.variant.id)).size > 1
              ? `${[...new Set(solution.units.map((u) => u.variant.family))].join(" + ")} · combinazione mista`
              : solution.variant.model}
          </h3>
          <p>
            {solution.elements.length} radiatori ·{" "}
            {solution.elements.join(" + ")} elementi
          </p>
          <strong>
            {formatNumber(solution.totalPowerW / 1000)} kW · +
            {formatNumber(solution.marginPercent, 1)}%
          </strong>
          {solution.units.map((unit, unitIndex) => (
            <p className="nota" key={unitIndex}>
              {unitIndex + 1}. {unit.variant.manufacturer} {unit.variant.model}{" "}
              · {unit.elements} elementi
              {unit.variant.columns ? ` · ${unit.variant.columns} colonne` : ""}
              <br />
              Ingombro L × H × P: {unit.widthMm} × {unit.variant.heightMm} ×{" "}
              {unit.variant.depthMm} mm
              <br />
              Interasse: {unit.variant.interaxisMm} mm ·{" "}
              {formatNumber(unit.powerW)} W a ΔT {solution.deltaTK} K<br />
              Peso:{" "}
              {unit.variant.weightKg === null
                ? "Dato non disponibile"
                : `${formatNumber(unit.variant.weightKg * unit.elements)} kg`}{" "}
              · Acqua:{" "}
              {unit.variant.waterContentL === null
                ? "Dato non disponibile"
                : `${formatNumber(unit.variant.waterContentL * unit.elements)} l`}
            </p>
          ))}
          {!solution.searchComplete && (
            <p className="avviso attenzione">
              Risultato non definitivo. Attendere il completamento della ricerca
              prima di applicare la soluzione.
            </p>
          )}
          <details>
            <summary>Calcolo e fonte</summary>
            {solution.log.map((line, i) => (
              <p key={i} className="nota">
                {line}
              </p>
            ))}
            {[
              ...new Map(
                solution.units.map((u) => [u.variant.id, u.variant]),
              ).values(),
            ].map((variant) => (
              <div key={variant.id}>
                <p className="nota">
                  {variant.model}: {variant.widthNote}
                </p>
                <a
                  className="fonte-catalogo"
                  href={variant.sourceMetadata.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Scheda originale produttore · {variant.model}
                </a>
              </div>
            ))}
          </details>
          <button
            className="bottone pieno"
            disabled={!solution.searchComplete}
            onClick={() => {
              commit((p) =>
                applyRadiatorSolution(p, room.id, solution, wallId),
              );
              if (!useProjectStore.getState().error) setSolutions(null);
            }}
          >
            Applica e posiziona
          </button>
        </div>
      ))}
      {!!installed.length && (
        <div className="avviso buono">
          {installed.length} radiatori posizionati ·{" "}
          {formatNumber(
            installed.reduce((sum, r) => sum + r.outputW, 0) / 1000,
          )}{" "}
          kW{" "}
          <button
            className="bottone piccolo pericolo"
            onClick={() => {
              if (window.confirm("Rimuovere i radiatori della stanza?"))
                commit((p) => ({
                  ...p,
                  radiators: p.radiators.filter((r) => r.roomId !== room.id),
                  rooms: p.rooms.map((r) =>
                    r.id === room.id ? { ...r, systemType: "none" } : r,
                  ),
                }));
            }}
          >
            Rimuovi radiatori
          </button>
        </div>
      )}
    </section>
  );
}
