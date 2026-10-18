"use client";
import type { Project } from "@/schemas/project";
import {
  ductLength,
  ductRoute,
  generateDuctRoutes,
} from "@/domain/ducted/routes";
import { useProjectStore } from "@/stores/project-store";
import { deviceCodes } from "@/services/export/device-codes";
import { formatNumber, numberFromForm } from "@/utils/format";

export function DuctPanel({
  project,
  systemId,
}: {
  project: Project;
  systemId: string;
}) {
  const { commit } = useProjectStore();
  const ducts = project.ducts?.filter((d) => d.systemId === systemId) ?? [];
  const codes = deviceCodes(project);
  return (
    <section aria-label="Canalizzazione collegata">
      <h3>Vista Canale · {codes.get(systemId)}</h3>
      <p className="nota">
        Percorsi geometrici proposti. Curve, perdite di carico, sostegni e posa
        esecutiva richiedono verifica. Il flusso animato illustra i
        collegamenti.
      </p>
      <button
        className="bottone piccolo"
        onClick={() => commit((p) => generateDuctRoutes(p, systemId))}
      >
        Genera / aggiorna percorsi proposti
      </button>
      <p>
        {ducts.filter((d) => d.terminalId).length} rami collegati ·{" "}
        {formatNumber(
          ducts.reduce((sum, d) => sum + ductLength(ductRoute(project, d)), 0),
        )}{" "}
        m di percorso geometrico
      </p>
      {ducts.map((duct) => (
        <details key={duct.id}>
          <summary>
            {codes.get(duct.id)} ·{" "}
            {duct.terminalId ? codes.get(duct.terminalId) : "Macchina → plenum"}{" "}
            ·{" "}
            {duct.shape === "circle"
              ? `Ø ${duct.diameterMm} mm`
              : `${duct.widthMm} × ${duct.heightMm} mm`}
          </summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              commit((p) => {
                const text = String(data.get("waypoints")).trim();
                const waypoints = text
                  ? text.split(/\n+/).map((line) => {
                      const values = line.split(";");
                      if (values.length !== 3)
                        throw new Error(
                          "Ogni punto intermedio deve avere X;Y;quota, in metri.",
                        );
                      return {
                        x: numberFromForm(values[0]),
                        y: numberFromForm(values[1]),
                        elevationM: numberFromForm(values[2]),
                      };
                    })
                  : [];
                return {
                  ...p,
                  ducts: p.ducts?.map((d) =>
                    d.id === duct.id
                      ? {
                          ...d,
                          routing: "manual",
                          waypoints,
                          decisionOrigin: "manual",
                        }
                      : d,
                  ),
                };
              });
            }}
          >
            <label className="campo">
              <span>Punti intermedi X;Y;quota (metri), uno per riga</span>
              <textarea
                name="waypoints"
                disabled={duct.locked}
                defaultValue={duct.waypoints
                  .map((p) => `${p.x};${p.y};${p.elevationM}`)
                  .join("\n")}
              />
            </label>
            <button className="bottone piccolo" disabled={duct.locked}>
              Applica percorso manuale
            </button>
          </form>
          <label>
            <input
              type="checkbox"
              checked={duct.locked}
              onChange={(e) => {
                const locked = e.target.checked;
                commit((p) => ({
                  ...p,
                  ducts: p.ducts?.map((d) =>
                    d.id === duct.id ? { ...d, locked } : d,
                  ),
                }));
              }}
            />{" "}
            Blocca canale
          </label>
          <button
            className="bottone piccolo tenue"
            disabled={duct.locked}
            onClick={() =>
              commit((p) => ({
                ...p,
                ducts: p.ducts?.filter((d) => d.id !== duct.id),
              }))
            }
          >
            Elimina canale
          </button>
        </details>
      ))}
    </section>
  );
}
