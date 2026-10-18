"use client";
import { useState, type InputHTMLAttributes } from "react";

export const LENGTH_UNITS = { m: 1, cm: 0.01, mm: 0.001 } as const;
export type LengthUnit = keyof typeof LENGTH_UNITS;
export function convertLength(value: number, from: LengthUnit, to: LengthUnit) {
  return (value * LENGTH_UNITS[from]) / LENGTH_UNITS[to];
}

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange" | "type"
> & {
  label: string;
  baseUnit?: LengthUnit;
  defaultValue?: number | string;
  onValueChange?: (value: number) => void;
  onValueBlur?: (value: number) => void;
};
export function LengthInput({
  label,
  baseUnit = "m",
  defaultValue = "",
  name,
  min,
  max,
  className,
  onValueChange,
  onValueBlur,
  ...props
}: Props) {
  const [unit, setUnit] = useState<LengthUnit>(baseUnit);
  const [value, setValue] = useState(String(defaultValue));
  const numeric =
    value.trim() === ""
      ? ""
      : convertLength(Number(value.replace(",", ".")), unit, baseUnit);
  return (
    <label className={`campo ${className ?? ""}`}>
      <span>
        {label} ({unit})
      </span>
      <div
        className="misura-con-unita"
        role="group"
        aria-label={`Misura ${label}`}
      >
        <input
          {...props}
          name={unit === baseUnit ? name : undefined}
          type="number"
          aria-label={
            props["aria-label"]?.replace(/\((m|cm|mm)\)$/, `(${unit})`) ??
            `${label} (${unit})`
          }
          value={value}
          min={
            min === undefined
              ? undefined
              : convertLength(Number(min), baseUnit, unit)
          }
          max={
            max === undefined
              ? undefined
              : convertLength(Number(max), baseUnit, unit)
          }
          step="any"
          onBlur={(event) => {
            props.onBlur?.(event);
            onValueBlur?.(numeric === "" ? NaN : numeric);
          }}
          onChange={(event) => {
            setValue(event.target.value);
            onValueChange?.(
              event.target.value === ""
                ? NaN
                : convertLength(Number(event.target.value), unit, baseUnit),
            );
          }}
        />
        <select
          aria-label="Unità di misura"
          value={unit}
          disabled={props.disabled}
          onChange={(event) => {
            const next = event.target.value as LengthUnit;
            if (value.trim() !== "")
              setValue(
                String(
                  convertLength(Number(value.replace(",", ".")), unit, next),
                ),
              );
            setUnit(next);
          }}
        >
          <option value="m">m</option>
          <option value="cm">cm</option>
          <option value="mm">mm</option>
        </select>
      </div>
      {unit !== baseUnit && (
        <input
          type="hidden"
          name={name}
          value={numeric}
          disabled={props.disabled}
        />
      )}
      {unit !== baseUnit && numeric !== "" && Number.isFinite(numeric) && (
        <small>
          {numeric.toLocaleString("it-IT", { maximumFractionDigits: 8 })}{" "}
          {baseUnit}
        </small>
      )}
    </label>
  );
}
