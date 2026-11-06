"use client";
import Image from "next/image";
import styles from "./RadiatorPanel.module.css";

export type PickerOption = {
  key: string;
  title: string;
  detail?: string;
  photo?: { src: string };
  /** Evidenzia la scelta consigliata per il carico. */
  recommended?: boolean;
  warning?: string;
};

function Group({
  legend,
  label,
  options,
  value,
  onSelect,
  badge,
}: {
  legend: string;
  label: string;
  options: PickerOption[];
  value: string;
  onSelect: (key: string) => void;
  badge: string;
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className={styles.choices} role="group" aria-label={label}>
        {options.map((option) => (
          <button
            type="button"
            className={styles.choice}
            key={option.key}
            data-id={option.key}
            aria-pressed={value === option.key}
            data-recommended={option.recommended ? "true" : undefined}
            onClick={() => onSelect(option.key)}
          >
            {option.photo && (
              <Image
                unoptimized
                src={option.photo.src}
                alt=""
                width={160}
                height={90}
              />
            )}
            <strong>{option.title}</strong>
            {option.detail && <small>{option.detail}</small>}
            {option.warning && <small>{option.warning}</small>}
            {option.recommended && <small>{badge}</small>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Flusso uniforme Marca → Modello → Taglia, come ventilconvettori e radiatori.
 * Ogni passo mostra solo ciò che dipende dal precedente; la taglia consigliata
 * è marcata in base al fabbisogno.
 */
export function BrandModelSize({
  name,
  brands,
  brand,
  onBrand,
  models,
  model,
  onModel,
  sizes,
  size,
  onSize,
}: {
  name: string;
  brands: PickerOption[];
  brand: string;
  onBrand: (key: string) => void;
  models: PickerOption[];
  model: string;
  onModel: (key: string) => void;
  sizes: PickerOption[];
  size: string;
  onSize: (key: string) => void;
}) {
  return (
    <>
      <Group
        legend="Marca"
        label={`Marca ${name}`}
        options={brands}
        value={brand}
        onSelect={onBrand}
        badge="Marca consigliata"
      />
      {models.length > 0 && (
        <Group
          legend="Modello"
          label={`Modello ${name}`}
          options={models}
          value={model}
          onSelect={onModel}
          badge="Modello consigliato"
        />
      )}
      {sizes.length > 0 && (
        <Group
          legend="Taglia"
          label={`Taglia ${name}`}
          options={sizes}
          value={size}
          onSelect={onSize}
          badge="Taglia consigliata"
        />
      )}
    </>
  );
}
