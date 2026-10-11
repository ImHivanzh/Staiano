"use client";
import { LengthInput } from "../LengthInput";
import Image from "next/image";
import type { Project } from "@/schemas/project";
import {
  heatPumpCatalogAtVersion,
  heatPumpProductAtVersion,
} from "@/domain/catalogs/heat-pumps";
import { fanCoilProductAtVersion } from "@/domain/catalogs/fan-coils";
import {
  applyHydronicSystem,
  moveHydronicOutdoorUnit,
} from "@/domain/hydronic/apply";
import { validateHydronicSystem } from "@/domain/hydronic/validation";
import { hydronicOutwardRotation } from "@/domain/hydronic/placement";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber, numberFromForm } from "@/utils/format";

export function HydronicProperties({
  project,
  id,
}: {
  project: Project;
  id: string;
}) {
  const { commit } = useProjectStore();
  const system = project.hydronicSystems?.find((s) => s.outdoorUnit.id === id);
  if (!system) return null;
  const unit = system.outdoorUnit,
    model = heatPumpProductAtVersion(system.productId, system.catalogVersion),
    point = model?.operatingPoints[system.operatingPointIndex],
    catalog = heatPumpCatalogAtVersion(system.catalogVersion),
    report = validateHydronicSystem(project, system);
  const rooms = project.rooms.filter((r) => r.floorId === unit.floorId);
  return (
    <div className="corpo-proprieta">
      <h3>{model?.model ?? system.productId}</h3>
      <p>{model?.manufacturer} · unità esterna</p>
      {model && (
        <Image
          unoptimized
          src={model.productPhoto.localPath}
          alt={model.productPhoto.caption}
          width={400}
          height={170}
          style={{ width: "100%", height: 150, objectFit: "contain" }}
        />
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          commit((p) =>
            applyHydronicSystem(p, {
              systemId: system.id,
              name: String(d.get("name")),
              productId: String(d.get("product")),
              operatingPointIndex: numberFromForm(d.get("point")),
              roomIds: d.getAll("room").map(String),
              fanCoilIds: d.getAll("coil").map(String),
            }),
          );
        }}
      >
        <fieldset disabled={unit.locked || !model}>
          <legend>Impianto idronico</legend>
          <label className="campo">
            <span>Nome impianto</span>
            <input
              name="name"
              defaultValue={system.name}
              maxLength={100}
              required
            />
          </label>
          <label className="campo">
            <span>Pompa di calore</span>
            <select name="product" defaultValue={system.productId}>
              {catalog?.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.manufacturer} · {p.model}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Condizioni pompa</span>
            <select name="point" defaultValue={system.operatingPointIndex}>
              {model?.operatingPoints.map((p, i) => (
                <option key={i} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <p className="nota">
            Cambiando modello, le condizioni selezionate devono essere
            disponibili nel nuovo catalogo.
          </p>
          {rooms.map((r) => (
            <label className="campo" key={r.id}>
              <span>
                <input
                  type="checkbox"
                  name="room"
                  value={r.id}
                  defaultChecked={system.roomIds.includes(r.id)}
                />{" "}
                {r.name}
              </span>
            </label>
          ))}
          <p>Ventilconvettori associati</p>
          {(project.fanCoils ?? [])
            .filter((u) => u.floorId === unit.floorId)
            .map((u) => {
              const occupied = project.hydronicSystems?.some(
                (s) => s.id !== system.id && s.fanCoilIds.includes(u.id),
              );
              return (
                <label className="campo" key={u.id}>
                  <span>
                    <input
                      type="checkbox"
                      name="coil"
                      value={u.id}
                      disabled={occupied}
                      defaultChecked={system.fanCoilIds.includes(u.id)}
                    />{" "}
                    {fanCoilProductAtVersion(u.productId, u.catalogVersion)
                      ?.model ?? u.productId}{" "}
                    · {rooms.find((r) => r.id === u.roomId)?.name}
                    {occupied ? " · altro impianto" : ""}
                  </span>
                </label>
              );
            })}
          <button type="submit" className="bottone chiara">
            Aggiorna impianto
          </button>
        </fieldset>
      </form>
      <details className="azione-inspector" open>
        <summary>Posizione all’esterno delle mura</summary>
        <button
          type="button"
          className="bottone chiara"
          disabled={unit.locked}
          onClick={() =>
            commit((p) =>
              moveHydronicOutdoorUnit(p, id, {
                rotation: hydronicOutwardRotation(p, unit),
              }),
            )
          }
        >
          Rivolgi ventilatore all’esterno
        </button>
        <button
          type="button"
          className="bottone chiara"
          disabled={unit.locked}
          onClick={() =>
            commit((p) =>
              moveHydronicOutdoorUnit(p, id, {
                rotation: unit.rotation + Math.PI,
              }),
            )
          }
        >
          Inverti verso (180°)
        </button>
        <p className="nota">
          Ingombro L×H×P {unit.widthMm}×{unit.heightMm}×{unit.depthMm} mm.
          L’intero ingombro deve restare fuori da ambienti e muri. Distanze di
          manutenzione e proprietà da verificare sul posto.
        </p>
        <form
          key={`${unit.position.x}-${unit.position.y}-${unit.rotation}-${unit.elevationM}`}
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            commit((p) =>
              moveHydronicOutdoorUnit(p, id, {
                position: {
                  x: numberFromForm(d.get("x")),
                  y: numberFromForm(d.get("y")),
                },
                rotation: (numberFromForm(d.get("rotation")) * Math.PI) / 180,
                elevationM:
                  numberFromForm(d.get("elevation")) + unit.heightMm / 2000,
              }),
            );
          }}
        >
          <fieldset disabled={unit.locked}>
            <legend>Posa macchina esterna</legend>
            <LengthInput
              label="Posizione X"
              baseUnit="m"
              name="x"
              step="0.01"
              defaultValue={unit.position.x}
              required
            />
            <LengthInput
              label="Posizione Y"
              baseUnit="m"
              name="y"
              step="0.01"
              defaultValue={unit.position.y}
              required
            />
            <label className="campo">
              <span>Rotazione (°)</span>
              <input
                type="number"
                name="rotation"
                step="1"
                defaultValue={(unit.rotation * 180) / Math.PI}
                required
              />
            </label>
            <LengthInput
              label="Quota base dal pavimento"
              baseUnit="m"
              name="elevation"
              step="0.01"
              min="0"
              defaultValue={unit.elevationM - unit.heightMm / 2000}
              required
            />
            <button className="bottone chiara" type="submit">
              Aggiorna posizione esterna
            </button>
          </fieldset>
        </form>
      </details>
      <p className="formula">
        Stima ambienti {formatNumber(report.designLoadW / 1000)} kW
        <br />
        Pompa {formatNumber(report.heatingW / 1000)} kW caldo ·{" "}
        {formatNumber(report.coolingW / 1000)} kW freddo
        <br />
        Terminali con temperatura compatibile{" "}
        {formatNumber(report.fanCoilHeatingW / 1000)} /{" "}
        {formatNumber(report.fanCoilCoolingW / 1000)} kW
      </p>
      <ul>
        {report.warnings.map((w) => (
          <li className="nota" key={w}>
            {w}
          </li>
        ))}
      </ul>
      <details>
        <summary>Condizioni originali e fonte</summary>
        <p className="nota">
          {point?.heatingConditions}
          <br />
          {point?.coolingConditions}
          <br />
          COP {point?.cop ?? "n.d."} · EER {point?.eer ?? "n.d."}
          <br />
          {model?.dimensionNote}
          <br />
          Catalogo {system.catalogVersion}
        </p>
        {model && (
          <a
            href={model.sourceMetadata.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Scheda ufficiale {model.manufacturer} · pagina{" "}
            {model.sourceMetadata.page}
          </a>
        )}
      </details>
    </div>
  );
}
