"use client";
import { useState } from "react";
import type { Project, Room } from "@/schemas/project";
import {
  radiatorCatalogs,
  radiatorProducts,
} from "@/domain/catalogs/radiators";
import { sizeRadiators, type RadiatorSolution } from "@/domain/radiators/size";
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
  const [manufacturer, setManufacturer] = useState("Cordivari"),
    [solutions, setSolutions] = useState<RadiatorSolution[] | null>(null),
    [wallId, setWallId] = useState<string | null>(null);
  const { commit, setError } = useProjectStore();
  const families = [
    ...new Set(
      radiatorProducts
        .filter((p) => p.manufacturer === manufacturer)
        .map((p) => p.family),
    ),
  ];
  const installed = project.radiators.filter((r) => r.roomId === room.id);
  if (!project.floors.find((f) => f.id === room.floorId)?.scaleVerified)
    return (
      <section className="pannello-radiatori">
        <h3>Dimensiona radiatori</h3>
        <p className="avviso attenzione">
          Verifica la scala della planimetria prima del dimensionamento.
        </p>
      </section>
    );
  function search(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget),
      optional = (name: string) =>
        data.get(name) ? numberFromForm(data.get(name)) : undefined;
    const selectedWall = String(data.get("wallId"));
    setWallId(selectedWall || null);
    try {
      setSolutions(
        sizeRadiators(
          room.designLoadW,
          radiatorProducts,
          numberFromForm(data.get("deltaT")),
          {
            manufacturer,
            family: String(data.get("family")),
            numberOfRadiators: numberFromForm(data.get("number")),
            maxWidthMm: optional("maxWidth"),
            maxHeightMm: optional("maxHeight"),
            maxDepthMm: optional("maxDepth"),
            minElements: optional("minElements"),
            maxElements: optional("maxElements"),
          },
        ),
      );
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Dimensionamento radiatori fallito.",
      );
    }
  }
  return (
    <section className="pannello-radiatori">
      <h3>Dimensiona radiatori</h3>
      <p className="nota">
        Cataloghi ufficiali locali. Famiglia scelta dall&apos;operatore.
      </p>
      <form onSubmit={search} onChange={() => setSolutions(null)}>
        <label className="campo">
          <span>Marca radiatori</span>
          <select
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
          >
            {radiatorCatalogs.map((c) => (
              <option key={c.manufacturer}>{c.manufacturer}</option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Famiglia radiatori</span>
          <select key={manufacturer} name="family">
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
              type="number"
              min="1"
              max="10"
              defaultValue="1"
              required
            />
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
        <button className="bottone chiara" type="submit">
          Trova radiatori compatibili
        </button>
      </form>
      {solutions?.length === 0 && (
        <div className="avviso attenzione">
          Nessuna configurazione commerciale soddisfa fabbisogno e vincoli.
          Aumenta numero radiatori o modifica i vincoli.
        </div>
      )}
      {solutions?.slice(0, 3).map((solution, index) => (
        <div className="soluzione-radiatore" key={solution.variant.id}>
          <span className="etichetta tinta">
            {index === 0 ? "Consigliata" : `Alternativa ${index}`}
          </span>
          <h3>{solution.variant.model}</h3>
          <p>
            {solution.elements.length} radiatori ·{" "}
            {solution.elements.join(" + ")} elementi
            {solution.variant.columns
              ? ` · ${solution.variant.columns} colonne`
              : ""}
          </p>
          <strong>
            {formatNumber(solution.totalPowerW / 1000)} kW · +
            {formatNumber(solution.marginPercent, 1)}%
          </strong>
          <p className="nota">
            Larghezze: {solution.widthsMm.join(" / ")} mm
            <br />
            Altezza: {solution.variant.heightMm} mm · Profondità:{" "}
            {solution.variant.depthMm} mm
            <br />
            Interasse: {solution.variant.interaxisMm} mm · ΔT {solution.deltaTK}{" "}
            K<br />
            Peso:{" "}
            {solution.variant.weightKg === null
              ? "Dato non disponibile"
              : `${formatNumber(solution.variant.weightKg * solution.elements.reduce((a, b) => a + b, 0))} kg`}
            <br />
            Acqua:{" "}
            {solution.variant.waterContentL === null
              ? "Dato non disponibile"
              : `${formatNumber(solution.variant.waterContentL * solution.elements.reduce((a, b) => a + b, 0))} l`}
          </p>
          <details>
            <summary>Calcolo e fonte</summary>
            {solution.log.map((line, i) => (
              <p key={i} className="nota">
                {line}
              </p>
            ))}
            <p className="nota">{solution.variant.widthNote}</p>
            <a
              className="fonte-catalogo"
              href={solution.variant.sourceMetadata.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Scheda originale produttore
            </a>
          </details>
          <button
            className="bottone pieno"
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
