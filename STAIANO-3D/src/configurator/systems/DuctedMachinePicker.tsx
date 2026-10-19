"use client";
import { useRef, useState } from "react";
import type { Project, Room } from "@/schemas/project";
import { hvacCatalog } from "@/domain/catalogs/hvac";
import { maximumAirflowOption } from "@/domain/catalogs/hvac-airflow";
import { selectDuctedMachine } from "@/domain/ducted/calculate";
import { applyDuctedSystem } from "@/domain/ducted/apply";
import { useProjectStore } from "@/stores/project-store";
import { formatNumber } from "@/utils/format";
import { FullscreenDialog, FullscreenSection } from "../FullscreenDialog";
import { ManualMachineForm } from "./ManualMachineForm";
import { SupplyPlenumPanel } from "./SupplyPlenumPanel";
import { lastAvailableManufacturer } from "./manufacturer-preference";
import styles from "./DuctedMachinePicker.module.css";
export function DuctedMachinePicker({
  project,
  room,
  installationId,
  systemId,
  initialOpen = false,
  onClosed,
  onPlace,
  connectedRooms,
  hydronic = false,
}: {
  project: Project;
  room: Room;
  installationId?: string;
  systemId?: string | null;
  initialOpen?: boolean;
  onClosed?: () => void;
  onPlace?: (change: (project: Project) => Project) => void;
  connectedRooms?: string[];
  hydronic?: boolean;
}) {
  const savedSystem = project.hvacSystems.find(
    (s) =>
      s.type === "ducted" &&
      (systemId === undefined || s.id === systemId) &&
      (systemId !== undefined ||
        s.roomIds.includes(room.id) ||
        s.indoorUnits.some((unit) => unit.roomId === room.id)) &&
      (!installationId || s.installationId === installationId),
  );
  const { commit } = useProjectStore();
  const installation = project.installations.find(
    (item) => item.id === installationId,
  );
  const initialName =
    installation?.name ?? `Impianto ${project.installations.length + 1}`;
  const [open, setOpen] = useState(initialOpen);
  const saveButton = useRef<HTMLButtonElement>(null);
  const apply = onPlace ?? commit;
  function close() {
    setOpen(false);
    onClosed?.();
  }
  const brands: string[] = [
    ...new Set(
      hvacCatalog.products
        .filter((p) => p.kind === "ducted")
        .map((p) => p.manufacturer),
    ),
  ];
  const preferredManufacturer = lastAvailableManufacturer(
    project.hvacSystems
      .filter((system) => system.type === "ducted")
      .map((system) => system.manufacturer),
    brands,
  );
  const [manufacturer, setManufacturer] = useState(
    savedSystem?.manufacturer && brands.includes(savedSystem.manufacturer)
      ? savedSystem.manufacturer
      : preferredManufacturer,
  );
  const servedIds = connectedRooms ?? [
    ...new Set([
      ...(savedSystem?.roomIds ?? []),
      ...(savedSystem?.indoorUnits.map((unit) => unit.roomId) ?? []),
      room.id,
    ]),
  ];
  const [systemName, setSystemName] = useState(
    savedSystem?.name ?? initialName,
  );
  const [productId, setProductId] = useState(savedSystem?.productId ?? "");
  const [manual, setManual] = useState(
    hydronic || !!savedSystem?.genericMachine,
  );
  const servedRooms = project.rooms.filter((r) => servedIds.includes(r.id));
  const load = servedRooms.reduce((total, r) => total + r.designLoadW, 0);
  const candidates =
    load > 0
      ? selectDuctedMachine(load, manufacturer, hvacCatalog.products)
      : [];
  const selected = candidates.find((p) => p.id === productId) ?? candidates[0];
  return (
    <>
      {!initialOpen && (
        <button
          type="button"
          className="bottone chiara"
          onClick={() => {
            setManufacturer(
              savedSystem?.manufacturer &&
                brands.includes(savedSystem.manufacturer)
                ? savedSystem.manufacturer
                : preferredManufacturer,
            );
            setSystemName(savedSystem?.name ?? initialName);
            setProductId(savedSystem?.productId ?? "");
            setManual(hydronic || !!savedSystem?.genericMachine);
            setOpen(true);
          }}
        >
          {savedSystem ? "Cambia macchina" : "Scegli macchina"}
        </button>
      )}
      <FullscreenDialog
        open={open}
        title="Scegli macchina canalizzata"
        onClose={close}
        closeLabel={onPlace ? "Annulla" : undefined}
        footer={
          onPlace ? (
            <>
              <button className="bottone" onClick={close}>
                Annulla
              </button>
              <button
                className="bottone pieno"
                onClick={() => {
                  if (saveButton.current && !saveButton.current.disabled)
                    saveButton.current.click();
                  else
                    useProjectStore
                      .getState()
                      .setError(
                        "Scegli un modello compatibile con il fabbisogno.",
                      );
                }}
              >
                Salva
              </button>
            </>
          ) : undefined
        }
      >
        <div className={`${styles.picker} ${styles.compactPicker}`}>
          <p className="nota">
            Scegli marca e modello per la macchina. I modelli proposti coprono
            il fabbisogno di {formatNumber(load / 1000)} kW.
          </p>
          <div className="azioni" role="group" aria-label="Origine macchina">
            <button
              type="button"
              className="bottone"
              aria-pressed={!manual}
              disabled={hydronic}
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
          {hydronic && (
            <p role="status" className="nota">
              Unità canalizzata ad acqua collegata alla PdC. Inserisci portata e
              potenze dalla scheda del modello idronico.
            </p>
          )}
          <div className={styles.layout}>
            <div className={styles.controls}>
              <section
                className={styles.servedRooms}
                aria-label="Ambienti considerati"
              >
                <h3>Ambienti considerati ({servedRooms.length})</h3>
                <p className="nota">
                  Collega prima tutte le bocchette per dimensionare
                  correttamente la macchina. Il fabbisogno somma il carico degli
                  ambienti elencati.
                </p>
                {servedRooms.length ? (
                  <ul>
                    {servedRooms.map((servedRoom) => (
                      <li key={servedRoom.id}>
                        <span>{servedRoom.name}</span>
                        <strong>
                          {formatNumber(servedRoom.designLoadW / 1000)} kW
                        </strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="nota">
                    Nessun ambiente collegato alle bocchette.
                  </p>
                )}
              </section>
              {savedSystem && (
                <FullscreenSection title="Vista plenum">
                  <SupplyPlenumPanel
                    project={project}
                    systemId={savedSystem.id}
                  />
                </FullscreenSection>
              )}
              {!manual && (
                <>
                  <h3>Macchina e marca</h3>
                  <label className="campo">
                    <span>{onPlace ? "Nome macchina" : "Nome impianto"}</span>
                    <input
                      aria-label={
                        onPlace
                          ? "Nome macchina canalizzata"
                          : "Nome impianto canalizzato"
                      }
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
                  {selected && (
                    <div
                      className={styles.selection}
                      aria-label="Macchina selezionata"
                    >
                      <span>Modello selezionato</span>
                      <strong>{selected.indoorModel}</strong>
                      <p>
                        {formatNumber(
                          maximumAirflowOption(selected)!.airflowM3h,
                        )}{" "}
                        m³/h · {formatNumber(selected.coolingCapacityW / 1000)}{" "}
                        kW freddo
                      </p>
                    </div>
                  )}
                  <button
                    ref={saveButton}
                    style={onPlace ? { display: "none" } : undefined}
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
                      apply((p) => {
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
                                  ...(onPlace
                                    ? {}
                                    : {
                                        name: systemName.trim() || initialName,
                                      }),
                                  roomIds: [
                                    ...new Set([...item.roomIds, ...servedIds]),
                                  ],
                                }
                              : item,
                          ),
                        };
                      });
                      if (!useProjectStore.getState().error) close();
                    }}
                  >
                    {savedSystem
                      ? "Aggiorna sistema canalizzato"
                      : "Configura canalizzato"}
                  </button>
                </>
              )}
            </div>
            {manual ? (
              <div className={styles.manualForm}>
                <ManualMachineForm
                  project={project}
                  roomIds={servedIds}
                  onApplied={close}
                  installationId={installationId}
                  systemId={systemId}
                  onPlace={onPlace}
                  saveButtonRef={saveButton}
                />
              </div>
            ) : (
              <section
                className={styles.catalog}
                aria-label="Modelli macchina compatibili"
              >
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
            )}
          </div>
        </div>
      </FullscreenDialog>
    </>
  );
}
