"use client";
import { useState } from "react";
import type { Project } from "@/schemas/project";
import { materialsEasyfattXml } from "@/services/export/materials-easyfatt";
import { loadEasyfattMappings } from "@/services/export/easyfatt-mappings";
import { downloadFile } from "@/services/project/format";

export function EasyfattXmlExport({ project, disabled = false }: { project: Project; disabled?: boolean }) {
  const [customer, setCustomer] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function exportXml() {
    if (!customer.trim()) { setError("Inserisci il nome del cliente."); return; }
    setBusy(true);
    try {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const xml = materialsEasyfattXml(project, await loadEasyfattMappings(), customer, date, customerCode);
      const name = project.name.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 100) || "progetto";
      downloadFile(`${name}-preventivo-easyfatt.xml`, new Blob([xml], { type: "application/xml;charset=utf-8" }));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Esportazione XML non riuscita.");
    } finally { setBusy(false); }
  }
  return <div>
    <label>Cliente per preventivo XML <input value={customer} maxLength={150} placeholder="Nome o ragione sociale" onChange={(event) => setCustomer(event.target.value)} /></label>{" "}
    <label>Codice cliente Easyfatt (facoltativo) <input value={customerCode} maxLength={100} placeholder="es. 125 (dall’anagrafica Easyfatt)" onChange={(event) => setCustomerCode(event.target.value)} /></label>{" "}
    <button type="button" className="bottone tenue piccolo" disabled={disabled || busy} onClick={() => void exportXml()}>Materiali per Danea Easyfatt · XML</button>
    {error && <p role="alert">{error}</p>}
    <p className="nota">L’XML crea un nuovo preventivo. In Easyfatt usa Documenti → Utilità → Importa documenti Easyfatt-XML; verifica cliente, prezzi e IVA. Il codice cliente è il numero dell’anagrafica Easyfatt: se lo inserisci il preventivo si collega a quel cliente già esistente; se lo lasci vuoto Easyfatt potrebbe proporre una nuova anagrafica.</p>
  </div>;
}
