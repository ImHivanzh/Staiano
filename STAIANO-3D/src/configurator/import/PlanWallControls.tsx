import { useState } from "react";
import type { PlanSegment } from "@/services/import/plan-types";
import type { WallCandidate } from "@/domain/geometry/plan-analysis";
import styles from "./PlanImportWizard.module.css";

export function PlanWallControls({
  walls,
  visible,
  selected,
  scale,
  activeId,
  action,
  onAction,
  onSelect,
  onHover,
  showAlternatives,
  onAlternatives,
  wholeRun,
  onWholeRun,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onBox,
}: {
  walls: WallCandidate[];
  visible: PlanSegment[];
  selected: Set<string>;
  scale: number;
  activeId: string | null;
  action: "include" | "exclude";
  onAction: (action: "include" | "exclude") => void;
  onSelect: (ids: string[], include: boolean) => void;
  onHover: (id: string | null) => void;
  showAlternatives: boolean;
  onAlternatives: (show: boolean) => void;
  wholeRun: boolean;
  onWholeRun: (whole: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onBox: () => void;
}) {
  const [query, setQuery] = useState(""),
    [limit, setLimit] = useState(50);
  const visibleIds = new Set(visible.map((w) => w.id));
  const candidates = walls.filter((w) => visibleIds.has(w.id));
  const names = new Map(walls.map((w, i) => [w.id, `M${i + 1}`]));
  const filtered = candidates.filter((w) =>
    `${names.get(w.id)} ${w.reason}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const active = walls.find((w) => w.id === activeId);
  return (
    <section className={styles.wallControls} aria-label="Selezione muri">
      <h3>Controlla i muri</h3>
      <div
        className={styles.selectionTools}
        role="group"
        aria-label="Azione sui muri"
      >
        <button
          type="button"
          className={`bottone piccolo ${action === "include" ? "" : "tenue"}`}
          aria-pressed={action === "include"}
          onClick={() => onAction("include")}
        >
          Seleziona
        </button>
        <button
          type="button"
          className={`bottone piccolo ${action === "exclude" ? "" : "tenue"}`}
          aria-pressed={action === "exclude"}
          onClick={() => onAction("exclude")}
        >
          Escludi
        </button>
        <button type="button" className="bottone piccolo tenue" onClick={onBox}>
          Rettangolo
        </button>
        <button
          type="button"
          className="bottone piccolo tenue"
          disabled={!canUndo}
          onClick={onUndo}
        >
          Annulla selezione
        </button>
        <button
          type="button"
          className="bottone piccolo tenue"
          disabled={!canRedo}
          onClick={onRedo}
        >
          Ripristina selezione
        </button>
      </div>
      <label className={styles.row}>
        <input
          type="checkbox"
          checked={wholeRun}
          onChange={(e) => onWholeRun(e.target.checked)}
        />
        Seleziona l’intera fila di muri
      </label>
      <label className={styles.row}>
        <input
          type="checkbox"
          checked={showAlternatives}
          onChange={(e) => onAlternatives(e.target.checked)}
        />
        Mostra alternative da verificare (
        {walls.filter((w) => w.layer === "Contorni da verificare").length})
      </label>
      <p className={styles.notice}>
        Linea continua: selezionata. Tratteggio: proposta. Le alternative hanno
        tratteggio corto. Mostrare una linea non la include nell’importazione.
      </p>
      <div className={styles.selectionTools}>
        <button
          type="button"
          className="bottone piccolo tenue"
          disabled={!candidates.length}
          onClick={() =>
            onSelect(
              candidates
                .filter((w) => w.layer !== "Contorni da verificare")
                .map((w) => w.id),
              true,
            )
          }
        >
          Seleziona proposte visibili
        </button>
        <button
          type="button"
          className="bottone piccolo tenue"
          disabled={!candidates.some((w) => selected.has(w.id))}
          onClick={() =>
            onSelect(
              candidates.map((w) => w.id),
              false,
            )
          }
        >
          Escludi muri visibili
        </button>
      </div>
      <p className={styles.inspector} aria-live="polite">
        {active ? (
          <>
            <strong>{names.get(active.id)}</strong>
            {scale > 0
              ? ` · ${(Math.hypot(active.end.x - active.start.x, active.end.y - active.start.y) * scale).toFixed(2)} m${active.thicknessUnits === null ? " · spessore da verificare" : ` · ${(active.thicknessUnits * scale * 100).toFixed(1)} cm`}`
              : " · calibra per leggere le misure"}
            <br />
            {active.reason}
          </>
        ) : (
          "Passa su un muro o scegli dall’elenco per leggere misure e motivo della proposta."
        )}
      </p>
      <label className={styles.search}>
        Cerca muro
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(50);
          }}
          placeholder="Codice o motivo della proposta"
        />
      </label>
      <div className={styles.wallList} aria-label="Elenco muri proposti">
        {filtered.slice(0, limit).map((w) => (
          <label
            key={w.id}
            className={styles.wallRow}
            onMouseEnter={() => onHover(w.id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(w.id)}
          >
            <input
              type="checkbox"
              checked={selected.has(w.id)}
              onChange={(e) => onSelect([w.id], e.target.checked)}
            />
            <span>
              <strong>{names.get(w.id)}</strong> ·{" "}
              {selected.has(w.id)
                ? "Selezionato"
                : w.layer === "Contorni da verificare"
                  ? "Alternativa da verificare"
                  : "Proposto"}
              {scale > 0 &&
                ` · ${(Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) * scale).toFixed(2)} m`}
            </span>
          </label>
        ))}
        {!filtered.length && (
          <p className={styles.notice}>
            Nessun muro corrispondente nella vista corrente.
          </p>
        )}
      </div>
      {filtered.length > limit && (
        <button
          type="button"
          className="bottone piccolo tenue"
          onClick={() => setLimit((n) => n + 50)}
        >
          Mostra altri muri ({filtered.length - limit})
        </button>
      )}
    </section>
  );
}
