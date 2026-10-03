"use client";
import { useState } from "react";
import Image from "next/image";
import type { Project, Room } from "@/schemas/project";
import { ductedRoomAllocation } from "@/domain/ducted/apply";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import {
  sizeAirTerminal,
  type AirTerminalSolution,
} from "@/domain/air-terminals/size";
import { applyAirTerminalSolution } from "@/domain/air-terminals/apply";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber } from "@/utils/format";
export function RoomAirTerminals({
  project,
  room,
}: {
  project: Project;
  room: Room;
}) {
  const allocation = ductedRoomAllocation(project, room.id),
    { commit } = useProjectStore();
  const [use, setUse] = useState<"supply" | "return">("supply"),
    [familyCode, setFamilyCode] = useState<string | null>(null),
    [choice, setChoice] = useState(0),
    [mounting, setMounting] = useState<"wall" | "ceiling">("ceiling");
  if (!allocation) return null;
  const points = use === "supply" ? room.supplyPoints : room.returnPoints,
    compatible = airTerminalCatalog.families.filter(
      (f) => sizeAirTerminal(allocation.airflowM3h, points, f, use).length,
    ),
    family = compatible.find((f) => f.familyCode === familyCode),
    solutions: AirTerminalSolution[] = family
      ? sizeAirTerminal(allocation.airflowM3h, points, family, use)
      : [],
    solution = solutions[choice] ?? solutions[0];
  return (
    <section className="pannello-terminali">
      <h3>Terminali della stanza</h3>
      <div className="azioni">
        <button
          className={`bottone piccolo ${use === "supply" ? "chiara" : ""}`}
          onClick={() => {
            setUse("supply");
            setFamilyCode(null);
          }}
        >
          Mandata
        </button>
        <button
          className={`bottone piccolo ${use === "return" ? "chiara" : ""}`}
          onClick={() => {
            setUse("return");
            setFamilyCode(null);
          }}
        >
          Ripresa
        </button>
      </div>
      <p className="nota">
        Portata assegnata: {formatNumber(allocation.airflowM3h, 1)} m³/h · quota{" "}
        {formatNumber(allocation.share * 100, 1)}%
      </p>
      <label className="campo">
        <span>{use === "supply" ? "Punti mandata" : "Punti ripresa"}</span>
        <input
          type="number"
          min="1"
          max="100"
          value={points}
          onChange={(e) => {
            const count = Number(e.target.value);
            if (Number.isInteger(count) && count >= 1 && count <= 100) {
              commit((p) => ({
                ...p,
                rooms: p.rooms.map((r) =>
                  r.id === room.id
                    ? {
                        ...r,
                        [use === "supply" ? "supplyPoints" : "returnPoints"]:
                          count,
                      }
                    : r,
                ),
              }));
              setChoice(0);
            }
          }}
        />
      </label>
      <p className="nota">
        Per punto: {formatNumber(allocation.airflowM3h / points, 1)} m³/h
      </p>
      <div className="gallery-terminali gallery-stanza">
        {compatible.map((f) => (
          <button
            key={f.familyCode}
            className={`stile-terminale ${f.familyCode === familyCode ? "scelto" : ""}`}
            aria-label={`Stile ${use} ${f.familyCode}`}
            onClick={() => {
              setFamilyCode(f.familyCode);
              setChoice(0);
              setMounting(f.mountings?.[0] ?? "wall");
            }}
          >
            {f.image && (
              <Image
                src={f.image}
                alt={f.name}
                width={180}
                height={90}
                unoptimized
              />
            )}
            <strong>{f.familyCode}</strong>
            <span>{f.name}</span>
          </button>
        ))}
      </div>
      {family && solution && (
        <>
          <label className="campo">
            <span>Soluzione terminale</span>
            <select
              value={Math.min(choice, solutions.length - 1)}
              onChange={(e) => setChoice(Number(e.target.value))}
            >
              {solutions.slice(0, 12).map((s, i) => (
                <option key={i} value={i}>
                  {s.variant.id} ·{" "}
                  {s.commercialLengthM !== null
                    ? `${formatNumber(s.commercialLengthM)}m`
                    : `${s.quantityPerPoint} unità/punto`}{" "}
                  · {s.operatingPoint.noiseLabel}dB(A)
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Montaggio terminale</span>
            <select
              value={mounting}
              onChange={(e) =>
                setMounting(e.target.value as "wall" | "ceiling")
              }
            >
              {family.mountings?.map((m) => (
                <option key={m} value={m}>
                  {m === "wall" ? "Parete" : "Soffitto"}
                </option>
              ))}
            </select>
          </label>
          <p className="nota">
            {solution.theoreticalLengthM !== null && (
              <>
                Teorica {formatNumber(solution.theoreticalLengthM, 3)} m ·
                Commerciale {formatNumber(solution.commercialLengthM!)} m<br />
              </>
            )}
            Portata di riferimento:{" "}
            {formatNumber(solution.availableAirflowPerPointM3h, 1)} m³/h per
            punto
            <br />
            Rumore: {solution.operatingPoint.noiseLabel} dB(A)
            <br />
            Pa: {solution.operatingPoint.pressureDropPa ?? "Non disponibile"} ·
            Lancio {solution.operatingPoint.throwM ?? "Non disponibile"}
          </p>
          <details>
            <summary>Calcolo e condizioni</summary>
            {solution.log.map((line, i) => (
              <p key={i} className="nota">
                {line}
              </p>
            ))}
            <p className="nota">{family.geometryNote}</p>
          </details>
          <button
            className="bottone pieno"
            onClick={() =>
              commit((p) =>
                applyAirTerminalSolution(
                  p,
                  room.id,
                  allocation.system.id,
                  use,
                  family.familyCode,
                  solution,
                  mounting,
                ),
              )
            }
          >
            Applica {use === "supply" ? "mandata" : "ripresa"} e posiziona
          </button>
        </>
      )}
      {!compatible.length && (
        <p className="avviso attenzione">
          Nessun terminale soddisfa portata e rumore. Aumentare il numero punti.
        </p>
      )}
      <p className="nota">
        La scelta sostituisce i terminali della stessa funzione in questa
        stanza.
      </p>
      <details>
        <summary>Terminali posizionati</summary>
        {project.airTerminals
          .filter((t) => t.roomId === room.id)
          .map((t) => (
            <button
              className="bottone piccolo"
              key={t.id}
              onClick={() =>
                useProjectStore.getState().select({ kind: "device", id: t.id })
              }
            >
              {t.use === "supply" ? "Mandata" : "Ripresa"} · {t.family} ·{" "}
              {t.noiseLabel} dB(A)
            </button>
          ))}
      </details>
    </section>
  );
}
