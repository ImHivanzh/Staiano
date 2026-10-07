"use client";
import { TerminalCommercialOptions } from "@/configurator/systems/TerminalCommercialOptions";
import type { Project } from "@/schemas/project";
import { airTerminalFamilyAtVersion } from "@/domain/catalogs/air-terminals";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber } from "@/utils/format";
import { needsTerminalReconfiguration } from "@/domain/air-terminals/legacy";
import { airTerminalModelDescription } from "@/domain/air-terminals/description";
import { Info } from "@phosphor-icons/react";
import { TerminalEditForm } from "./TerminalEditForm";
export function TerminalProperties({
  project,
  id,
}: {
  project: Project;
  id: string;
}) {
  const t = project.airTerminals.find((t) => t.id === id),
    { select } = useProjectStore();
  if (!t) return null;
  const room = project.rooms.find((r) => r.id === t.roomId),
    family = airTerminalFamilyAtVersion(t.family, t.catalogVersion),
    legacy = needsTerminalReconfiguration(t);
  return (
    <div className="corpo-proprieta">
      <TerminalCommercialOptions project={project} terminalId={id} />
      <h3>
        {t.family} · {t.use === "supply" ? "Mandata" : "Ripresa"}
      </h3>
      <p className="nota">{airTerminalModelDescription(family, t.productId)}</p>
      <p>{room?.name}</p>
      <p className="riepilogo-apparecchio">
        <strong>{formatNumber(t.requiredAirflowM3h, 1)} m³/h</strong>
        <br />
        Portata richiesta · {t.noiseLabel} dB(A)
      </p>
      <p className="nota">
        {t.mounting === "ceiling"
          ? "Soffitto"
          : t.mounting === "wall"
            ? "Parete"
            : "Montaggio da verificare"}{" "}
        · quota{" "}
        {t.elevationM === null
          ? "da verificare"
          : `${formatNumber(t.elevationM)} m`}
      </p>
      {legacy && (
        <div role="status" className="nota">
          <p>
            Terminale legacy da riconfigurare. Le misure e la posizione salvate
            sono conservate; montaggio, quota e punto di catalogo non sono
            verificati. La vista 3D richiede una nuova configurazione.
          </p>
          <button
            className="bottone chiara"
            type="button"
            onClick={() => select({ kind: "room", id: t.roomId })}
          >
            Configura terminali della stanza
          </button>
        </div>
      )}
      {!legacy && <TerminalEditForm key={id} project={project} id={id} />}
      <p className="nota">
        {legacy
          ? "Seleziona la stanza e scegli nuovamente famiglia, variante e punto di funzionamento per verificare l'installazione."
          : "Trascina in pianta. A parete: snap al contorno interno. A soffitto: verifica ingombro della faccia."}
      </p>
      <details className="azione-inspector dettagli-inspector">
        <summary>
          <Info size={19} aria-hidden="true" />
          <span>
            Dettagli tecnici
            <small>Misure, punto di funzionamento e fonte</small>
          </span>
        </summary>
        <p className="nota">
          {t.productId}
          <br />
          Faccia {formatNumber(t.widthMm, 0)} × {formatNumber(t.heightMm, 0)} mm
          <br />
          Profondità{" "}
          {t.depthMm === null ? "Dato non disponibile" : `${t.depthMm} mm`}
          <br />
          Portata richiesta {formatNumber(t.requiredAirflowM3h, 1)} m³/h
          <br />
          Portata di riferimento {formatNumber(t.availableAirflowM3h, 1)} m³/h
          <br />
          Rumore {t.noiseLabel} dB(A)
          <br />
          Perdita {t.pressureDropPa ?? "Non disponibile"} Pa
          <br />
          {t.openingMm !== null ? `Apertura cono S ${t.openingMm} mm` : ""}
        </p>
        {family && (
          <>
            <p className="nota">
              {family.operatingConditions}
              <br />
              {family.geometryNote}
            </p>
            <a
              className="fonte-catalogo"
              href={family.sourceMetadata.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Fonte ufficiale
            </a>
          </>
        )}
      </details>
    </div>
  );
}
