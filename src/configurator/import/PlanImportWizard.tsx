"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Point } from "@/schemas/project";
import type { ImportedPlan, ParsedPlan } from "@/services/import/plan-types";
import { readPlanFile } from "@/services/import/plan-file";
import { analyzePlan } from "@/services/import/analyze";
import {
  calibrationScale,
  preparePlanImport,
} from "@/domain/geometry/import-plan";
import { numberFromForm } from "@/utils/format";
import styles from "./PlanImportWizard.module.css";

export function PlanImportWizard({
  onClose,
  onImport,
  initialFile,
}: {
  onClose: () => void;
  onImport: (plan: ImportedPlan) => void;
  initialFile?: File;
}) {
  const dialogRef = useRef<HTMLDivElement>(null),
    previewRef = useRef<SVGSVGElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    generation = useRef(0);
  const [view, setView] = useState<{ zoom: number; center: Point | null }>({
    zoom: 1,
    center: null,
  });
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    center: Point;
    inverse: DOMMatrix;
  } | null>(null);
  const dragged = useRef(false);
  const [file, setFile] = useState<File | null>(initialFile ?? null),
    [plan, setPlan] = useState<ParsedPlan | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [layers, setLayers] = useState<string[]>([]),
    [excluded, setExcluded] = useState<string[]>([]),
    [scale, setScale] = useState(0),
    [verified, setVerified] = useState(false),
    [axisConfirmed, setAxisConfirmed] = useState(false),
    [convert, setConvert] = useState(false);
  const [points, setPoints] = useState<Point[]>([]),
    [distance, setDistance] = useState(""),
    [mode, setMode] = useState<"calibrate" | "select">("calibrate"),
    [thickness, setThickness] = useState("0,10"),
    [originX, setOriginX] = useState("0"),
    [originY, setOriginY] = useState("0");
  async function load(next: File, page = 1) {
    const token = ++generation.current;
    setFile(next);
    setLoading(true);
    setError("");
    setPlan(null);
    setVerified(false);
    setAxisConfirmed(false);
    setPoints([]);
    setView({ zoom: 1, center: null });
    drag.current = null;
    setExcluded([]);
    setLayers([]);
    try {
      const parsed = await readPlanFile(next, page);
      if (token !== generation.current) return;
      try {
        parsed.analysis = await analyzePlan(parsed);
        const recognized = parsed.analysis.walls;
        parsed.segments = [...parsed.segments, ...recognized];
        if (recognized.length)
          parsed.layers.push({
            name: "Muri riconosciuti",
            count: recognized.length,
            visible: true,
          });
        setLayers(recognized.length ? ["Muri riconosciuti"] : []);
        setExcluded(
          recognized.filter((w) => w.confidence < 0.9).map((w) => w.id),
        );
        setAxisConfirmed(recognized.some((w) => w.confidence >= 0.9));
      } catch (error) {
        parsed.warnings.push(
          error instanceof Error
            ? error.message
            : "Analisi fallita; usare la selezione manuale.",
        );
      }
      parsed.originalDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("Conservazione file originale non riuscita."));
        reader.readAsDataURL(
          new File([next], next.name, {
            type: next.type || "application/octet-stream",
          }),
        );
      });
      if (token !== generation.current) return;
      setPlan(parsed);
      setScale(parsed.suggestedMetersPerUnit ?? 0);
      setConvert(
        !!parsed.analysis?.walls.length ||
          parsed.sourceType === "dxf" ||
          parsed.sourceType === "dwg",
      );
    } catch (e) {
      if (token === generation.current)
        setError(e instanceof Error ? e.message : "Planimetria non leggibile.");
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    const counter = generation;
    const element = dialogRef.current,
      previous = document.activeElement as HTMLElement | null;
    element?.focus();
    function keys(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && element) {
        const all = Array.from(
          element.querySelectorAll<HTMLElement>(
            'button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]',
          ),
        );
        const first = all[0],
          last = all.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === element)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    element?.addEventListener("keydown", keys);
    return () => {
      counter.current++;
      element?.removeEventListener("keydown", keys);
      previous?.focus();
    };
    // The owning screen may update while autosaving; keep this dialog session intact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const timer = initialFile
      ? setTimeout(() => {
          void load(initialFile);
        }, 0)
      : null;
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const segments = plan?.segments ?? [],
    allPoints = segments.flatMap((s) => [s.start, s.end]);
  let minX = 0,
    minY = 0,
    maxX = plan?.background?.widthPx ?? 100,
    maxY = plan?.background?.heightPx ?? 100;
  if (!plan?.background && allPoints.length) {
    minX = Math.min(...allPoints.map((p) => p.x));
    minY = Math.min(...allPoints.map((p) => p.y));
    maxX = Math.max(...allPoints.map((p) => p.x));
    maxY = Math.max(...allPoints.map((p) => p.y));
  }
  const width = Math.max(1, maxX - minX),
    height = Math.max(1, maxY - minY),
    margin = Math.max(width, height) * 0.025,
    marker = Math.max(width, height) * 0.007;
  const fitCenterX = minX + width / 2,
    fitCenterY = minY + height / 2,
    center = view.center ?? { x: fitCenterX, y: fitCenterY },
    viewWidth = (width + margin * 2) / view.zoom,
    viewHeight = (height + margin * 2) / view.zoom,
    pointMarker = marker / view.zoom;
  const zoomAt = useCallback(
    (factor: number, anchor?: Point) => {
      setView((old) => {
        const zoom = Math.max(1, Math.min(16, old.zoom * factor));
        if (zoom === old.zoom) return old;
        const previous = old.center ?? { x: fitCenterX, y: fitCenterY };
        const target = anchor ?? previous;
        return {
          zoom,
          center: {
            x: target.x + (previous.x - target.x) * (old.zoom / zoom),
            y: target.y + (previous.y - target.y) * (old.zoom / zoom),
          },
        };
      });
    },
    [fitCenterX, fitCenterY],
  );
  useEffect(() => {
    const svg = previewRef.current;
    if (!svg) return;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      const matrix = svg!.getScreenCTM();
      if (!matrix || event.deltaY === 0) return;
      const anchor = new DOMPoint(event.clientX, event.clientY).matrixTransform(
        matrix.inverse(),
      );
      zoomAt(event.deltaY < 0 ? 1.25 : 0.8, anchor);
    }
    svg.addEventListener("wheel", wheel, { passive: false });
    return () => svg.removeEventListener("wheel", wheel);
  }, [plan, zoomAt]);
  const selected = segments.filter(
    (s) => layers.includes(s.layer) && !excluded.includes(s.id),
  );
  function pick(e: React.MouseEvent<SVGSVGElement>) {
    if (!plan || mode !== "calibrate") return;
    const svg = e.currentTarget,
      matrix = svg.getScreenCTM();
    if (!matrix) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      matrix.inverse(),
    );
    let point: Point = { x: p.x, y: p.y };
    let nearest = pointMarker * 2;
    for (const v of allPoints) {
      const d = Math.hypot(v.x - p.x, v.y - p.y);
      if (d < nearest) {
        nearest = d;
        point = v;
      }
    }
    setPoints((old) => (old.length >= 2 ? [point] : [...old, point]));
    setVerified(false);
  }
  function calibrate() {
    try {
      if (points.length !== 2)
        throw new Error("Selezionare due punti nell'anteprima.");
      setScale(
        calibrationScale(points[0], points[1], numberFromForm(distance)),
      );
      setVerified(true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Misura non valida.");
    }
  }
  function finish() {
    if (!plan) return;
    try {
      const result = preparePlanImport(plan, {
        selectedLayers: layers,
        excludedIds: excluded,
        metersPerUnit: scale,
        thicknessM: numberFromForm(thickness),
        convertGeometry: convert,
        origin: { x: numberFromForm(originX), y: numberFromForm(originY) },
      });
      onImport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Importazione non riuscita.");
    }
  }
  return (
    <div className="sfondo-dialogo">
      <div
        ref={dialogRef}
        className={`dialogo ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-import-title"
        tabIndex={-1}
      >
        <div className="testata-dialogo">
          <div>
            <h2 id="plan-import-title">Importa planimetria</h2>
            <p className={styles.notice}>
              1 File · 2 Geometrie · 3 Scala · 4 Verifica manuale
            </p>
          </div>
          <button
            className="bottone tenue"
            onClick={onClose}
            aria-label="Chiudi importazione"
          >
            ×
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".dxf,.dwg,.pdf,.png,.jpg,.jpeg,.webp"
          aria-label="File planimetria"
          onChange={(e) => {
            const next = e.target.files?.[0];
            if (next) void load(next);
            e.target.value = "";
          }}
        />
        <p className={styles.notice}>
          Analisi locale con affidabilità visibile. DXF, DWG, PDF, PNG/JPEG.
          Verificare sempre scala, muri e aperture. Limite 32 MB; immagini 15
          MB.
        </p>
        {loading && <p role="status">Lettura e anteprima della planimetria…</p>}
        {error && (
          <p className="messaggio errore" role="alert">
            {error}
          </p>
        )}
        {plan && (
          <>
            {plan.analysis && (
              <section aria-label="Analisi automatica planimetria">
                <strong>
                  {plan.analysis.walls.length} muri candidati ·{" "}
                  {
                    plan.analysis.walls.filter((w) => w.confidence >= 0.9)
                      .length
                  }{" "}
                  ad alta affidabilità · {plan.analysis.openings.length}{" "}
                  aperture possibili
                </strong>
                {plan.analysis.notes.map((note) => (
                  <p className={styles.notice} key={note}>
                    {note}
                  </p>
                ))}
                {plan.analysis.walls.some((w) => w.confidence < 0.9) && (
                  <label className={styles.row}>
                    <input
                      type="checkbox"
                      checked={plan.analysis.walls
                        .filter(
                          (w) => w.confidence >= 0.5 && w.confidence < 0.9,
                        )
                        .every((w) => !excluded.includes(w.id))}
                      onChange={(e) => {
                        const ids = plan
                          .analysis!.walls.filter(
                            (w) => w.confidence >= 0.5 && w.confidence < 0.9,
                          )
                          .map((w) => w.id);
                        setExcluded((old) =>
                          e.target.checked
                            ? old.filter((id) => !ids.includes(id))
                            : [...new Set([...old, ...ids])],
                        );
                        setAxisConfirmed(e.target.checked);
                      }}
                    />
                    Ho verificato e confermo i muri proposti in arancione
                    (affidabilità media)
                  </label>
                )}
              </section>
            )}
            <div className={styles.body}>
              <div>
                <p className={styles.filename}>
                  <strong>{plan.filename}</strong>
                  {plan.pageCount &&
                    ` · pagina ${plan.pageNumber}/${plan.pageCount}`}
                </p>
                {(plan.pageCount ?? 0) > 1 && (
                  <label>
                    Pagina PDF{" "}
                    <select
                      aria-label="Pagina PDF"
                      value={plan.pageNumber}
                      onChange={(e) => {
                        if (file) void load(file, Number(e.target.value));
                      }}
                    >
                      {Array.from(
                        { length: Math.min(plan.pageCount ?? 0, 1000) },
                        (_, i) => (
                          <option key={i} value={i + 1}>
                            {i + 1}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                )}
                <div className={styles.row}>
                  <button
                    className={`bottone piccolo ${mode === "calibrate" ? "" : "tenue"}`}
                    onClick={() => setMode("calibrate")}
                  >
                    Seleziona punti scala
                  </button>
                  {segments.length > 0 && (
                    <button
                      className={`bottone piccolo ${mode === "select" ? "" : "tenue"}`}
                      onClick={() => setMode("select")}
                    >
                      Escludi / includi tracciati
                    </button>
                  )}
                </div>
                <div className={`${styles.row} ${styles.zoomControls}`}>
                  <button
                    className="bottone piccolo tenue"
                    aria-label="Riduci zoom anteprima"
                    disabled={view.zoom <= 1}
                    onClick={() => zoomAt(0.8)}
                  >
                    −
                  </button>
                  <output aria-label="Zoom anteprima">
                    {Math.round(view.zoom * 100)}%
                  </output>
                  <button
                    className="bottone piccolo tenue"
                    aria-label="Aumenta zoom anteprima"
                    disabled={view.zoom >= 16}
                    onClick={() => zoomAt(1.25)}
                  >
                    +
                  </button>
                  <button
                    className="bottone piccolo tenue"
                    onClick={() => setView({ zoom: 1, center: null })}
                  >
                    Adatta anteprima
                  </button>
                </div>
                <svg
                  ref={previewRef}
                  className={styles.preview}
                  viewBox={`${center.x - viewWidth / 2} ${center.y - viewHeight / 2} ${viewWidth} ${viewHeight}`}
                  onClick={pick}
                  onClickCapture={(event) => {
                    if (dragged.current) {
                      event.preventDefault();
                      event.stopPropagation();
                      dragged.current = false;
                    }
                  }}
                  onPointerDown={(event) => {
                    if (event.button !== 0 && event.button !== 1) return;
                    if (drag.current) return;
                    if (event.button === 1) event.preventDefault();
                    const matrix = event.currentTarget.getScreenCTM();
                    if (!matrix) return;
                    dragged.current = false;
                    drag.current = {
                      pointerId: event.pointerId,
                      x: event.clientX,
                      y: event.clientY,
                      center,
                      inverse: matrix.inverse(),
                    };
                  }}
                  onPointerMove={(event) => {
                    const start = drag.current;
                    if (!start || start.pointerId !== event.pointerId) return;
                    if (!dragged.current) {
                      if (
                        Math.hypot(
                          event.clientX - start.x,
                          event.clientY - start.y,
                        ) < 4
                      )
                        return;
                      dragged.current = true;
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }
                    const from = new DOMPoint(start.x, start.y).matrixTransform(
                      start.inverse,
                    );
                    const to = new DOMPoint(
                      event.clientX,
                      event.clientY,
                    ).matrixTransform(start.inverse);
                    setView((old) => ({
                      ...old,
                      center: {
                        x: start.center.x + from.x - to.x,
                        y: start.center.y + from.y - to.y,
                      },
                    }));
                  }}
                  onPointerUp={(event) => {
                    if (drag.current?.pointerId !== event.pointerId) return;
                    drag.current = null;
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                    dragged.current = false;
                  }}
                  onLostPointerCapture={() => {
                    drag.current = null;
                  }}
                  onPointerLeave={() => {
                    if (!dragged.current) drag.current = null;
                  }}
                  aria-label="Anteprima planimetria; seleziona due punti per la scala"
                  role="img"
                  style={{
                    cursor: mode === "calibrate" ? "crosshair" : "pointer",
                  }}
                >
                  {plan.background && (
                    <image
                      href={plan.background.dataUrl}
                      x={0}
                      y={0}
                      width={plan.background.widthPx}
                      height={plan.background.heightPx}
                      opacity={0.75}
                    />
                  )}
                  {!plan.background &&
                    plan.annotations.map((a, i) => (
                      <text
                        key={`annotation-${i}`}
                        x={a.position.x}
                        y={a.position.y}
                        fontSize={marker * 2.5}
                        fill="#425a69"
                      >
                        {a.text}
                      </text>
                    ))}
                  {segments.map((s) => (
                    <line
                      key={s.id}
                      x1={s.start.x}
                      y1={s.start.y}
                      x2={s.end.x}
                      y2={s.end.y}
                      stroke={
                        layers.includes(s.layer) && !excluded.includes(s.id)
                          ? (plan.analysis?.walls.find((w) => w.id === s.id)
                              ?.confidence ?? 1) < 0.9
                            ? "#ba7417"
                            : "#08778c"
                          : "#a6afb4"
                      }
                      strokeWidth={mode === "select" ? 5 : 2}
                      vectorEffect="non-scaling-stroke"
                      opacity={excluded.includes(s.id) ? 0.3 : 0.9}
                      onClick={(e) => {
                        if (mode !== "select") return;
                        e.stopPropagation();
                        if (!layers.includes(s.layer))
                          setLayers((old) => [...old, s.layer]);
                        setExcluded((old) =>
                          old.includes(s.id)
                            ? old.filter((id) => id !== s.id)
                            : [...old, s.id],
                        );
                      }}
                    >
                      <title>
                        {s.layer} · {s.kind} · {s.id}
                        {plan.analysis?.walls.find((w) => w.id === s.id) &&
                          ` · Affidabilità euristica ${Math.round(plan.analysis.walls.find((w) => w.id === s.id)!.confidence * 100)}%: ${plan.analysis.walls.find((w) => w.id === s.id)!.reason}`}
                      </title>
                    </line>
                  ))}
                  {points.length === 2 && (
                    <line
                      x1={points[0].x}
                      y1={points[0].y}
                      x2={points[1].x}
                      y2={points[1].y}
                      stroke="#d0641a"
                      strokeWidth={3}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  {points.map((p, i) => (
                    <g key={i}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={pointMarker}
                        fill="#d0641a"
                      />
                      <text
                        x={p.x + pointMarker * 1.5}
                        y={p.y - pointMarker}
                        fontSize={pointMarker * 3}
                        fill="#743509"
                      >
                        {i + 1}
                      </text>
                    </g>
                  ))}
                </svg>
                <p className={styles.notice}>
                  Rotella o +/− per zoomare. Trascina per spostare la vista.{" "}
                  {mode === "calibrate"
                    ? "Clicca due estremi di una misura nota. I punti si agganciano alle estremità dei tracciati CAD."
                    : "Clicca un tracciato per escluderlo o includerlo. Le linee grigie non selezionate restano solo riferimento."}
                </p>
                <div className={styles.warnings}>
                  {plan.warnings.map((w) => (
                    <p key={w}>⚠ {w}</p>
                  ))}
                </div>
              </div>
              <div className={styles.sidebar}>
                {segments.length > 0 && (
                  <>
                    <label className={styles.row}>
                      <input
                        type="checkbox"
                        checked={convert}
                        onChange={(e) => setConvert(e.target.checked)}
                      />{" "}
                      Converti geometrie selezionate in muri
                    </label>
                    <div className={styles.layers}>
                      {plan.layers.map((layer) => (
                        <label key={layer.name} className={styles.row}>
                          <input
                            type="checkbox"
                            checked={layers.includes(layer.name)}
                            onChange={(e) =>
                              setLayers((old) =>
                                e.target.checked
                                  ? [...old, layer.name]
                                  : old.filter((n) => n !== layer.name),
                              )
                            }
                          />
                          <span>
                            {layer.name} ({layer.count})
                            {!layer.visible ? " · nascosto nel CAD" : ""}
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className={styles.notice}>
                      {selected.length} segmenti selezionati. Testi/quote:{" "}
                      {plan.annotations.length}, conservati come riferimento
                      nell&apos;anteprima.
                    </p>
                  </>
                )}
                <label>
                  Unità dichiarate: <strong>{plan.unitLabel}</strong>
                  <select
                    aria-label="Unità geometria"
                    value={
                      [0.001, 0.01, 0.1, 1, 0.0254, 0.3048].includes(scale)
                        ? scale
                        : "custom"
                    }
                    onChange={(e) => {
                      setScale(Number(e.target.value));
                      setVerified(false);
                    }}
                  >
                    <option value="custom" disabled>
                      Scala da riferimento / non determinata
                    </option>
                    <option value={0.001}>Millimetri</option>
                    <option value={0.01}>Centimetri</option>
                    <option value={0.1}>Decimetri</option>
                    <option value={1}>Metri</option>
                    <option value={0.0254}>Pollici</option>
                    <option value={0.3048}>Piedi</option>
                  </select>
                </label>
                <label>
                  Distanza reale tra punti (m)
                  <input
                    aria-label="Distanza reale di riferimento"
                    inputMode="decimal"
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                  />
                </label>
                <button
                  className="bottone piccolo tenue"
                  disabled={points.length !== 2}
                  onClick={calibrate}
                >
                  Calibra scala
                </button>
                <p className={styles.notice}>
                  {scale > 0
                    ? `1 unità anteprima = ${scale.toPrecision(6)} m`
                    : "Scala non ancora determinata."}
                  {points.length === 2 &&
                    scale > 0 &&
                    ` Distanza: ${(Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) * scale).toFixed(3)} m.`}
                </p>
                <label className={styles.row}>
                  <input
                    type="checkbox"
                    checked={verified}
                    disabled={scale <= 0}
                    onChange={(e) => setVerified(e.target.checked)}
                  />{" "}
                  Ho verificato la scala su una misura reale
                </label>
                {convert && (
                  <>
                    <label>
                      Spessore muri (m)
                      <input
                        aria-label="Spessore muri importati"
                        inputMode="decimal"
                        value={thickness}
                        onChange={(e) => setThickness(e.target.value)}
                      />
                    </label>
                    <label className={styles.row}>
                      <input
                        type="checkbox"
                        checked={axisConfirmed}
                        onChange={(e) => setAxisConfirmed(e.target.checked)}
                      />{" "}
                      Le geometrie selezionate rappresentano assi muro;
                      eliminerò quote, bordi e doppie linee
                    </label>
                  </>
                )}
                <div className={styles.fields}>
                  <label>
                    Origine X (m)
                    <input
                      aria-label="Origine importazione X"
                      inputMode="decimal"
                      value={originX}
                      onChange={(e) => setOriginX(e.target.value)}
                    />
                  </label>
                  <label>
                    Origine Y (m)
                    <input
                      aria-label="Origine importazione Y"
                      inputMode="decimal"
                      value={originY}
                      onChange={(e) => setOriginY(e.target.value)}
                    />
                  </label>
                </div>
                <p className={styles.notice}>
                  La conversione aggiunge muri al piano attivo. I contorni
                  chiusi generano stanze; correggere spessori, giunzioni e nomi
                  nell&apos;editor. Le linee doppie CAD non vengono interpretate
                  automaticamente come un unico muro.
                </p>
              </div>
            </div>
            <div className={styles.actions}>
              <button className="bottone tenue" onClick={onClose}>
                Annulla
              </button>
              <button
                className="bottone"
                disabled={
                  !verified ||
                  (convert && (!axisConfirmed || selected.length === 0)) ||
                  (!plan.background && !convert)
                }
                onClick={finish}
              >
                {convert
                  ? "Importa muri selezionati"
                  : "Importa sfondo calibrato"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
