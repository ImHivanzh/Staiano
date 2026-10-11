"use client";
import { useState } from "react";
import type { Project, Room } from "@/schemas/project";
import { hvacCatalog } from "@/domain/catalogs/hvac";
import { maximumAirflowOption } from "@/domain/catalogs/hvac-airflow";
import { selectDuctedMachine } from "@/domain/ducted/calculate";
import { applyDuctedSystem } from "@/domain/ducted/apply";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber } from "@/utils/format";
import { FullscreenDialog } from "../FullscreenDialog";
import { ManualMachineForm } from "./ManualMachineForm";
import styles from "./DuctedMachinePicker.module.css";
export function DuctedMachinePicker({
  project,
  room,
  installationId,
}: {
  project: Project;
  room: Room;
  installationId?: string;
}) {
  const savedSystem = project.hvacSystems.find(
    (s) =>
      s.type === "ducted" &&
      s.roomIds.includes(room.id) &&
      (!installationId || s.installationId === installationId),
  );
  const { commit, error } = useProjectStore();
  const installation = project.installations.find(
    (item) => item.id === installationId,
  );
  const initialName =
    installation?.name ?? `Impianto ${project.installations.length + 1}`;
  const [open, setOpen] = useState(false);
  const brands = [
    ...new Set(
      hvacCatalog.products
        .filter((p) => p.kind === "ducted")
        .map((p) => p.manufacturer),
    ),
  ];
  const [manufacturer, setManufacturer] = useState(
    savedSystem?.genericMachine
      ? brands[0]
      : (savedSystem?.manufacturer ?? brands[0]),
  );
  const [servedIds, setServedIds] = useState(
    savedSystem?.roomIds ?? installation?.roomIds ?? [room.id],
  );
  const [systemName, setSystemName] = useState(
    savedSystem?.name ?? initialName,
  );
  const [productId, setProductId] = useState(savedSystem?.productId ?? "");
  const [manual, setManual] = useState(!!savedSystem?.genericMachine);
  const load = project.rooms
    .filter((r) => servedIds.includes(r.id))
    .reduce((total, r) => total + r.designLoadW, 0);
  const candidates =
    load > 0
      ? selectDuctedMachine(load, manufacturer, hvacCatalog.products)
      : [];
  const selected = candidates.find((p) => p.id === productId) ?? candidates[0];
  return (
    <>
      <button
        type="button"
        className="bottone chiara"
        onClick={() => {
          setManufacturer(
            savedSystem?.genericMachine
              ? brands[0]
              : (savedSystem?.manufacturer ?? brands[0]),
          );
          setServedIds(
            savedSystem?.roomIds ?? installation?.roomIds ?? [room.id],
          );
          setSystemName(savedSystem?.name ?? initialName);
          setProductId(savedSystem?.productId ?? "");
          setManual(!!savedSystem?.genericMachine);
          setOpen(true);
        }}
      >
        {savedSystem ? "Cambia macchina" : "Scegli macchina"}
      </button>
      <FullscreenDialog
        open={open}
        title="Scegli macchina canalizzata"
        onClose={() => setOpen(false)}
      >
        <div className={styles.picker}>
          <p className="nota">
            Scegli marca e modello per gli ambienti serviti. I modelli proposti
            coprono il fabbisogno di {formatNumber(load / 1000)} kW.
          </p>
          <div className="azioni" role="group" aria-label="Origine macchina">
            <button
              type="button"
              className="bottone"
              aria-pressed={!manual}
              onClick={() => setManual(false)}
            >
              Catalogo verificato
            </button>
            <button
              type="button"
              className="bottone"
              aria-pressed={manual}
              onClick={() => setManual(true)}
            >
              Dati manuali
            </button>
          </div>
          {manual ? (
            <ManualMachineForm
              project={project}
              roomIds={
                savedSystem?.roomIds ?? installation?.roomIds ?? [room.id]
              }
              onApplied={() => setOpen(false)}
              installationId={installationId}
            />
          ) : (
            <div className={styles.layout}>
              <div className={styles.controls}>
                <h3>Ambienti e marca</h3>
                <label className="campo">
                  <span>Nome impianto</span>
                  <input
                    aria-label="Nome impianto canalizzato"
                    value={systemName}
                    maxLength={100}
                    onChange={(e) => setSystemName(e.target.value)}
                  />
                </label>
                <label className="campo">
                  <span>Marca canalizzato</span>
                  <select
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                  >
                    {brands.map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </label>
                <details open>
                  <summary>Ambienti serviti · {servedIds.length}</summary>
                  <fieldset>
                    <legend>Ambienti serviti</legend>
                    {project.rooms
                      .filter(
                        (r) =>
                          r.floorId === room.floorId &&
                          !r.conditioningExclusion,
                      )
                      .map((r) => {
                        const otherSystem = project.hvacSystems.find(
                          (s) =>
                            s.id !== savedSystem?.id &&
                            s.roomIds.includes(r.id),
                        );
                        return (
                          <label className="ambiente-servito" key={r.id}>
                            <input
                              type="checkbox"
                              disabled={
                                r.geometryStatus === "unresolved" ||
                                (!installationId && !!otherSystem)
                              }
                              checked={servedIds.includes(r.id)}
                              onChange={(e) =>
                                setServedIds(
                                  e.target.checked
                                    ? [...servedIds, r.id]
                                    : servedIds.filter((id) => id !== r.id),
                                )
                              }
                            />
                            {r.name} · {formatNumber(r.designLoadW / 1000)} kW
                            {otherSystem
                              ? ` · già servita da ${otherSystem.name || otherSystem.manufacturer}`
                              : ""}
                          </label>
                        );
                      })}
                  </fieldset>
                </details>
                <p className="nota">
                  Stanze e macchina appartengono soltanto a questo impianto. Un
                  altro impianto parte dalla singola stanza selezionata.
                </p>
                {selected && (
                  <div
                    className={styles.selection}
                    aria-label="Macchina selezionata"
                  >
                    <span>Modello selezionato</span>
                    <strong>{selected.indoorModel}</strong>
                    <p>
                      {formatNumber(maximumAirflowOption(selected)!.airflowM3h)}{" "}
                      m³/h · {formatNumber(selected.coolingCapacityW / 1000)} kW
                      freddo
                    </p>
                  </div>
                )}
                <button
                  className="bottone chiara"
                  disabled={
                    room.geometryStatus === "unresolved" ||
                    !selected ||
                    !servedIds.length ||
                    servedIds.some(
                      (id) =>
                        project.rooms.find((r) => r.id === id)
                          ?.geometryStatus === "unresolved",
                    )
                  }
                  onClick={() => {
                    commit((p) => {
                      const updated = applyDuctedSystem(
                        p,
                        servedIds,
                        manufacturer,
                        savedSystem?.id ?? null,
                        selected?.id ?? null,
                        installationId,
                      );
                      const configured = updated.hvacSystems.find(
                        (s) =>
                          s.type === "ducted" &&
                          (!installationId ||
                            s.installationId === installationId) &&
                          s.roomIds.some((id) => servedIds.includes(id)),
                      );
                      return {
                        ...updated,
                        hvacSystems: updated.hvacSystems.map((s) =>
                          s.id === configured?.id
                            ? {
                                ...s,
                                name: systemName.trim() || initialName,
                              }
                            : s,
                        ),
                        installations: updated.installations.map((item) =>
                          item.id === installationId
                            ? {
                                ...item,
                                name: systemName.trim() || initialName,
                                roomIds: servedIds,
                              }
                            : item,
                        ),
                      };
                    });
                    if (!useProjectStore.getState().error) setOpen(false);
                  }}
                >
                  {savedSystem
                    ? "Aggiorna sistema canalizzato"
                    : "Configura canalizzato"}
                </button>
              </div>
              <section aria-label="Modelli macchina compatibili">
                <div className={styles.catalogHeading}>
                  <h3>Modelli compatibili</h3>
                  <span>
                    {candidates.length} modelli · fabbisogno{" "}
                    {formatNumber(load / 1000)} kW
                  </span>
                </div>
                <p className="nota">
                  Seleziona un modello per confrontare portata e potenza.
                  Conferma per applicarlo all’impianto.
                </p>
                {!candidates.length && (
                  <p role="status" className="avviso attenzione">
                    Nessun modello di questa marca copre il fabbisogno. Scegli
                    un’altra marca o verifica gli ambienti serviti.
                  </p>
                )}
                <div className={styles.models}>
                  {candidates.map((product) => (
                    <button
                      type="button"
                      className={styles.model}
                      key={product.id}
                      aria-pressed={selected?.id === product.id}
                      onClick={() => setProductId(product.id)}
                    >
                      <span className={styles.modelName}>
                        <strong>{product.indoorModel}</strong>
                        <span>{product.outdoorModel}</span>
                      </span>
                      <span>
                        {formatNumber(product.coolingCapacityW / 1000)} kW
                        freddo ·{" "}
                        {formatNumber((product.heatingCapacityW ?? 0) / 1000)}{" "}
                        kW caldo
                      </span>
                      <span>
                        {formatNumber(
                          maximumAirflowOption(product)!.airflowM3h,
                        )}{" "}
                        m³/h · {product.staticPressurePa ?? "—"} Pa
                      </span>
                      <span className={styles.selectedLabel}>
                        {selected?.id === product.id ? "Selezionato" : "Scegli"}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}
          {error && (
            <p role="alert" className="avviso attenzione">
              {error}
            </p>
          )}
        </div>
      </FullscreenDialog>
    </>
  );
}
