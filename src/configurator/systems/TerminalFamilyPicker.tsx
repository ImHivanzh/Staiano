"use client";
import Image from "next/image";
import type { AirTerminalFamily } from "@/domain/catalogs/air-terminal-schema";
import styles from "./TerminalFamilyPicker.module.css";

export function TerminalFamilyPicker({
  options,
  onSelect,
  use,
}: {
  options: { family: AirTerminalFamily; compatible: boolean }[];
  onSelect: (family: AirTerminalFamily) => void;
  use: "supply" | "return";
}) {
  const visible = options.filter((item) => item.family.use.includes(use));
  const primary = (
    use === "supply" ? ["EDLS", "EDFL-20", "EBL", "EDSC-C"] : ["EGA6"]
  ).flatMap((code) =>
    visible.filter((item) => item.family.familyCode === code),
  );
  function modelButton({ family, compatible }: (typeof options)[number]) {
    const supportedUse = family.use.includes(use);
    return (
      <button
        type="button"
        key={family.familyCode}
        aria-label={`Scegli ${family.familyCode}`}
        disabled={!compatible}
        onClick={() => onSelect(family)}
      >
        {family.image ? (
          <Image
            src={family.image}
            alt={family.name}
            width={180}
            height={90}
            unoptimized
          />
        ) : (
          <span>Immagine non disponibile</span>
        )}
        <strong>
          {family.familyCode === "EDFL-20"
            ? "EDFL"
            : family.familyCode === "EGA6"
              ? "EGA6 Push"
              : family.familyCode}
        </strong>
        <span>{family.name}</span>
        {primary.some((item) => item.family.familyCode === family.familyCode) &&
          compatible && (
            <small className={styles.recommended}>Consigliata</small>
          )}
        {family.familyCode === "EGA6" && (
          <small>Chiusura Push a richiesta</small>
        )}
        {!compatible && (
          <small>
            {supportedUse
              ? "Dati non compatibili con il dimensionamento"
              : use === "supply"
                ? "Per ripresa · seleziona Ripresa"
                : "Per mandata · seleziona Mandata"}
          </small>
        )}
      </button>
    );
  }
  return (
    <section aria-label="Modelli bocchette">
      <p>
        Passo 1 di 3 · Scegli il modello{" "}
        {use === "supply" ? "di mandata" : "di ripresa"}.
      </p>
      <h4>Principali</h4>
      <div
        className={styles.primary}
        role="group"
        aria-label="Bocchette principali"
      >
        {primary.map(modelButton)}
      </div>
      <details className={styles.catalog}>
        <summary>Tutti i modelli Ecoclima</summary>
        <div
          className={styles.other}
          role="group"
          aria-label="Tutti i modelli Ecoclima"
        >
          {visible.filter((item) => !primary.includes(item)).map(modelButton)}
        </div>
      </details>
    </section>
  );
}
