"use client";
import type { Project } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import {
  getRadiatorFinishOptions,
  genericRadiatorAccessoryFinishes,
  resolveInstalledRadiatorFinish,
  isRadiatorFinishSupported,
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
  const bodyFinish = resolveInstalledRadiatorFinish(device, "body");
  return (
    <details className="azione-inspector">
      <summary>Colori e finiture</summary>
      {roles.map(({ role, field, label }) => {
        const options = [
          ...(role === "valve" || role === "lockshield"
            ? genericRadiatorAccessoryFinishes
            : []),
          ...getRadiatorFinishOptions(device.manufacturer, device.family, role),
        ];
        const chosen = resolveInstalledRadiatorFinish(device, role);
        const automaticMatch =
          (role === "valve" || role === "lockshield") &&
          !device.finishes?.[field] &&
          !!bodyFinish &&
          bodyFinish.kind !== "metal";
        const documented =
          chosen &&
          isRadiatorFinishSupported(
            device.manufacturer,
            device.family,
            role,
            chosen.id,
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
                  ? `${automaticMatch ? "In tinta radiatore" : "Standard"}${chosen ? ` · ${chosen.label}` : ""}`
                  : "Finitura ufficiale non disponibile"}
              </option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {automaticMatch && !documented && (
              <span className="nota">
                In tinta corpo: disponibilità della finitura accessorio da
                verificare.
              </span>
            )}
            {chosen?.sourceUrl && (
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
