"use client";
import { useState } from "react";
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
  return (
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
      <form
        key={`${editing ?? "new"}-${type}-${wall.id}`}
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
        <label className="campo">
          <span>Distanza dall’inizio parete (m)</span>
          <input
            aria-label="Distanza apertura"
            name="offset"
            type="number"
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
        </label>
        <label className="campo">
          <span>Larghezza foro (m)</span>
          <input
            aria-label="Larghezza apertura"
            name="width"
            type="number"
            min=".1"
            step=".01"
            required
            defaultValue={opening?.widthM ?? (type === "door" ? 0.9 : 1.2)}
          />
        </label>
        <label className="campo">
          <span>Altezza foro (m)</span>
          <input
            aria-label="Altezza apertura"
            name="height"
            type="number"
            min=".1"
            step=".01"
            required
            defaultValue={opening?.heightM ?? (type === "door" ? 2.1 : 1.2)}
          />
        </label>
        {type === "window" && (
          <label className="campo">
            <span>Quota davanzale (m)</span>
            <input
              aria-label="Quota davanzale"
              name="sill"
              type="number"
              min="0"
              step=".01"
              required
              defaultValue={opening?.sillHeightM ?? 0.9}
            />
          </label>
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
  );
}
