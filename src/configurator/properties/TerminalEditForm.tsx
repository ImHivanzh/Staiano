"use client";
import { useState } from "react";
import type { Project } from "@/schemas/project";
import { airTerminalCatalogAtVersion } from "@/domain/catalogs/air-terminals";
import { editOperatorTerminal } from "@/domain/air-terminals/operator";
import { movePlacedDevice } from "@/domain/geometry/move-device";
import {
  positionAlongRoomWall,
  roomWallSpan,
} from "@/domain/geometry/placement";
import {
  duplicateSelection,
  removeSelection,
} from "@/domain/geometry/selection";
import { numberFromForm } from "@/utils/format";
import { useProjectStore } from "@/stores/project-store";
import { LinearSummary } from "@/configurator/systems/OperatorTerminalControls";

export function TerminalEditForm({
  project,
  id,
}: {
  project: Project;
  id: string;
}) {
  const t = project.airTerminals.find((t) => t.id === id)!;
  const { commit, snap } = useProjectStore();
  const [variantId, setVariantId] = useState(t.productId);
  const [opIndex, setOpIndex] = useState(t.operatingPointIndex ?? 0);
  const families =
    airTerminalCatalogAtVersion(t.catalogVersion)?.families.filter(
      (f) =>
        f.use.includes(t.use) &&
        f.mountings?.includes(t.mounting as "wall" | "ceiling"),
    ) ?? [];
  const family = families.find((f) =>
    f.variants.some((v) => v.id === variantId),
  );
  const variant = family?.variants.find((v) => v.id === variantId);
  const room = project.rooms.find((r) => r.id === t.roomId)!;
  return (
    <section aria-label="Modifica bocchetta">
      {t.systemId && <LinearSummary project={project} systemId={t.systemId} />}
      <p className="nota">
        Decisione:{" "}
        {t.decisionOrigin === "manual"
          ? "modificata manualmente"
          : t.decisionOrigin === "confirmed"
            ? "confermata dall’operatore"
            : "calcolata"}
        . La metratura richiesta resta distinta dai pezzi installati.
      </p>
      <form
        key={`${id}-${t.widthMm}-${t.heightMm}-${t.position.x}-${t.position.y}-${t.rotation}-${t.elevationM}`}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          commit((p) => {
            let target = {
              x: numberFromForm(data.get("x")),
              y: numberFromForm(data.get("y")),
            };
            const wallId = String(data.get("wall") ?? "");
            let rotation =
              (numberFromForm(data.get("rotation")) * Math.PI) / 180;
            let current = p;
            if (wallId && wallId !== t.wallId) {
              const wall = p.walls.find((w) => w.id === wallId)!;
              const span = roomWallSpan(room, wall);
              if (!span) throw new Error("Parete non associata alla stanza.");
              target = positionAlongRoomWall(
                room,
                wall,
                numberFromForm(data.get("offset")),
                (t.depthMm ?? 0) / 1000,
              );
              rotation = Math.atan2(
                span.end.y - span.start.y,
                span.end.x - span.start.x,
              );
              current = {
                ...p,
                airTerminals: p.airTerminals.map((v) =>
                  v.id === id ? { ...v, wallId } : v,
                ),
              };
            } else if (target.x !== t.position.x || target.y !== t.position.y) {
              current = movePlacedDevice(p, id, target, snap);
              if (Math.abs(rotation - t.rotation) < 1e-5)
                rotation = current.airTerminals.find(
                  (v) => v.id === id,
                )!.rotation;
              target = current.airTerminals.find((v) => v.id === id)!.position;
            }
            return editOperatorTerminal(current, id, {
              position: target,
              rotation,
              widthMm: family?.isLinearPerMeter
                ? numberFromForm(data.get("length"))
                : (variant?.faceWidthMm ?? t.widthMm),
              heightMm: family?.isLinearPerMeter
                ? numberFromForm(data.get("height"))
                : (variant?.faceHeightMm ?? t.heightMm),
              elevationM: numberFromForm(data.get("elevation")),
              familyCode: family?.familyCode,
              variantId,
              operatingPointIndex: opIndex,
              style: String(data.get("style")),
              color: String(data.get("color")),
              finish: String(data.get("finish")),
              productCode: String(data.get("productCode")),
              plenumId: String(data.get("plenum")) || null,
            });
          });
        }}
      >
        <fieldset disabled={t.locked}>
          <label className="campo">
            <span>Modello bocchetta</span>
            <select
              aria-label="Modello bocchetta"
              value={variantId}
              onChange={(e) => {
                setVariantId(e.target.value);
                setOpIndex(0);
              }}
            >
              {families.map((f) => (
                <optgroup key={f.familyCode} label={f.familyCode}>
                  {f.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Punto di funzionamento</span>
            <select
              value={opIndex}
              onChange={(e) => setOpIndex(Number(e.target.value))}
            >
              {variant?.operatingPoints.map((op, i) => (
                <option
                  key={i}
                  value={i}
                  disabled={
                    op.quality !== "valid" || (!!op.use && op.use !== t.use)
                  }
                >
                  {op.airflowPerMeterM3h
                    ? `${op.airflowPerMeterM3h} m³/h/m`
                    : `${op.airflowM3h} m³/h`}{" "}
                  · {op.noiseLabel} dB(A)
                </option>
              ))}
            </select>
          </label>
          {[
            [
              "length",
              "Lunghezza bocchetta (mm)",
              family?.isLinearPerMeter
                ? t.widthMm
                : (variant?.faceWidthMm ?? t.widthMm),
            ],
            [
              "height",
              "Altezza faccia bocchetta (mm)",
              family?.isLinearPerMeter
                ? t.heightMm
                : (variant?.faceHeightMm ?? t.heightMm),
            ],
            ["elevation", "Quota bocchetta (m)", t.elevationM],
            [
              "rotation",
              "Orientamento bocchetta (gradi)",
              (t.rotation * 180) / Math.PI,
            ],
            ["x", "Posizione X bocchetta (m)", t.position.x],
            ["y", "Posizione Y bocchetta (m)", t.position.y],
          ].map(([name, label, value]) => (
            <label className="campo" key={String(name)}>
              <span>{label}</span>
              <input
                name={String(name)}
                aria-label={String(label)}
                type="number"
                step="any"
                required
                defaultValue={value ?? ""}
                disabled={
                  (name === "length" || name === "height") &&
                  !family?.isLinearPerMeter
                }
              />
            </label>
          ))}
          {t.mounting === "wall" && (
            <>
              <label className="campo">
                <span>Parete bocchetta</span>
                <select name="wall" defaultValue={t.wallId ?? ""}>
                  <option value="">Mantieni posa libera</option>
                  {project.walls
                    .filter((w) => room.wallIds.includes(w.id))
                    .map((w, i) => (
                      <option key={w.id} value={w.id}>
                        Parete {i + 1}
                      </option>
                    ))}
                </select>
              </label>
              <label className="campo">
                <span>Distanza centro dall’inizio parete (m)</span>
                <input
                  name="offset"
                  type="number"
                  step="0.01"
                  defaultValue={1}
                />
              </label>
            </>
          )}
          {(["style", "color", "finish", "productCode"] as const).map(
            (name) => (
              <label className="campo" key={name}>
                <span>
                  {
                    {
                      style: "Stile",
                      color: "Colore",
                      finish: "Finitura",
                      productCode: "Codice prodotto dichiarato",
                    }[name]
                  }
                </span>
                <input name={name} maxLength={100} defaultValue={t[name]} />
              </label>
            ),
          )}
          <label className="campo">
            <span>Plenum associato</span>
            <select name="plenum" defaultValue={t.plenumId ?? ""}>
              <option value="">Non collegata</option>
              {project.plenums
                .filter(
                  (pl) =>
                    pl.systemId === t.systemId && pl.floorId === t.floorId,
                )
                .map((pl) => (
                  <option value={pl.id} key={pl.id}>
                    {pl.model || pl.id}
                  </option>
                ))}
            </select>
          </label>
          <p className="nota">
            Colore, finitura e modifiche dimensionali sono scelte di progetto;
            disponibilità e prestazioni acustiche vanno verificate sulla fonte.
          </p>
          <button className="bottone chiara" type="submit">
            Applica modifiche bocchetta
          </button>
        </fieldset>
      </form>
      <button
        className="bottone piccolo tenue"
        onClick={() =>
          commit((p) => duplicateSelection(p, [{ kind: "device", id }]))
        }
      >
        Duplica bocchetta
      </button>
      <button
        className="bottone piccolo tenue"
        disabled={t.locked}
        onClick={() =>
          commit((p) => removeSelection(p, [{ kind: "device", id }]))
        }
      >
        Elimina bocchetta
      </button>
    </section>
  );
}
