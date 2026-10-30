"use client";
import type { Project } from "@/schemas/project";
import {
  addDuctWaypoint,
  ductLength,
  ductRoute,
  generateDuctRoutes,
  setDuctKind,
} from "@/domain/ducted/routes";
import { useProjectStore } from "@/stores/project-store";
import { ductAirflowM3h, ductAirVelocityMs } from "@/domain/ducted/airflow";
import { deviceCodes } from "@/services/export/device-codes";
import { formatNumber, numberFromForm } from "@/utils/format";
import {
  flexibleDuctPressureLossPaM,
  flexibleDuctProducts,
  flexibleDuctInsulationMm,
  flexibleDuctOuterRadiusM,
} from "@/domain/catalogs/flexible-ducts";

export function DuctPanel({
  project,
  systemId,
  onEdit3D,
  selectedDuctId,
}: {
  project: Project;
  systemId: string;
  onEdit3D?: () => void;
  selectedDuctId?: string;
}) {
  const { commit } = useProjectStore();
  const ducts = project.ducts?.filter((d) => d.systemId === systemId) ?? [];
  const codes = deviceCodes(project);
  const lengths = ducts.map((duct) =>
    ductLength(
      ductRoute(project, duct),
      duct.kind === "flexible" ? (duct.diameterMm ?? 160) : undefined,
      duct.flexibleProductId,
    ),
  );
  const unmeasurable = lengths.filter((length) => length === null).length;
  return (
    <section className="pannello-canali" aria-label="Canalizzazione collegata">
      <h3>Canali · {codes.get(systemId)}</h3>
      <details className="guida-canali">
        <summary>Come si crea un canale</summary>
        <ol>
          <li>
            In pianta scegli lo strumento <strong>Canale</strong> (tasto K).
          </li>
          <li>
            Clicca il plenum della bocchetta: il primo punto è già sullo stacco.
          </li>
          <li>Clicca la macchina.</li>
          <li>
            Per cambiare il percorso trascina i punti in 2D o in 3D con
            «Flessibili».
          </li>
        </ol>
        <p className="nota">
          I percorsi sono proposte geometriche. I dati del costruttore valgono
          solo per lo SKU scelto; sostegni e perdite dei raccordi restano da
          verificare. Il flusso animato è illustrativo.
        </p>
      </details>
      <button
        className="bottone piccolo"
        onClick={() => commit((p) => generateDuctRoutes(p, systemId))}
      >
        Genera / aggiorna percorsi proposti
      </button>
      <p className="riepilogo-canali">
        <strong>
          {ducts.filter((d) => d.terminalId).length} rami collegati
        </strong>
        <span>
          {formatNumber(
            lengths.reduce<number>((sum, length) => sum + (length ?? 0), 0),
          )}{" "}
          m misurabili lungo l’asse dei canali
          {unmeasurable > 0 && ` · ${unmeasurable} percorsi da correggere`}
        </span>
      </p>
      {ducts.map((duct, index) => {
        const plenum = project.plenums.find(
          (item) => item.id === duct.plenumId,
        );
        const diameterFixed = !!plenum?.attachmentId;
        const product = flexibleDuctProducts.find(
          (item) => item.id === duct.flexibleProductId,
        );
        const supportedDiameter = !!product?.diametersMm.includes(
          duct.diameterMm ?? -1,
        );
        const airflowM3h = ductAirflowM3h(project, duct);
        const velocity = ductAirVelocityMs(project, duct);
        const lossPaM = flexibleDuctPressureLossPaM(
          duct.flexibleProductId,
          duct.diameterMm,
          airflowM3h,
        );
        return (
          <details key={duct.id} open={duct.id === selectedDuctId || undefined}>
            <summary>
              <strong>{codes.get(duct.id)}</strong>
              <span>
                {duct.terminalId
                  ? `verso ${codes.get(duct.terminalId)}`
                  : "macchina → plenum"}
              </span>
              <small>
                {duct.kind === "flexible" ? "Flessibile" : "Rigido"} ·{" "}
                {duct.shape === "circle"
                  ? `Ø ${duct.diameterMm} mm`
                  : `${duct.widthMm} × ${duct.heightMm} mm`}
              </small>
            </summary>
            <button
              className="bottone piccolo"
              disabled={duct.locked}
              onClick={() => {
                if (!duct.waypoints.length)
                  commit((p) => addDuctWaypoint(p, duct.id).project);
                useProjectStore.setState({
                  view: "3d",
                  selection: [{ kind: "device", id: duct.id }],
                });
                onEdit3D?.();
              }}
            >
              Modifica percorso in 3D
            </button>
            <button
              className="bottone piccolo tenue"
              disabled={duct.locked}
              onClick={() => commit((p) => addDuctWaypoint(p, duct.id).project)}
            >
              Aggiungi punto percorso
            </button>
            <label className="campo">
              <span>Tipo di canale</span>
              <select
                aria-label={`Tipo del canale ${codes.get(duct.id) ?? duct.id}`}
                value={duct.kind}
                disabled={duct.locked}
                onChange={(e) =>
                  commit((p) =>
                    setDuctKind(
                      p,
                      duct.id,
                      e.target.value as "rigid" | "flexible",
                    ),
                  )
                }
              >
                <option value="rigid">Rigido · sezione rettangolare</option>
                <option value="flexible">
                  Flessibile · tubo corrugato tondo
                </option>
              </select>
            </label>
            {duct.kind === "flexible" && (
              <>
                <label className="campo">
                  <span>SKU del flessibile</span>
                  <select
                    aria-label={`SKU del flessibile ${codes.get(duct.id) ?? duct.id}`}
                    value={duct.flexibleProductId ?? ""}
                    disabled={duct.locked}
                    onChange={(event) => {
                      const flexibleProductId =
                        event.target.value === "ecoclima-etf10"
                          ? "ecoclima-etf10"
                          : undefined;
                      commit((p) => ({
                        ...p,
                        ducts: p.ducts?.map((item) =>
                          item.id === duct.id
                            ? { ...item, flexibleProductId }
                            : item,
                        ),
                      }));
                    }}
                  >
                    <option value="">
                      Generico isolato · 25 mm · SKU non selezionato
                    </option>
                    {flexibleDuctProducts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.sourceMetadata.manufacturer} {item.familyCode}
                      </option>
                    ))}
                  </select>
                </label>
                {!product && (
                  <p className="nota">
                    Isolante {flexibleDuctInsulationMm()} mm · diametro esterno{" "}
                    {formatNumber(
                      flexibleDuctOuterRadiusM(duct.diameterMm ?? 160) * 2000,
                    )}{" "}
                    mm. L’ingombro esterno è incluso nei controlli di
                    collisione.
                  </p>
                )}
                {product && (
                  <>
                    <label className="campo">
                      <span>Diametro interno OEM (mm)</span>
                      <select
                        aria-label={`Diametro OEM del flessibile ${codes.get(duct.id) ?? duct.id}`}
                        value={supportedDiameter ? String(duct.diameterMm) : ""}
                        disabled={duct.locked || diameterFixed}
                        onChange={(event) => {
                          const diameterMm = Number(event.target.value);
                          if (!product.diametersMm.includes(diameterMm)) return;
                          commit((p) => ({
                            ...p,
                            ducts: p.ducts?.map((item) =>
                              item.id === duct.id
                                ? { ...item, diameterMm }
                                : item,
                            ),
                          }));
                        }}
                      >
                        <option value="" disabled>
                          Seleziona il diametro
                        </option>
                        {product.diametersMm.map((diameterMm) => (
                          <option key={diameterMm} value={diameterMm}>
                            Ø {diameterMm} mm ·{" "}
                            {diameterMm >= 457 ? "AC NERO" : "ETF10"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <small>
                      {velocity === null
                        ? "Velocità non determinabile: portata di ramo non univoca."
                        : `Velocità media: ${formatNumber(velocity)} m/s${supportedDiameter && velocity > product.maxAirVelocityMs ? " · supera il limite OEM" : ""}.`}
                    </small>
                    <small>
                      {supportedDiameter
                        ? `Raggio minimo ${formatNumber(product.minimumBendRadiusFactor)} × Ø · velocità massima ${product.maxAirVelocityMs} m/s · pressione massima ${product.maxPressurePa} Pa. Interasse dei sostegni non pubblicato.`
                        : `ETF10 non pubblica Ø ${duct.diameterMm} mm; i dati OEM non si applicano. Interasse dei sostegni non pubblicato.`}
                    </small>
                    <small>
                      {!supportedDiameter
                        ? "Scegli un diametro pubblicato per applicare i dati OEM."
                        : lossPaM !== null && lengths[index] !== null
                          ? `Perdita distribuita tabellare: ${formatNumber(lossPaM)} Pa/m a ${formatNumber(airflowM3h!)} m³/h; ${formatNumber(lossPaM * lengths[index]!)} Pa sul tratto. Totale incompleto: raccordi e terminale esclusi; pressione massima non verificata.`
                          : "Perdita di carico non calcolata: manca una portata di ramo univoca o un punto OEM esatto; nessuna interpolazione."}
                    </small>
                    <a
                      href={product.sourceMetadata.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Scheda Ecoclima ETF10 · rev.{" "}
                      {product.sourceMetadata.documentRevision}
                    </a>
                  </>
                )}
              </>
            )}
            <details>
              <summary>Coordinate avanzate</summary>
              <form
                key={JSON.stringify(duct.waypoints)}
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
            </details>
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
              disabled={
                duct.locked ||
                project.plenums.some(
                  (p) => p.id === duct.plenumId && !!p.attachmentId,
                )
              }
              title="I flessibili del plenum si rimuovono eliminando il plenum o scollegando la bocchetta dalla macchina."
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
        );
      })}
    </section>
  );
}
