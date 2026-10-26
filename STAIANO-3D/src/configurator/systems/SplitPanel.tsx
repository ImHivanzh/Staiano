"use client";
import { useState, type Ref } from "react";
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
import styles from "./SystemConfiguration.module.css";
import { lastAvailableManufacturer } from "./manufacturer-preference";
export function SplitPanel({
  project,
  room,
  installationId,
  onPlace,
  saveButtonRef,
  existingDeviceId,
}: {
  project: Project;
  room: Room;
  installationId?: string;
  onPlace?: (change: (project: Project) => Project) => void;
  saveButtonRef?: Ref<HTMLButtonElement>;
  existingDeviceId?: string;
}) {
  const existing = project.hvacSystems.find(
      (s) =>
        s.type === "split" &&
        (!existingDeviceId ||
          s.indoorUnits.some((unit) => unit.id === existingDeviceId)) &&
        s.roomIds.includes(room.id) &&
        (!installationId || s.installationId === installationId),
    ),
    { commit } = useProjectStore();
  const [manufacturer, setManufacturer] = useState(
      existing?.manufacturer ??
        lastAvailableManufacturer(
          project.hvacSystems.map((system) => system.manufacturer),
          ["Daikin", "Mitsubishi Electric", "Gree", "LG"],
        ),
    ),
    [roomIds, setRoomIds] = useState(
      existing?.roomIds ??
        project.installations.find((item) => item.id === installationId)
          ?.roomIds ?? [room.id],
    );
  const [combinationId, setCombinationId] = useState(existing?.productId ?? "");
  const solutions = sizeSplitSystems(
      project,
      roomIds,
      manufacturer,
      splitCatalog,
    ),
    choices = sizeSplitSystems(project, roomIds, manufacturer, splitCatalog, {
      allowUnderCapacity: true,
    }),
    preview =
      choices.find((s) => s.combination.id === combinationId) ??
      solutions[0] ??
      choices[0],
    installed = existing
      ? splitCombinationAtVersion(existing.productId, existing.catalogVersion)
      : null,
    combo = preview?.combination ?? installed;
  const catalog = existing
    ? splitCatalogAtVersion(existing.catalogVersion)
    : splitCatalog;
  const lgMultiCapacityUnavailable =
    manufacturer === "LG" &&
    roomIds.length > 1 &&
    catalog?.combinations.some(
      (item) =>
        item.manufacturer === "LG" &&
        item.mode === "multi" &&
        item.indoorProductIds.length === roomIds.length &&
        (item.indoorCoolingW.some((value) => value === null) ||
          item.indoorHeatingW.some((value) => value === null)),
    );
  return (
    <section className={styles.panel} aria-label="Configurazione split">
      <header className={styles.heading}>
        <h3>Climatizzatori split</h3>
        <p className="nota">
          Scegli la marca e il modello. Il sistema evidenzia le combinazioni
          compatibili con il carico delle stanze.
        </p>
      </header>
      <div className={styles.layout}>
        <div className={styles.controls}>
          <h4>Marca, modello e ambienti</h4>
          <label className="campo">
            <span>Marca split</span>
            <select
              aria-label="Marca split"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
            >
              {["Daikin", "Mitsubishi Electric", "Gree", "LG"].map((brand) => (
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
              {choices.map((s) => (
                <option key={s.combination.id} value={s.combination.id}>
                  {s.assignments
                    .map(
                      (a) =>
                        `${splitUnitPresentation(a.indoor)?.title ?? a.indoor.family} · ${a.indoor.model}`,
                    )
                    .join(" + ")}{" "}
                  / {s.combination.outdoorModel}
                  {!s.meetsLoad ? " · potenza insufficiente" : ""}
                </option>
              ))}
            </select>
          </label>
          <details open>
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
          {solutions[0] && (
            <div
              className={styles.recommendation}
              aria-label="Split consigliato"
            >
              <strong>Consigliato</strong>
              <p>
                {solutions[0].assignments
                  .map((item) => item.indoor.model)
                  .join(" + ")}{" "}
                / {solutions[0].combination.outdoorModel}
              </p>
              <button
                type="button"
                className="bottone"
                aria-pressed={
                  preview?.combination.id === solutions[0].combination.id
                }
                onClick={() => setCombinationId(solutions[0].combination.id)}
              >
                Usa consigliato
              </button>
            </div>
          )}
        </div>
        <div className={styles.result}>
          <h4>
            {preview
              ? "Soluzione selezionata"
              : "Nessuna soluzione compatibile"}
          </h4>
          {existing && (
            <p className={styles.installed}>
              Sistema installato: {existing.manufacturer} ·{" "}
              {installed?.outdoorModel ?? existing.productId}
            </p>
          )}
          {preview?.assignments.map((a) => {
            const series = splitUnitPresentation(a.indoor);
            return (
              <div className={styles.product} key={a.roomId}>
                {series && (
                  <Image
                    src={series.productPhoto.localPath}
                    alt={series.productPhoto.caption}
                    width={420}
                    height={210}
                    unoptimized
                  />
                )}
                <div>
                  <h4>{series?.title ?? a.indoor.family}</h4>
                  <p>{a.indoor.model}</p>
                  <p>{project.rooms.find((r) => r.id === a.roomId)?.name}</p>
                </div>
              </div>
            );
          })}
          {!preview && (
            <p role="status" className="nota">
              {lgMultiCapacityUnavailable
                ? "LG pubblica la combinazione multisplit 5+9, ma non la capacità simultanea per ogni stanza: il dimensionamento automatico resta disabilitato."
                : "COMPATIBILITÀ NON VERIFICABILE oppure capacità/dimensioni insufficienti: nessuna combinazione automatica disponibile per questa selezione."}{" "}
              Non vengono create unità con dati stimati.
            </p>
          )}
          {manufacturer === "LG" && catalog && (
            <details>
              <summary>
                Catalogo LG a parete ·{" "}
                {
                  catalog.indoorUnits.filter(
                    (unit) =>
                      unit.manufacturer === "LG" && unit.mounting === "wall",
                  ).length
                }{" "}
                modelli
              </summary>
              <p className="nota">
                Modelli e dimensioni pubblicati da LG. Il dimensionamento
                automatico usa solo combinazioni con capacità simultanee
                verificate.
              </p>
              <ul>
                {catalog.indoorUnits
                  .filter(
                    (unit) =>
                      unit.manufacturer === "LG" && unit.mounting === "wall",
                  )
                  .map((unit) => (
                    <li key={unit.id}>
                      {unit.family} · {unit.model} ·{" "}
                      {unit.nominalCoolingW
                        ? `${formatNumber(unit.nominalCoolingW / 1000)} kW`
                        : "capacità n.d."}{" "}
                      freddo · {unit.widthMm}×{unit.heightMm}×{unit.depthMm} mm
                    </li>
                  ))}
              </ul>
            </details>
          )}
          {preview && (
            <>
              {!preview.meetsLoad && (
                <p role="status" className="nota">
                  Modello scelto manualmente: la potenza pubblicata non copre il
                  carico massimo delle stanze. La configurazione sarà segnata
                  come non verificata.
                </p>
              )}
              <p className="nota">
                {preview.combination.mode === "mono"
                  ? "Monosplit"
                  : "Multisplit"}{" "}
                · Unità esterna {preview.combination.outdoorModel}
              </p>
              <dl className={styles.facts}>
                <div>
                  <dt>
                    {preview.combination.maxCoolingCapacityW
                      ? "Raffrescamento massimo"
                      : "Raffrescamento nominale"}
                  </dt>
                  <dd>
                    {formatNumber(
                      (preview.combination.maxCoolingCapacityW ??
                        preview.combination.coolingCapacityW) / 1000,
                    )}{" "}
                    kW
                    {preview.combination.maxCoolingCapacityW &&
                      ` · nominale ${formatNumber(preview.combination.coolingCapacityW / 1000)} kW`}
                  </dd>
                </div>
                <div>
                  <dt>
                    {preview.combination.maxHeatingCapacityW
                      ? "Riscaldamento massimo"
                      : "Riscaldamento nominale"}
                  </dt>
                  <dd>
                    {(preview.combination.maxHeatingCapacityW ??
                      preview.combination.heatingCapacityW) == null
                      ? "Non disponibile"
                      : `${formatNumber((preview.combination.maxHeatingCapacityW ?? preview.combination.heatingCapacityW!) / 1000)} kW`}
                    {preview.combination.maxHeatingCapacityW &&
                      ` · nominale ${formatNumber(preview.combination.heatingCapacityW! / 1000)} kW`}
                  </dd>
                </div>
                <div>
                  <dt>Capacità in BTU/h</dt>
                  <dd>
                    {formatNumber(
                      wattsToBtuh(
                        preview.combination.maxCoolingCapacityW ??
                          preview.combination.coolingCapacityW,
                      ),
                      0,
                    )}
                  </dd>
                </div>
              </dl>
            </>
          )}
          <button
            className="bottone chiara"
            disabled={!preview}
            ref={saveButtonRef}
            hidden={!!saveButtonRef}
            style={saveButtonRef ? { display: "none" } : undefined}
            onClick={() =>
              (onPlace ?? commit)((p) =>
                applySplitSystem(
                  p,
                  roomIds,
                  manufacturer,
                  existing?.id ?? null,
                  preview?.combination.id,
                  installationId,
                ),
              )
            }
          >
            {existing
              ? "Aggiorna climatizzazione"
              : "Configura climatizzazione"}
          </button>
          {existing && !saveButtonRef && (
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
          {preview && (
            <details>
              <summary>Caratteristiche della serie</summary>
              {preview.assignments.map((a) => {
                const series = splitUnitPresentation(a.indoor);
                return (
                  series && (
                    <div key={a.roomId}>
                      <p className="nota">
                        <strong>{series.title}</strong> ·{" "}
                        {series.features.join(" · ")}
                      </p>
                      {series.gains.map((g) => (
                        <p className="nota" key={g}>
                          {g}
                        </p>
                      ))}
                      <p className="nota">
                        {a.indoor.region ?? "Disponibilità secondo la fonte"}
                      </p>
                    </div>
                  )
                );
              })}
            </details>
          )}
          {combo && (
            <details>
              <summary>Dettagli tecnici e calcolo</summary>
              <p className="nota">
                Un ambiente usa un monosplit; più ambienti richiedono una
                combinazione multisplit approvata. Posa iniziale e quota sono
                schematiche; verificare le distanze nel manuale del modello.
              </p>
              <p className="nota">
                Richiesta stanza = volume netto ×{" "}
                {formatNumber(project.projectSettings.coefficientWm3)} W/m³. Le
                capacità per stanza sono quelle simultanee della combinazione
                ufficiale: ogni unità deve soddisfare separatamente
                raffrescamento e riscaldamento.
              </p>
              {combo.indoorProductIds.map((id, i) => {
                const unit = catalog?.indoorUnits.find((u) => u.id === id),
                  assignment = preview?.assignments.find(
                    (item) => item.slotIndex === i,
                  ),
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
                    {formatNumber(
                      (assignment?.coolingW ?? combo.indoorCoolingW[i] ?? 0) /
                        1000,
                    )}{" "}
                    kW freddo ·{" "}
                    {formatNumber(
                      (assignment?.heatingW ?? combo.indoorHeatingW[i] ?? 0) /
                        1000,
                    )}{" "}
                    kW caldo
                    <br />
                    {unit &&
                      `${unit.widthMm}×${unit.heightMm}×${unit.depthMm} mm`}
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
        </div>
      </div>
    </section>
  );
}
