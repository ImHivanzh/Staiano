"use client";
import { NotificationToast } from "../NotificationToast";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FullscreenDialog } from "../FullscreenDialog";
import type { Point } from "@/schemas/project";
import type {
  ImportedPlan,
  ParsedPlan,
  PlanSegment,
} from "@/services/import/plan-types";
import { readPlanFile } from "@/services/import/plan-file";
import { analyzePlan } from "@/services/import/analyze";
import {
  calibrationScale,
  preparePlanImport,
} from "@/domain/geometry/import-plan";
import { numberFromForm } from "@/utils/format";
import {
  candidateRun,
  conflictingCandidates,
  nearestPlanSegment,
} from "@/domain/geometry/plan-candidates";
import { PlanWallControls } from "./PlanWallControls";
import { PlanAiStatus } from "./PlanAiStatus";
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
  const previewRef = useRef<SVGSVGElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    generation = useRef(0);
  const analysisController = useRef<AbortController | null>(null);
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
  const [selectionAction, setSelectionAction] = useState<"include" | "exclude">(
    "include",
  );
  const [showAlternatives, setShowAlternatives] = useState(false),
    [wholeRun, setWholeRun] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [boxPoints, setBoxPoints] = useState<Point[]>([]);
  type SelectionSnapshot = { layers: string[]; excluded: string[] };
  const [past, setPast] = useState<SelectionSnapshot[]>([]),
    [future, setFuture] = useState<SelectionSnapshot[]>([]);
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
    [mode, setMode] = useState<"calibrate" | "select" | "area" | "box">(
      "calibrate",
    ),
    [thickness, setThickness] = useState("0,10"),
    [originX, setOriginX] = useState("0"),
    [originY, setOriginY] = useState("0");
  const [areaPoints, setAreaPoints] = useState<Point[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanSource, setScanSource] = useState("adf");
  const [scanDpi, setScanDpi] = useState(600);
  const scanInProgress = useRef(false);

  async function scan() {
    if (scanInProgress.current || loading) return;
    scanInProgress.current = true;
    const token = ++generation.current;
    setScanning(true);
    setError("");
    try {
      const response = await fetch("/api/import/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dpi: scanDpi, sorgente: scanSource }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.message || "Scansione non riuscita.");
      }
      const pdf = await response.blob();
      if (token !== generation.current) return;
      await load(
        new File([pdf], "Planimetria-scansionata.pdf", {
          type: "application/pdf",
        }),
      );
    } catch (error) {
      if (token === generation.current)
        setError(
          error instanceof Error ? error.message : "Scansione non riuscita.",
        );
    } finally {
      scanInProgress.current = false;
      setScanning(false);
    }
  }
  function applyAnalysis(parsed: ParsedPlan) {
    const recognized = parsed.analysis?.walls ?? [];
    parsed.segments = [
      ...parsed.segments.filter(
        (s) =>
          s.layer !== "Muri riconosciuti" &&
          s.layer !== "Contorni da verificare",
      ),
      ...recognized,
    ];
    parsed.layers = parsed.layers.filter(
      (l) =>
        l.name !== "Muri riconosciuti" && l.name !== "Contorni da verificare",
    );
    for (const name of ["Muri riconosciuti", "Contorni da verificare"]) {
      const count = recognized.filter((w) => w.layer === name).length;
      if (count) parsed.layers.push({ name, count, visible: true });
    }
    setLayers(
      recognized.some((w) => w.layer === "Muri riconosciuti")
        ? ["Muri riconosciuti"]
        : recognized.length
          ? ["Contorni da verificare"]
          : [],
    );
    setExcluded(
      recognized
        .filter(
          (w) => w.confidence < 0.9 || w.layer === "Contorni da verificare",
        )
        .map((w) => w.id),
    );
    setAxisConfirmed(
      recognized.some(
        (w) => w.confidence >= 0.9 && w.layer !== "Contorni da verificare",
      ),
    );
    setPast([]);
    setFuture([]);
    setShowAlternatives(false);
    setHoveredId(null);
    setBoxPoints([]);
  }
  async function load(next: File, page = 1) {
    analysisController.current?.abort();
    const controller = new AbortController();
    analysisController.current = controller;
    const token = ++generation.current;
    setFile(next);
    setLoading(true);
    setError("");
    setPlan(null);
    setVerified(false);
    setAxisConfirmed(false);
    setPoints([]);
    setAreaPoints([]);
    setMode("calibrate");
    setView({ zoom: 1, center: null });
    drag.current = null;
    setExcluded([]);
    setLayers([]);
    try {
      const parsed = await readPlanFile(next, page);
      if (token !== generation.current) return;
      try {
        parsed.analysis = await analyzePlan(
          parsed,
          undefined,
          controller.signal,
        );
        applyAnalysis(parsed);
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
  async function recognizeArea(reset = false) {
    if (!plan || (!reset && areaPoints.length !== 2)) return;
    analysisController.current?.abort();
    const controller = new AbortController();
    analysisController.current = controller;
    const token = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const next = {
        ...plan,
        analysisMetersPerUnit: verified && scale > 0 ? scale : undefined,
        segments: plan.segments.filter(
          (s) =>
            s.layer !== "Muri riconosciuti" &&
            s.layer !== "Contorni da verificare",
        ),
      };
      next.analysis = await analyzePlan(
        next,
        reset ? undefined : { start: areaPoints[0], end: areaPoints[1] },
        controller.signal,
      );
      if (token !== generation.current) return;
      applyAnalysis(next);
      setPlan(next);
      setConvert(!!next.analysis.walls.length);
      setMode("select");
      if (reset) {
        setAreaPoints([]);
        setView({ zoom: 1, center: null });
      } else {
        const [a, b] = areaPoints;
        setView({
          zoom: Math.max(
            1,
            Math.min(
              16,
              0.9 *
                Math.min(
                  width / Math.abs(b.x - a.x),
                  height / Math.abs(b.y - a.y),
                ),
            ),
          ),
          center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        });
      }
    } catch (e) {
      if (token === generation.current)
        setError(
          e instanceof Error ? e.message : "Riconoscimento non riuscito.",
        );
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    const counter = generation;
    const controller = analysisController;
    return () => {
      counter.current++;
      controller.current?.abort();
    };
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
  const candidateLookup = useMemo(
    () => new Map(plan?.analysis?.walls.map((w) => [w.id, w]) ?? []),
    [plan?.analysis],
  );
  const drawnSegments = useMemo(() => {
    const activeLayers = new Set(layers),
      omitted = new Set(excluded);
    const included = (segment: PlanSegment) =>
      activeLayers.has(segment.layer) && !omitted.has(segment.id);
    // I tracciati inclusi restano cliccabili sopra gli assi alternativi.
    return (plan?.segments ?? [])
      .filter(
        (s) =>
          s.layer !== "Contorni da verificare" ||
          showAlternatives ||
          included(s),
      )
      .toSorted((a, b) => Number(included(a)) - Number(included(b)));
  }, [plan?.segments, layers, excluded, showAlternatives]);
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
  const preparedImport = useMemo(() => {
    if (!plan || scale <= 0) return null;
    try {
      return preparePlanImport(plan, {
        selectedLayers: layers,
        excludedIds: excluded,
        metersPerUnit: scale,
        thicknessM: numberFromForm(thickness),
        convertGeometry: convert,
        origin: { x: numberFromForm(originX), y: numberFromForm(originY) },
      });
    } catch {
      return null;
    }
  }, [plan, scale, layers, excluded, thickness, convert, originX, originY]);
  const visibleSegments = drawnSegments.filter(
    (s) =>
      (s.layer === "Muri riconosciuti" ||
        s.layer === "Contorni da verificare" ||
        layers.includes(s.layer)) &&
      Math.max(s.start.x, s.end.x) >= center.x - viewWidth / 2 &&
      Math.min(s.start.x, s.end.x) <= center.x + viewWidth / 2 &&
      Math.max(s.start.y, s.end.y) >= center.y - viewHeight / 2 &&
      Math.min(s.start.y, s.end.y) <= center.y + viewHeight / 2,
  );
  const selectableSegments =
    selectionAction === "exclude"
      ? visibleSegments.filter(
          (s) => layers.includes(s.layer) && !excluded.includes(s.id),
        )
      : visibleSegments;
  function changeSelection(ids: string[], include: boolean) {
    const targets = segments.filter((s) => ids.includes(s.id));
    if (!targets.length) return;
    const nextExcluded = new Set(excluded),
      nextLayers = new Set(layers);
    for (const s of targets) {
      if (include) {
        nextLayers.add(s.layer);
        nextExcluded.delete(s.id);
        const candidate = plan?.analysis?.walls.find((w) => w.id === s.id);
        if (candidate)
          for (const other of plan!.analysis!.walls)
            if (other.id !== s.id && conflictingCandidates(candidate, other))
              nextExcluded.add(other.id);
      } else nextExcluded.add(s.id);
    }
    if (
      nextLayers.size === layers.length &&
      layers.every((l) => nextLayers.has(l)) &&
      nextExcluded.size === excluded.length &&
      excluded.every((id) => nextExcluded.has(id))
    )
      return;
    setPast((old) => [
      ...old.slice(-49),
      { layers: [...layers], excluded: [...excluded] },
    ]);
    setFuture([]);
    setLayers([...nextLayers]);
    setExcluded([...nextExcluded]);
  }
  function selectionHistory(redo = false) {
    const list = redo ? future : past,
      next = list.at(-1);
    if (!next) return;
    const current = { layers: [...layers], excluded: [...excluded] };
    if (redo) {
      setFuture(list.slice(0, -1));
      setPast((old) => [...old, current]);
    } else {
      setPast(list.slice(0, -1));
      setFuture((old) => [...old, current]);
    }
    setLayers(next.layers);
    setExcluded(next.excluded);
  }
  function chooseSegment(id: string) {
    const segment = segments.find((s) => s.id === id);
    if (!segment) return;
    const ids = wholeRun
      ? candidateRun(
          visibleSegments.filter((s) => s.layer === segment.layer),
          id,
          scale > 0 ? 0.01 / scale : 2,
        )
      : [id];
    changeSelection(ids, selectionAction === "include");
    setHoveredId(id);
  }
  function pick(e: React.MouseEvent<SVGSVGElement>) {
    if (!plan || loading) return;
    const svg = e.currentTarget,
      matrix = svg.getScreenCTM();
    if (!matrix) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      matrix.inverse(),
    );
    let point: Point = { x: p.x, y: p.y };
    if (mode === "select") {
      const ctm = svg.getScreenCTM()!;
      const nearest = nearestPlanSegment(
        selectableSegments,
        point,
        18 / Math.hypot(ctm.a, ctm.b),
      );
      if (nearest) chooseSegment(nearest.id);
      return;
    }
    if (mode === "box") {
      if (boxPoints.length !== 1) {
        setBoxPoints([point]);
        return;
      }
      const a = boxPoints[0],
        left = Math.min(a.x, point.x),
        right = Math.max(a.x, point.x),
        top = Math.min(a.y, point.y),
        bottom = Math.max(a.y, point.y);
      changeSelection(
        visibleSegments
          .filter((s) =>
            [s.start, s.end].every(
              (p) => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom,
            ),
          )
          .map((s) => s.id),
        selectionAction === "include",
      );
      setBoxPoints([]);
      setMode("select");
      return;
    }
    if (mode === "area") {
      setAreaPoints((old) => (old.length >= 2 ? [point] : [...old, point]));
      return;
    }
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
    <FullscreenDialog
      open
      title="Importa planimetria"
      closeLabel="Chiudi importazione"
      onClose={onClose}
    >
      <div
        className={styles.dialog}
        onKeyDown={(event) => {
          if (
            event.target instanceof HTMLInputElement ||
            event.target instanceof HTMLTextAreaElement ||
            event.target instanceof HTMLSelectElement
          )
            return;
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "z"
          ) {
            event.preventDefault();
            selectionHistory(event.shiftKey);
          }
        }}
      >
        {!plan && (
          <p className={styles.notice}>
            1 File · 2 Geometrie · 3 Scala · 4 Verifica manuale
          </p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".dxf,.dwg,.pdf,.png,.jpg,.jpeg,.webp"
          aria-label="File planimetria"
          disabled={scanning || loading}
          onChange={(e) => {
            const next = e.target.files?.[0];
            if (next) void load(next);
            e.target.value = "";
          }}
        />
        <details open={!plan} className={styles.scanOptions}>
          <summary>Acquisisci dallo scanner Pantum</summary>
          <fieldset disabled={scanning || loading}>
            <legend>Acquisisci dalla Pantum BM4240ADW</legend>
            <div className={styles.fields}>
              <label>
                Sorgente scansione
                <select
                  value={scanSource}
                  onChange={(event) => setScanSource(event.target.value)}
                >
                  <option value="adf">Vassoio (ADF)</option>
                  <option value="piano">Piano scanner</option>
                </select>
              </label>
              <label>
                Risoluzione scansione
                <select
                  value={scanDpi}
                  onChange={(event) => setScanDpi(Number(event.target.value))}
                >
                  <option value={150}>150 DPI</option>
                  <option value={300}>300 DPI</option>
                  <option value={600}>600 DPI</option>
                </select>
              </label>
            </div>
            <p className={styles.notice}>
              Una pagina A4 in grigio. Inserisci il foglio nel vassoio o
              posizionalo sul piano scanner.
            </p>
            <button
              type="button"
              className="bottone tenue"
              onClick={() => void scan()}
            >
              {scanning ? "Scansione in corso…" : "Scansiona planimetria"}
            </button>
          </fieldset>
        </details>
        {scanning && (
          <p role="status">
            Acquisizione dalla Pantum in corso. Attendi il caricamento
            dell’anteprima.
          </p>
        )}
        {!plan && (
          <p className={styles.notice}>
            Analisi locale con affidabilità visibile. DXF, DWG, PDF, PNG/JPEG.
            Verificare sempre scala, muri e aperture. Limite 32 MB; immagini 15
            MB.
          </p>
        )}
        <PlanAiStatus notes={plan?.analysis?.notes} />
        {loading && (
          <p role="status">Lettura e ricostruzione 2D della planimetria…</p>
        )}
        {error && <NotificationToast message={error} />}
        {plan && (
          <>
            <div className={styles.body}>
              <div className={styles.planColumn}>
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
                  {plan.background && (
                    <button
                      className={`bottone piccolo ${mode === "area" ? "" : "tenue"}`}
                      onClick={() => {
                        setMode("area");
                        setAreaPoints([]);
                      }}
                    >
                      Seleziona area da riconoscere
                    </button>
                  )}
                </div>
                <p className={styles.notice}>
                  1. Delimita la pianta · 2. Calibra una misura · 3. Riconosci e
                  controlla i muri · 4. Importa
                </p>
                {plan.background && (
                  <button
                    type="button"
                    className="bottone piccolo"
                    disabled={loading || !verified}
                    onClick={() => void recognizeArea(areaPoints.length !== 2)}
                  >
                    Riconosci con la scala verificata
                  </button>
                )}
                {mode === "area" && (
                  <p className={styles.notice}>
                    Clicca due angoli opposti della sola pianta: escludi
                    cartiglio, prospetti e altre piante.
                  </p>
                )}
                {areaPoints.length === 2 && (
                  <div className={styles.row}>
                    <button
                      className="bottone piccolo"
                      disabled={loading}
                      onClick={() => void recognizeArea()}
                    >
                      Riconosci muri nell’area
                    </button>
                    <button
                      className="bottone piccolo tenue"
                      disabled={loading}
                      onClick={() => void recognizeArea(true)}
                    >
                      Analizza pagina intera
                    </button>
                  </div>
                )}
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
                    if (!start || start.pointerId !== event.pointerId) {
                      if (mode === "select") {
                        const matrix = event.currentTarget.getScreenCTM();
                        if (matrix) {
                          const p = new DOMPoint(
                            event.clientX,
                            event.clientY,
                          ).matrixTransform(matrix.inverse());
                          setHoveredId(
                            nearestPlanSegment(
                              selectableSegments,
                              p,
                              18 / Math.hypot(matrix.a, matrix.b),
                            )?.id ?? null,
                          );
                        }
                      }
                      return;
                    }
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
                    cursor: mode === "select" ? "pointer" : "crosshair",
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
                  {drawnSegments.map((s) => (
                    <line
                      key={s.id}
                      x1={s.start.x}
                      y1={s.start.y}
                      x2={s.end.x}
                      y2={s.end.y}
                      data-candidate-id={
                        candidateLookup.has(s.id) ? s.id : undefined
                      }
                      data-selected={
                        layers.includes(s.layer) && !excluded.includes(s.id)
                      }
                      stroke={
                        hoveredId === s.id
                          ? "#183249"
                          : layers.includes(s.layer) && !excluded.includes(s.id)
                            ? "#08778c"
                            : candidateLookup.has(s.id)
                              ? "#87601b"
                              : "#a6afb4"
                      }
                      strokeWidth={
                        candidateLookup.has(s.id)
                          ? mode === "select"
                            ? hoveredId === s.id
                              ? 5
                              : 3
                            : 2
                          : 1
                      }
                      vectorEffect="non-scaling-stroke"
                      strokeDasharray={
                        layers.includes(s.layer) && !excluded.includes(s.id)
                          ? undefined
                          : s.layer === "Contorni da verificare"
                            ? "2 5"
                            : "8 4"
                      }
                      pointerEvents="none"
                      opacity={
                        candidateLookup.has(s.id)
                          ? excluded.includes(s.id)
                            ? 0.75
                            : 0.9
                          : 0.15
                      }
                    >
                      <title>
                        {s.layer} · {s.kind} · {s.id}
                        {candidateLookup.has(s.id) &&
                          ` · Affidabilità euristica ${Math.round(candidateLookup.get(s.id)!.confidence * 100)}%: ${candidateLookup.get(s.id)!.reason}`}
                      </title>
                    </line>
                  ))}
                  {hoveredId &&
                    (() => {
                      const w = segments.find((s) => s.id === hoveredId);
                      return w ? (
                        <text
                          x={(w.start.x + w.end.x) / 2}
                          y={(w.start.y + w.end.y) / 2 - pointMarker * 2}
                          fontSize={pointMarker * 3}
                          fill="#183249"
                          pointerEvents="none"
                        >
                          M
                          {(plan.analysis?.walls.findIndex(
                            (s) => s.id === w.id,
                          ) ?? -1) + 1}
                        </text>
                      ) : null;
                    })()}
                  {boxPoints.length === 1 && (
                    <circle
                      cx={boxPoints[0].x}
                      cy={boxPoints[0].y}
                      r={pointMarker}
                      fill="#365aa8"
                      pointerEvents="none"
                    />
                  )}
                  {areaPoints.length === 2 && (
                    <rect
                      x={Math.min(areaPoints[0].x, areaPoints[1].x)}
                      y={Math.min(areaPoints[0].y, areaPoints[1].y)}
                      width={Math.abs(areaPoints[1].x - areaPoints[0].x)}
                      height={Math.abs(areaPoints[1].y - areaPoints[0].y)}
                      fill="#08778c18"
                      stroke="#08778c"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  )}
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
                    : mode === "area"
                      ? "Clicca due angoli opposti per delimitare l’area da riconoscere."
                      : mode === "box"
                        ? "Clicca due angoli opposti: saranno trattati i muri completamente contenuti nel rettangolo."
                        : `${selectionAction === "include" ? "Seleziona" : "Escludi"} il muro più vicino al clic. Trascina per spostare la vista.`}
                </p>
                <div className={styles.warnings}>
                  {plan.warnings.map((w) => (
                    <p key={w}>⚠ {w}</p>
                  ))}
                </div>
              </div>
              <div className={styles.sidebar}>
                {plan.analysis && (
                  <section
                    aria-label="Analisi automatica planimetria"
                    data-auto-count={
                      plan.analysis.walls.filter(
                        (w) =>
                          w.confidence >= 0.9 &&
                          w.layer !== "Contorni da verificare",
                      ).length
                    }
                  >
                    <strong>
                      {`${plan.analysis.walls.filter((w) => w.layer !== "Contorni da verificare").length} proposte principali · ${plan.analysis.walls.filter((w) => w.layer === "Contorni da verificare").length} alternative · ${preparedImport?.walls.length ?? selected.length} segmenti selezionati`}
                    </strong>
                    <p className={styles.notice}>
                      {plan.analysis.reconstructed &&
                        `${plan.analysis.roomsDetected} stanze ricostruite · `}
                      {plan.analysis.openings.length} aperture da verificare. I
                      segmenti non corrispondono necessariamente a pareti
                      distinte.
                    </p>
                    {plan.analysis.reconstructed && (
                      <p className={styles.notice}>
                        Conferma una misura reale, poi importa la planimetria
                        2D. Muri, stanze e aperture restano modificabili.
                      </p>
                    )}
                    <details className={styles.analysisOptions}>
                      <summary>
                        Dettagli del riconoscimento e selezione muri
                      </summary>
                      {plan.analysis.notes.map((note) => (
                        <p className={styles.notice} key={note}>
                          {note}
                        </p>
                      ))}
                    </details>
                  </section>
                )}
                {!!plan.analysis?.walls.length && (
                  <PlanWallControls
                    walls={plan.analysis.walls}
                    visible={visibleSegments}
                    selected={new Set(selected.map((s) => s.id))}
                    scale={scale}
                    activeId={hoveredId}
                    action={selectionAction}
                    onAction={(action) => {
                      setSelectionAction(action);
                      setMode("select");
                      setBoxPoints([]);
                    }}
                    onSelect={changeSelection}
                    onHover={setHoveredId}
                    showAlternatives={showAlternatives}
                    onAlternatives={setShowAlternatives}
                    wholeRun={wholeRun}
                    onWholeRun={setWholeRun}
                    onUndo={() => selectionHistory()}
                    onRedo={() => selectionHistory(true)}
                    canUndo={past.length > 0}
                    canRedo={future.length > 0}
                    onBox={() => {
                      setMode("box");
                      setBoxPoints([]);
                    }}
                  />
                )}
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
                            onChange={(e) => {
                              setPast((old) => [
                                ...old.slice(-49),
                                {
                                  layers: [...layers],
                                  excluded: [...excluded],
                                },
                              ]);
                              setFuture([]);
                              setLayers((old) =>
                                e.target.checked
                                  ? [...old, layer.name]
                                  : old.filter((n) => n !== layer.name),
                              );
                            }}
                          />
                          <span>
                            {layer.name} ({layer.count})
                            {!layer.visible ? " · nascosto nel CAD" : ""}
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className={styles.notice}>
                      {preparedImport?.walls.length ?? selected.length} segmenti
                      selezionati. Testi/quote: {plan.annotations.length},
                      conservati come riferimento nell&apos;anteprima.
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
                  La conversione aggiunge solo i muri selezionati al piano
                  attivo. I contorni chiusi generano stanze; correggere
                  spessori, giunzioni e nomi nell&apos;editor. Controlla gli
                  assi proposti dalle facce parallele e le aperture prima di
                  importare.
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
                  loading ||
                  (convert && (!axisConfirmed || selected.length === 0)) ||
                  (!plan.background && !convert)
                }
                onClick={finish}
              >
                {convert
                  ? plan.analysis?.reconstructed
                    ? "Importa planimetria 2D"
                    : `Importa muri selezionati (${preparedImport?.walls.length ?? selected.length})`
                  : "Importa sfondo calibrato"}
              </button>
            </div>
          </>
        )}
      </div>
    </FullscreenDialog>
  );
}
