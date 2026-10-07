"use client";
import { useState } from "react";
import Image from "next/image";
import type { Project } from "@/schemas/project";
import {
  heatPumpCatalog,
  heatPumpProductAtVersion,
} from "@/domain/catalogs/heat-pumps";
import {
  applyHydronicSystem,
  removeHydronicSystem,
} from "@/domain/hydronic/apply";
import { initialHydronicOutdoorPose } from "@/domain/hydronic/placement";
import { validateHydronicSystem } from "@/domain/hydronic/validation";
import { fanCoilProductAtVersion } from "@/domain/catalogs/fan-coils";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber } from "@/utils/format";

export function HydronicPanel({
  project,
  floorId,
}: {
  project: Project;
  floorId: string;
}) {
  const { commit, select } = useProjectStore();
  const rooms = project.rooms.filter((r) => r.floorId === floorId);
  const [manufacturer, setManufacturer] = useState("Chaffoteaux");
  const [productId, setProductId] = useState(heatPumpCatalog.products[0].id);
  const [operatingPointIndex, setOperatingPointIndex] = useState(1);
  const [selectedRooms, setSelectedRooms] = useState<string[]>(
    rooms.map((r) => r.id),
  );
  const [selectedCoils, setSelectedCoils] = useState<string[]>([]);
  const products = heatPumpCatalog.products.filter(
    (p) => p.manufacturer === manufacturer,
  );
  const product = products.find((p) => p.id === productId) ?? products[0];
  const point =
    product.operatingPoints[operatingPointIndex] ?? product.operatingPoints[0];
  const roomIds = selectedRooms.filter((id) => rooms.some((r) => r.id === id));
  const coils = (project.fanCoils ?? []).filter((u) =>
    roomIds.includes(u.roomId),
  );
  const claimed = new Set(
    project.hydronicSystems?.flatMap((s) => s.fanCoilIds),
  );
  const fanCoilIds = selectedCoils.filter(
    (id) => coils.some((u) => u.id === id) && !claimed.has(id),
  );
  const load = rooms
    .filter((r) => roomIds.includes(r.id))
    .reduce((n, r) => n + r.designLoadW, 0);
  const pose = initialHydronicOutdoorPose(project, floorId, product);
  return (
    <section className="pannello-split">
      <h3>Impianto idronico · pompa di calore</h3>
      <p className="nota">
        Una macchina esterna per impianto, collegata ai ventilconvettori
        selezionati. Puoi creare più impianti indipendenti.
      </p>
      <label className="campo">
        <span>Marca pompa di calore</span>
        <select
          value={manufacturer}
          onChange={(e) => {
            setManufacturer(e.target.value);
            setProductId(
              heatPumpCatalog.products.find(
                (p) => p.manufacturer === e.target.value,
              )!.id,
            );
            setOperatingPointIndex(1);
          }}
        >
          {[
            ...new Set(heatPumpCatalog.products.map((p) => p.manufacturer)),
          ].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <label className="campo">
        <span>Serie e modello pompa</span>
        <select
          value={product.id}
          onChange={(e) => {
            setProductId(e.target.value);
            setOperatingPointIndex(1);
          }}
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.family} · {p.model}
            </option>
          ))}
        </select>
      </label>
      <Image
        unoptimized
        src={product.productPhoto.localPath}
        alt={product.productPhoto.caption}
        width={420}
        height={200}
        sizes="320px"
        style={{ width: "100%", height: 180, objectFit: "contain" }}
      />
      <p className="nota">{product.features.join(" · ")}</p>
      <label className="campo">
        <span>Condizioni di funzionamento</span>
        <select
          value={operatingPointIndex}
          onChange={(e) => setOperatingPointIndex(Number(e.target.value))}
        >
          {product.operatingPoints.map((p, i) => (
            <option key={i} value={i}>
              {p.label} · {formatNumber(p.heatingW / 1000)} /{" "}
              {formatNumber(p.coolingW / 1000)} kW
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Ambienti serviti dalla pompa</legend>
        {rooms.map((r) => (
          <label className="campo" key={r.id}>
            <span>
              <input
                type="checkbox"
                checked={roomIds.includes(r.id)}
                onChange={(e) =>
                  setSelectedRooms(
                    e.target.checked
                      ? [...selectedRooms, r.id]
                      : selectedRooms.filter((id) => id !== r.id),
                  )
                }
              />{" "}
              {r.name} · {formatNumber(r.designLoadW / 1000)} kW
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Ventilconvettori collegati</legend>
        {!coils.length && (
          <p className="nota">
            Aggiungi i ventilconvettori negli ambienti prima di associarli.
          </p>
        )}
        {coils.map((u) => {
          const model = fanCoilProductAtVersion(u.productId, u.catalogVersion);
          return (
            <label className="campo" key={u.id}>
              <span>
                <input
                  type="checkbox"
                  disabled={claimed.has(u.id)}
                  checked={fanCoilIds.includes(u.id)}
                  onChange={(e) =>
                    setSelectedCoils(
                      e.target.checked
                        ? [...selectedCoils, u.id]
                        : selectedCoils.filter((id) => id !== u.id),
                    )
                  }
                />{" "}
                {model?.model ?? u.productId} ·{" "}
                {rooms.find((r) => r.id === u.roomId)?.name}
                {claimed.has(u.id) ? " · già collegato" : ""}
              </span>
            </label>
          );
        })}
      </fieldset>
      <p className="formula">
        Fabbisogno preliminare {formatNumber(load / 1000)} kW
        <br />
        Pompa: {formatNumber(point.heatingW / 1000)} kW caldo ·{" "}
        {formatNumber(point.coolingW / 1000)} kW freddo
        <br />
        {Math.min(point.heatingW, point.coolingW) < load
          ? "Potenza inferiore alla stima: scegliere una taglia superiore."
          : "Potenze nominali superiori alla stima alle condizioni selezionate."}
      </p>
      <p className="nota">
        {point.heatingConditions}
        <br />
        {point.coolingConditions}
        <br />
        Il confronto dei terminali richiede le stesse temperature dell’acqua.
        Portate, accumulo e perdite idrauliche da verificare.
      </p>
      <button
        type="button"
        className="bottone chiara"
        disabled={!pose || !roomIds.length}
        onClick={() =>
          commit((p) =>
            applyHydronicSystem(p, {
              productId: product.id,
              roomIds,
              fanCoilIds,
              operatingPointIndex,
            }),
          )
        }
      >
        Aggiungi pompa all’esterno
      </button>
      {!pose && (
        <p role="status" className="nota">
          Verifica scala e contorni degli ambienti per individuare una posizione
          esterna libera.
        </p>
      )}
      <details>
        <summary>Dati e posa documentati</summary>
        <p className="nota">
          {product.dimensionNote}
          <br />
          Foto di gamma. Il 3D usa l’ingombro originale, con dettagli
          illustrativi.
        </p>
        <a
          href={product.sourceMetadata.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Scheda ufficiale {product.manufacturer} · pagina{" "}
          {product.sourceMetadata.page}
        </a>
      </details>
      {(project.hydronicSystems ?? [])
        .filter((s) => s.outdoorUnit.floorId === floorId)
        .map((s) => {
          const model = heatPumpProductAtVersion(s.productId, s.catalogVersion),
            report = validateHydronicSystem(project, s);
          return (
            <div className="formula" key={s.id}>
              <strong>{s.name}</strong>
              <br />
              {model?.model ?? s.productId}
              <br />
              {s.roomIds.length} ambienti · {s.fanCoilIds.length}{" "}
              ventilconvettori
              <br />
              <span>
                {report.capacityCovered
                  ? "Pompa: potenze nominali coprono la stima."
                  : "Pompa: capacità da verificare."}
              </span>
              <br />
              <button
                type="button"
                className="bottone piccolo"
                onClick={() => select({ kind: "device", id: s.outdoorUnit.id })}
              >
                Posizione esterna e impianto
              </button>{" "}
              <button
                type="button"
                className="bottone piccolo pericolo"
                disabled={s.outdoorUnit.locked}
                onClick={() => commit((p) => removeHydronicSystem(p, s.id))}
              >
                Rimuovi impianto
              </button>
            </div>
          );
        })}
    </section>
  );
}
