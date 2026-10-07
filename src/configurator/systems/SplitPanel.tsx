"use client";
import { useState } from "react";
import type { Project, Room } from "@/schemas/project";
import {
  splitCatalog,
  splitCatalogAtVersion,
  splitCombinationAtVersion,
} from "@/domain/catalogs/splits";
import { applySplitSystem } from "@/domain/air-conditioning/apply";
import { sizeSplitSystems } from "@/domain/air-conditioning/size";
import { wattsToBtuh } from "@/domain/thermal/calculate";
import { removeHvacSystem } from "@/domain/ducted/apply";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber } from "@/utils/format";
import { splitUnitPresentation } from "@/domain/catalogs/split-presentation";
import Image from "next/image";
export function SplitPanel({
  project,
  room,
}: {
  project: Project;
  room: Room;
}) {
  const existing = project.hvacSystems.find(
      (s) => s.type === "split" && s.roomIds.includes(room.id),
    ),
    { commit } = useProjectStore();
  const [manufacturer, setManufacturer] = useState(
      existing?.manufacturer ?? "Daikin",
    ),
    [roomIds, setRoomIds] = useState(existing?.roomIds ?? [room.id]);
  const [combinationId, setCombinationId] = useState(existing?.productId ?? "");
  const solutions = sizeSplitSystems(
      project,
      roomIds,
      manufacturer,
      splitCatalog,
    ),
    preview =
      solutions.find((s) => s.combination.id === combinationId) ?? solutions[0],
    installed = existing
      ? splitCombinationAtVersion(existing.productId, existing.catalogVersion)
      : null,
    combo = preview?.combination ?? installed;
  const catalog = existing
    ? splitCatalogAtVersion(existing.catalogVersion)
    : splitCatalog;
  return (
    <section className="pannello-split">
      <h3>Climatizzatori split</h3>
      <p className="nota">
        Scegli la marca. Il modello compatibile viene selezionato in base alle
        stanze servite.
      </p>
      <label className="campo">
        <span>Marca split</span>
        <select
          aria-label="Marca split"
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
        >
          {["Daikin", "Mitsubishi Electric", "Gree"].map((brand) => (
            <option key={brand}>{brand}</option>
          ))}
        </select>
      </label>
      <label className="campo">
        <span>Serie e modello</span>
        <select
          aria-label="Serie e modello split"
          value={preview?.combination.id ?? ""}
          onChange={(e) => setCombinationId(e.target.value)}
        >
          {solutions.map((s) => (
            <option key={s.combination.id} value={s.combination.id}>
              {s.assignments
                .map(
                  (a) =>
                    `${splitUnitPresentation(a.indoor)?.title ?? a.indoor.family} · ${a.indoor.model}`,
                )
                .join(" + ")}{" "}
              / {s.combination.outdoorModel}
            </option>
          ))}
        </select>
      </label>
      {preview?.assignments.map((a) => {
        const series = splitUnitPresentation(a.indoor);
        return series ? (
          <div key={a.roomId}>
            <Image
              src={series.productPhoto.localPath}
              alt={series.productPhoto.caption}
              width={420}
              height={210}
              unoptimized
              className="foto-serie"
            />
            <strong>{series.title}</strong>
            <p className="nota">{series.features.join(" · ")}</p>
            {series.gains.map((g) => (
              <p className="nota" key={g}>
                {g}
              </p>
            ))}
            <p className="nota">
              {a.indoor.region ?? "Disponibilità secondo la fonte"}
            </p>
          </div>
        ) : null;
      })}
      <details>
        <summary>Ambienti climatizzati · {roomIds.length}</summary>
        <fieldset>
          <legend>Ambienti climatizzati</legend>
          {project.rooms.map((r) => (
            <label className="ambiente-servito" key={r.id}>
              <input
                type="checkbox"
                checked={roomIds.includes(r.id)}
                onChange={(e) =>
                  setRoomIds(
                    e.target.checked
                      ? [...roomIds, r.id]
                      : roomIds.filter((id) => id !== r.id),
                  )
                }
              />
              {r.name} · {formatNumber(r.designLoadW / 1000)} kW
            </label>
          ))}
        </fieldset>
      </details>
      {!preview && (
        <p role="status" className="nota">
          COMPATIBILITÀ NON VERIFICABILE oppure capacità/dimensioni
          insufficienti: nessuna combinazione automatica disponibile per questa
          selezione. Non vengono create unità con dati stimati.
        </p>
      )}
      {preview && (
        <p className="formula">
          Soluzione:{" "}
          {preview.combination.mode === "mono" ? "Monosplit" : "Multisplit"} ·{" "}
          {preview.combination.outdoorModel}
          <br />
          Raffrescamento{" "}
          {formatNumber(preview.combination.coolingCapacityW / 1000)} kW ·
          Riscaldamento{" "}
          {formatNumber(preview.combination.heatingCapacityW! / 1000)} kW
          <br />
          {formatNumber(
            wattsToBtuh(preview.combination.coolingCapacityW),
            0,
          )}{" "}
          BTU/h
        </p>
      )}
      <button
        className="bottone chiara"
        disabled={!preview}
        onClick={() =>
          commit((p) =>
            applySplitSystem(
              p,
              roomIds,
              manufacturer,
              existing?.id ?? null,
              preview?.combination.id,
            ),
          )
        }
      >
        {existing ? "Aggiorna climatizzazione" : "Configura climatizzazione"}
      </button>
      {existing && (
        <button
          className="bottone piccolo pericolo"
          onClick={() => {
            if (
              window.confirm(
                "Rimuovere il sistema split e le sue unità interne?",
              )
            )
              commit((p) => removeHvacSystem(p, existing.id));
          }}
        >
          Rimuovi sistema split
        </button>
      )}
      {combo && (
        <details>
          <summary>Dettagli tecnici e calcolo</summary>
          <p className="nota">
            Un ambiente usa un monosplit; più ambienti richiedono una
            combinazione multisplit approvata. Posizionamento iniziale: sommità
            a 0,10 m sotto il soffitto. Quota di disegno; distanze di
            installazione da verificare nel manuale del modello.
          </p>
          <p className="nota">
            Richiesta stanza = superficie netta × altezza ×35 W/m³. Le capacità
            per stanza sono quelle simultanee della combinazione ufficiale: ogni
            unità deve soddisfare separatamente raffrescamento e riscaldamento.
          </p>
          {combo.indoorProductIds.map((id, i) => {
            const unit = catalog?.indoorUnits.find((u) => u.id === id),
              placement = existing?.indoorUnits[i],
              assigned = placement
                ? project.rooms.find((r) => r.id === placement.roomId)
                : project.rooms.find(
                    (r) =>
                      r.id ===
                      preview?.assignments.find((a) => a.slotIndex === i)
                        ?.roomId,
                  );
            return (
              <p className="nota" key={`${id}-${i}`}>
                {assigned?.name} · {unit?.model ?? id}
                <br />
                {formatNumber((combo.indoorCoolingW[i] ?? 0) / 1000)} kW freddo
                · {formatNumber((combo.indoorHeatingW[i] ?? 0) / 1000)} kW caldo
                <br />
                {unit && `${unit.widthMm}×${unit.heightMm}×${unit.depthMm} mm`}
              </p>
            );
          })}
          <p className="nota">{combo.notes}</p>
          <a
            className="fonte-catalogo"
            href={combo.sourceMetadata.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Tabella ufficiale · pagina{combo.sourceMetadata.page}
          </a>
        </details>
      )}
    </section>
  );
}
