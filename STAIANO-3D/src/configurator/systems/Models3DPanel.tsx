"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { model3dCatalog } from "@/domain/catalogs/models3d";

const ModelPreview = dynamic(() => import("../viewer3d/ModelPreview"), {
  ssr: false,
});
const dimensions = (values: number[]) =>
  values
    .map((n) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 }))
    .join(" × ");

export function Models3DPanel() {
  const [id, setId] = useState(model3dCatalog.models[0].id);
  const [preview, setPreview] = useState(false);
  const model = model3dCatalog.models.find((item) => item.id === id)!;
  return (
    <section className="catalogo-scheda">
      <h3>Modelli 3D ufficiali · Cordivari</h3>
      <p className="nota">
        Quando manca un modello originale verificato, il progetto usa una
        ricostruzione dimensionale: ingombri dalle schede, dettagli e materiali
        illustrativi. Una mesh con quote discordanti resta disponibile in
        anteprima; non viene deformata per adattarla al progetto. Le foto
        ufficiali mostrano l’aspetto reale della serie scelta.
      </p>
      <p className="nota">
        {model3dCatalog.models.length} modelli Ardesia, 2–6 colonne. OBJ
        originali convertiti in GLB locale, in metri. Geometria conservata,
        materiale tecnico neutro.
      </p>
      <label className="campo">
        <span>Modello 3D</span>
        <select
          aria-label="Modello 3D"
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          {model3dCatalog.models.map((item) => (
            <option key={item.id} value={item.id}>
              Ardesia {item.columns} colonne · {item.elements} elementi · H{" "}
              {item.nominalDimensionsMm[1]} mm
            </option>
          ))}
        </select>
      </label>
      <p>
        Ingombro mesh:{" "}
        <strong data-testid="model-measured">
          {dimensions(model.measuredDimensionsMm)} mm
        </strong>
        <br />
        Ingombro catalogo con tappi: {dimensions(model.nominalDimensionsMm)} mm
      </p>
      {model.dimensionStatus === "review" && (
        <p className="nota" role="status">
          Quote da verificare: il modello include geometrie con ingombro diverso
          dal catalogo. Disponibile in anteprima; non sostituisce l’ingombro
          tecnico nel progetto.
        </p>
      )}
      <div className="azioni">
        <button
          className="bottone piccolo"
          onClick={() => setPreview(!preview)}
        >
          {preview ? "Chiudi anteprima modello" : "Apri anteprima modello"}
        </button>
        <a className="bottone piccolo chiara" href={model.localUrl} download>
          Scarica GLB locale
        </a>
        <a
          className="fonte-catalogo"
          href={model.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          OBJ originale Cordivari
        </a>
      </div>
      {preview && <ModelPreview url={model.localUrl} />}
      <p className="nota">
        {model.revision} · {(model.glbBytes / 1_000_000).toFixed(2)} MB · SHA256{" "}
        {model.sourceSha256.slice(0, 12)}…<br />
        File pubblici per progettazione. Licenza di redistribuzione non
        dichiarata: verificare i diritti prima di una distribuzione pubblica
        dell’app.
      </p>
    </section>
  );
}
