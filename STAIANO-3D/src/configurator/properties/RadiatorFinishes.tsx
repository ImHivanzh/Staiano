"use client";
import type { Project } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import {
  getRadiatorFinishOptions,
  resolveRadiatorFinish,
  radiatorFinishCatalogVersion,
  radiatorFinishPreviewDisclaimer,
} from "@/domain/catalogs/radiator-finishes";

const roles = [
  { role: "body", field: "bodyColorId", label: "Colore radiatore" },
  { role: "valve", field: "valveColorId", label: "Colore valvola" },
  { role: "lockshield", field: "lockshieldColorId", label: "Colore detentore" },
  { role: "pipeCover", field: "pipeCoverColorId", label: "Colore copritubo" },
] as const;
export function RadiatorFinishes({
  device,
}: {
  device: Project["radiators"][number];
}) {
  const { commit } = useProjectStore();
  return (
    <details className="azione-inspector">
      <summary>Colori e finiture</summary>
      {roles.map(({ role, field, label }) => {
        const options = getRadiatorFinishOptions(
          device.manufacturer,
          device.family,
          role,
        );
        const chosen = resolveRadiatorFinish(
          device.manufacturer,
          device.family,
          role,
          device.finishes?.[field],
        );
        return (
          <label className="campo" key={role}>
            <span>
              {label}
              {chosen && (
                <span
                  className="campione-colore"
                  style={{ backgroundColor: chosen.colorHex }}
                  aria-hidden="true"
                />
              )}
            </span>
            <select
              aria-label={label}
              value={device.finishes?.[field] ?? ""}
              disabled={!options.length}
              onChange={(event) =>
                commit((p) => ({
                  ...p,
                  radiators: p.radiators.map((item) =>
                    item.id === device.id
                      ? {
                          ...item,
                          finishes: {
                            ...item.finishes,
                            [field]: event.target.value || undefined,
                            catalogVersion: radiatorFinishCatalogVersion,
                          },
                        }
                      : item,
                  ),
                }))
              }
            >
              <option value="">
                {options.length
                  ? `Standard${chosen ? ` · ${chosen.label}` : ""}`
                  : "Finitura ufficiale non disponibile"}
              </option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {chosen && (
              <a
                className="nota"
                href={chosen.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Palette ufficiale
              </a>
            )}
          </label>
        );
      })}
      <p className="nota">{radiatorFinishPreviewDisclaimer}</p>
    </details>
  );
}
