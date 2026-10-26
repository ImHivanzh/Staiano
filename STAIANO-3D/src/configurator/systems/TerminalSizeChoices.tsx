import type { AirTerminalSolution } from "@/domain/air-terminals/size";
import styles from "./RoomAirTerminals.module.css";

export function SizeButtons({
  label,
  values,
  value,
  onChange,
  recommended,
  unit = "mm",
}: {
  label: string;
  values: number[];
  value: number | null;
  onChange: (value: number) => void;
  recommended?: number | null;
  unit?: "mm" | "feritoie";
}) {
  return (
    <div className={styles.sizeChoices} role="group" aria-label={label}>
      <span className={styles.sizeLabel}>{label}</span>
      <div className={styles.sizeButtons}>
        {values.map((size) => {
          const text = `${size} ${unit === "feritoie" && size === 1 ? "feritoia" : unit}`;
          return (
            <button
              key={size}
              type="button"
              aria-label={text}
              aria-pressed={value === size}
              data-recommended={recommended === size ? "true" : undefined}
              onClick={() => onChange(size)}
            >
              {text}
              {recommended === size && (
                <span className={styles.sizeBadge}>Consigliata</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TerminalSolutionChoices({
  solutions,
  value,
  onChange,
  recommended,
  linear,
  circular = false,
}: {
  solutions: AirTerminalSolution[];
  value: AirTerminalSolution;
  onChange: (index: number) => void;
  recommended?: AirTerminalSolution;
  linear: boolean;
  circular?: boolean;
}) {
  const choices = linear
    ? solutions
    : solutions.filter(
        (item, index) =>
          solutions.findIndex(
            (other) => other.variant.id === item.variant.id,
          ) === index,
      );
  const rectangular =
    !linear &&
    !circular &&
    choices.every((item) => item.variant.widthMm && item.variant.heightMm) &&
    choices.some((item) => item.variant.widthMm !== item.variant.heightMm);
  const button = (item: AirTerminalSolution) => {
    const text = linear
      ? `${item.variant.slotCount ?? 1} ${(item.variant.slotCount ?? 1) === 1 ? "feritoia" : "feritoie"} · ${item.variant.slotWidthMm ?? "—"} mm · ${item.operatingPoint.airflowPerMeterM3h} m³/h per metro · ${item.operatingPoint.noiseLabel} dB(A)`
      : item.variant.nominalDiameterMm || circular
        ? `Ø ${item.variant.nominalDiameterMm ?? item.variant.widthMm ?? item.variant.heightMm ?? "—"} mm`
        : item.variant.widthMm && item.variant.heightMm
          ? `${item.variant.widthMm} × ${item.variant.heightMm} mm`
          : item.variant.id;
    const selected = linear
      ? item === value
      : item.variant.id === value.variant.id;
    const advised = linear
      ? item === recommended
      : item.variant.id === recommended?.variant.id;
    return (
      <button
        type="button"
        aria-label={text}
        aria-pressed={selected}
        data-recommended={advised ? "true" : undefined}
        onClick={() => onChange(solutions.indexOf(item))}
      >
        {text}
        {advised && <span className={styles.sizeBadge}>Consigliata</span>}
      </button>
    );
  };
  const widths = [
    ...new Set(choices.map((item) => item.variant.widthMm!)),
  ].sort((a, b) => a - b);
  const heights = [
    ...new Set(choices.map((item) => item.variant.heightMm!)),
  ].sort((a, b) => a - b);
  return (
    <div
      className={styles.sizeChoices}
      role="group"
      aria-label="Soluzione terminale"
    >
      {rectangular ? (
        <div className={styles.sizeTable}>
          <table>
            <caption>Taglie nominali · larghezza × altezza (mm)</caption>
            <thead>
              <tr>
                <th scope="col">H / L</th>
                {widths.map((width) => (
                  <th key={width} scope="col">
                    {width}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heights.map((height) => (
                <tr key={height}>
                  <th scope="row">{height}</th>
                  {widths.map((width) => {
                    const item = choices.find(
                      (choice) =>
                        choice.variant.widthMm === width &&
                        choice.variant.heightMm === height,
                    );
                    return <td key={width}>{item ? button(item) : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.sizeButtons}>
          {choices.map((item) => (
            <div
              key={`${item.variant.id}-${item.variant.operatingPoints.indexOf(item.operatingPoint)}`}
            >
              {button(item)}
            </div>
          ))}
        </div>
      )}
      {!linear && (
        <div
          className={styles.sizeButtons}
          role="group"
          aria-label="Prestazioni della taglia"
        >
          {solutions
            .filter((item) => item.variant.id === value.variant.id)
            .map((item) => (
              <button
                type="button"
                key={item.variant.operatingPoints.indexOf(item.operatingPoint)}
                aria-pressed={item === value}
                onClick={() => onChange(solutions.indexOf(item))}
              >
                {item.operatingPoint.airflowM3h} m³/h ·{" "}
                {item.operatingPoint.noiseLabel} dB(A)
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
