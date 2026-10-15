"use client";
import { LengthInput } from "../LengthInput";
import type { Project } from "@/schemas/project";
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
              elevationM: numberFromForm(data.get("elevation")),
              productCode: String(data.get("productCode")),
              plenumId: String(data.get("plenum")) || null,
            });
          });
        }}
      >
        <fieldset disabled={t.locked}>
          {[
            ["elevation", "Quota bocchetta (m)", t.elevationM],
            [
              "rotation",
              "Orientamento bocchetta (gradi)",
              (t.rotation * 180) / Math.PI,
            ],
            ["x", "Posizione X bocchetta (m)", t.position.x],
            ["y", "Posizione Y bocchetta (m)", t.position.y],
          ].map(([name, label, value]) =>
            /\((m|mm|cm)\)$/.test(String(label)) ? (
              <LengthInput
                key={String(name)}
                label={String(label).replace(/ \((m|mm|cm)\)$/, "")}
                baseUnit={
                  String(label).endsWith("(mm)")
                    ? "mm"
                    : String(label).endsWith("(cm)")
                      ? "cm"
                      : "m"
                }
                name={String(name)}
                aria-label={String(label)}
                step="any"
                required
                defaultValue={value ?? ""}
              />
            ) : (
              <label className="campo" key={String(name)}>
                <span>{label}</span>
                <input
                  type="number"
                  name={String(name)}
                  aria-label={String(label)}
                  step="any"
                  required
                  defaultValue={value ?? ""}
                />
              </label>
            ),
          )}
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
              <LengthInput
                label="Distanza centro dall’inizio parete"
                baseUnit="m"
                name="offset"
                step="0.01"
                defaultValue={1}
              />
            </>
          )}
          <label className="campo">
            <span>Codice prodotto dichiarato</span>
            <input
              name="productCode"
              maxLength={100}
              defaultValue={t.productCode}
            />
          </label>
          <label className="campo">
            <span>Plenum associato</span>
            <select name="plenum" defaultValue={t.plenumId ?? ""}>
              <option value="">Non collegata</option>
              {project.plenums
                .filter(
                  (pl) =>
                    t.use === "supply" &&
                    pl.systemId === t.systemId &&
                    pl.floorId === t.floorId,
                )
                .map((pl) => (
                  <option value={pl.id} key={pl.id}>
                    {pl.model || pl.id}
                  </option>
                ))}
            </select>
          </label>
          <p className="nota">
            Modello, lunghezza, colore e finitura si configurano cliccando la
            bocchetta nella pianta principale.
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
