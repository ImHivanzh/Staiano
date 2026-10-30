"use client";
import { LengthInput } from "../LengthInput";
import { useState } from "react";
import { OpeningSketch } from "./SectionSketches";
import type { Project, Wall } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { saveOpening } from "@/domain/geometry/openings";
import { distance } from "@/domain/geometry/primitives";
import { formatNumber, numberFromForm } from "@/utils/format";

export function WallOpenings({
  project,
  wall,
}: {
  project: Project;
  wall: Wall;
}) {
  const [type, setType] = useState<"door" | "window">("door");
  const [editing, setEditing] = useState<string>();
  const { commit } = useProjectStore();
  const opening = project.openings.find((o) => o.id === editing);
  const items = project.openings.filter((o) => o.wallId === wall.id);
  const wallLengthM = distance(wall.start, wall.end);
  const wallHeightM =
    wall.height ??
    Math.max(
      2.7,
      ...project.rooms
        .filter((room) => room.floorId === wall.floorId)
        .map((room) => room.heightM),
    );
  const formKey = `${editing ?? "new"}-${type}-${wall.id}`;
  // Anteprima dello schema mentre si digita, prima di salvare l'apertura.
  const [draft, setDraft] = useState<{ key: string; values: number[] }>();
  const initial = [
    opening?.offsetM ??
      Math.max(0, (wallLengthM - (type === "door" ? 0.9 : 1.2)) / 2),
    opening?.widthM ?? (type === "door" ? 0.9 : 1.2),
    opening?.heightM ?? (type === "door" ? 2.1 : 1.2),
    opening?.sillHeightM ?? (type === "door" ? 0 : 0.9),
  ];
  const [offsetM, widthM, heightM, sillM] =
    draft?.key === formKey ? draft.values : initial;
  return (
    <>
      <button
        type="button"
        className="bottone piccolo"
        disabled={items.some((item) => item.type === "door")}
        onClick={() =>
          commit((p) =>
            saveOpening(p, wall.id, {
              type: "door",
              offsetM: (distance(wall.start, wall.end) - 0.9) / 2,
              widthM: 0.9,
              heightM: 2.1,
              sillHeightM: 0,
            }),
          )
        }
      >
        Aggiungi porta centrata
      </button>
      <details>
        <summary>Porte e finestre</summary>
        <p className="nota">
          Quote reali del foro. Distanza dall’inizio dell’asse parete; davanzale
          dal pavimento. Infissi e finiture nel 3D sono illustrativi.
        </p>
        {items.map((item) => (
          <div key={item.id} className="apertura-parete">
            <strong>
              {item.type === "door" ? "Porta" : "Finestra"} ·{" "}
              {formatNumber(item.widthM)} × {formatNumber(item.heightM)} m
            </strong>
            <span className="nota">
              A {formatNumber(item.offsetM)} m
              {item.type === "window"
                ? ` · davanzale ${item.sillHeightM === null ? "da verificare" : `${formatNumber(item.sillHeightM)} m`}`
                : ""}
            </span>
            <button
              type="button"
              className="bottone piccolo"
              onClick={() => {
                setEditing(item.id);
                setType(item.type);
              }}
            >
              Modifica apertura
            </button>
            <button
              type="button"
              className="bottone piccolo tenue"
              onClick={() => {
                commit((p) => ({
                  ...p,
                  openings: p.openings.filter((o) => o.id !== item.id),
                }));
                if (editing === item.id) setEditing(undefined);
              }}
            >
              Rimuovi apertura
            </button>
          </div>
        ))}
        <OpeningSketch
          type={type}
          wallLengthM={wallLengthM}
          wallHeightM={wallHeightM}
          offsetM={offsetM}
          widthM={widthM}
          heightM={heightM}
          sillM={sillM}
        />
        <form
          key={formKey}
          onChange={(event) => {
            const form = new FormData(event.currentTarget);
            const read = (name: string, fallback: number) => {
              const value = numberFromForm(form.get(name));
              return form.get(name) && Number.isFinite(value)
                ? value
                : fallback;
            };
            setDraft({
              key: formKey,
              values: [
                read("offset", offsetM),
                read("width", widthM),
                read("height", heightM),
                read("sill", sillM),
              ],
            });
          }}
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            commit((p) =>
              saveOpening(
                p,
                wall.id,
                {
                  type,
                  offsetM: numberFromForm(form.get("offset")),
                  widthM: numberFromForm(form.get("width")),
                  heightM: numberFromForm(form.get("height")),
                  sillHeightM:
                    type === "window" ? numberFromForm(form.get("sill")) : 0,
                },
                editing,
              ),
            );
          }}
        >
          <label className="campo">
            <span>Tipo apertura</span>
            <select
              aria-label="Tipo apertura"
              value={type}
              onChange={(e) => setType(e.target.value as "door" | "window")}
            >
              <option value="door">Porta</option>
              <option value="window">Finestra</option>
            </select>
          </label>
          <LengthInput
            label="Distanza dall’inizio parete"
            baseUnit="m"
            aria-label="Distanza apertura"
            name="offset"
            min="0"
            max={distance(wall.start, wall.end)}
            step=".01"
            required
            defaultValue={
              opening?.offsetM ??
              Math.max(
                0,
                (distance(wall.start, wall.end) -
                  (type === "door" ? 0.9 : 1.2)) /
                  2,
              ).toFixed(2)
            }
          />
          <LengthInput
            label="Larghezza foro"
            baseUnit="m"
            aria-label="Larghezza apertura"
            name="width"
            min=".1"
            step=".01"
            required
            defaultValue={opening?.widthM ?? (type === "door" ? 0.9 : 1.2)}
          />
          <LengthInput
            label="Altezza foro"
            baseUnit="m"
            aria-label="Altezza apertura"
            name="height"
            min=".1"
            step=".01"
            required
            defaultValue={opening?.heightM ?? (type === "door" ? 2.1 : 1.2)}
          />
          {type === "window" && (
            <LengthInput
              label="Quota davanzale"
              baseUnit="m"
              aria-label="Quota davanzale"
              name="sill"
              min="0"
              step=".01"
              required
              defaultValue={opening?.sillHeightM ?? 0.9}
            />
          )}
          <p className="nota">
            Misure iniziali suggerite: verifica prima di aggiungere.
          </p>
          <button className="bottone chiara" type="submit">
            {editing ? "Salva apertura" : "Aggiungi apertura"}
          </button>
          {editing && (
            <button
              className="bottone tenue"
              type="button"
              onClick={() => setEditing(undefined)}
            >
              Nuova apertura
            </button>
          )}
        </form>
      </details>
    </>
  );
}
