"use client";
import { useState } from "react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import type { Project } from "@/schemas/project";
import { presentationSteps } from "@/domain/customer-presentation";
import styles from "./CustomerView.module.css";

/** Spiegazione passo per passo, letta dal progetto: impianti, ambienti e bocchette. */
export function CustomerPresentation({ project }: { project: Project }) {
  const steps = presentationSteps(project);
  const [index, setIndex] = useState(0);
  const current = Math.min(index, steps.length - 1);
  const step = steps[current];
  return (
    <aside className={styles.presentation} aria-label="Presentazione impianti">
      <p className={styles.stepCount}>
        Passo {current + 1} di {steps.length}
      </p>
      <h2>{step.title}</h2>
      <p>{step.intro}</p>
      {step.rooms.length > 0 && (
        <ul className={styles.rooms} aria-label="Ambienti">
          {step.rooms.map((room) => (
            <li key={room}>{room}</li>
          ))}
        </ul>
      )}
      {step.facts.length > 0 && (
        <dl className={styles.facts}>
          {step.facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {step.terminals.length > 0 && (
        <section aria-label="Bocchette">
          <h3>Bocchette</h3>
          <ul className={styles.terminals}>
            {step.terminals.map((item) => (
              <li key={`${item.room}:${item.label}`}>
                <strong>
                  {item.room} · {item.label}
                </strong>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className={styles.stepButtons}>
        <button
          type="button"
          className="bottone piccolo tenue"
          disabled={current === 0}
          onClick={() => setIndex(current - 1)}
        >
          <ArrowLeft aria-hidden="true" /> Indietro
        </button>
        <button
          type="button"
          className="bottone piccolo"
          disabled={current === steps.length - 1}
          onClick={() => setIndex(current + 1)}
        >
          Avanti <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
