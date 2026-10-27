"use client";
import { NotificationToast } from "./NotificationToast";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  ArrowsOut,
  Cube,
  Fire,
  Path,
  Power,
  Presentation,
  Thermometer,
} from "@phosphor-icons/react";
import { projectSchema } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { installationLabels } from "@/domain/installations";
import styles from "./CustomerView.module.css";
import { StoveCatalog } from "./systems/StoveCatalog";
import { CustomerPresentation } from "./CustomerPresentation";
import { loadProjectCatalogs } from "@/services/project/catalogs";
import {
  customerCameraSchema,
  useCustomerCamera,
} from "./viewer3d/customer-camera";
import {
  customerViewSchema,
  useCustomerView,
  type CustomerViewState,
} from "./viewer3d/customer-view-state";

const Viewer3D = dynamic(() => import("./viewer3d/Viewer3D"), { ssr: false });
export function CustomerView() {
  const project = useProjectStore((state) => state.project);
  const activeFloor = useProjectStore((state) => state.activeFloorId);
  const [status, setStatus] = useState("In attesa del configuratore…");
  const [fullscreenError, setFullscreenError] = useState("");
  const [showStoves, setShowStoves] = useState(false);
  const view = useCustomerView();
  const link = useRef<BroadcastChannel | null>(null);
  // Cambio dalla TV: vale subito qui e viene comunicato al PC.
  const change = (next: Partial<CustomerViewState>) => {
    useCustomerView.setState(next);
    const { systemOn, comfort, tour, explain } = useCustomerView.getState();
    link.current?.postMessage({
      type: "view",
      view: { systemOn, comfort, tour, explain },
    });
  };
  useEffect(() => {
    const token = window.location.hash.slice(1);
    if (!/^[a-f0-9-]{36}$/i.test(token)) return;
    const channel = new BroadcastChannel(`staiano-customer-${token}`);
    link.current = channel;
    let lastSeen = 0;
    let lastRevision: number | undefined;
    let lastFloor: string | undefined;
    let generation = 0;
    let closed = false;
    channel.onmessage = (event) => {
      if (event.data?.type === "camera") {
        const parsed = customerCameraSchema.safeParse(event.data.camera);
        if (parsed.success) useCustomerCamera.setState({ camera: parsed.data });
        return;
      }
      if (event.data?.type === "view") {
        const parsed = customerViewSchema.safeParse(event.data.view);
        if (parsed.success) useCustomerView.setState(parsed.data);
        return;
      }
      if (event.data?.type === "closed") {
        generation++;
        setStatus("Configuratore scollegato · ultima vista ricevuta");
        return;
      }
      if (event.data?.type !== "snapshot") return;
      lastSeen = Date.now();
      setStatus("Aggiornamento live");
      if (
        lastRevision === event.data.revision &&
        lastFloor === event.data.activeFloorId
      )
        return;
      if (event.data.project === null) {
        generation++;
        useProjectStore.setState({ project: null });
        setStatus("Nessun progetto aperto");
        return;
      }
      const parsed = projectSchema.safeParse(event.data.project);
      if (!parsed.success) {
        setStatus("Aggiornamento non valido · ultima vista ricevuta");
        return;
      }
      const next = parsed.data;
      const revision = event.data.revision;
      const floor = event.data.activeFloorId;
      const update = ++generation;
      const activeFloorId = next.floors.some(
        (floor) => floor.id === event.data.activeFloorId,
      )
        ? event.data.activeFloorId
        : next.floors[0].id;
      void loadProjectCatalogs(next)
        .then(() => {
          if (closed || generation !== update) return;
          lastRevision = revision;
          lastFloor = floor;
          useProjectStore.setState((state) => ({
            project: next,
            activeFloorId,
            revision: state.revision + 1,
            presentation: true,
            selection: [],
            dirty: false,
          }));
          setStatus("Aggiornamento live");
        })
        .catch(() => {
          if (!closed && generation === update)
            setStatus(
              "Catalogo storico non disponibile · ultima vista ricevuta",
            );
        });
    };
    channel.postMessage({ type: "ready" });
    const heartbeat = window.setInterval(() => {
      if (lastSeen && Date.now() - lastSeen > 10000)
        setStatus("Configuratore scollegato · ultima vista ricevuta");
      channel.postMessage({ type: "ready" });
    }, 4000);
    return () => {
      closed = true;
      link.current = null;
      clearInterval(heartbeat);
      channel.close();
    };
  }, []);
  return (
    <main className={styles.customer}>
      <header className={styles.header}>
        <Image
          src="/logo.svg"
          alt="Termoidraulica Staiano"
          width={116}
          height={40}
        />
        <div>
          <h1>{project?.name ?? "Vista cliente"}</h1>
          <p role="status">{status}</p>
        </div>
        <button
          type="button"
          className="bottone piccolo tenue"
          aria-pressed={showStoves}
          onClick={() => setShowStoves((value) => !value)}
        >
          {showStoves ? (
            <Cube aria-hidden="true" />
          ) : (
            <Fire aria-hidden="true" />
          )}{" "}
          {showStoves ? "Mostra progetto" : "Catalogo stufe"}
        </button>
        <button
          className="bottone piccolo tenue"
          onClick={() => {
            const action = document.fullscreenElement
              ? document.exitFullscreen()
              : document.documentElement.requestFullscreen();
            void action.catch(() =>
              setFullscreenError(
                "Schermo intero non disponibile. Usa il comando del browser.",
              ),
            );
          }}
        >
          <ArrowsOut aria-hidden="true" /> Schermo intero
        </button>
      </header>
      {fullscreenError && <NotificationToast message={fullscreenError} />}
      <div className={showStoves ? styles.catalog : styles.model}>
        {showStoves ? (
          <StoveCatalog />
        ) : project ? (
          <>
            <Viewer3D key={project.id} readOnly />
            {view.explain && <CustomerPresentation project={project} />}
          </>
        ) : (
          <div className={styles.waiting}>
            Apri “Vista cliente” dal configuratore.
            <p>
              Questa finestra mostra il progetto mentre viene modificato sul PC.
            </p>
          </div>
        )}
      </div>
      {project && !showStoves && (
        <nav className={styles.controls} aria-label="Comandi presentazione">
          <button
            type="button"
            aria-pressed={view.systemOn}
            onClick={() => change({ systemOn: !view.systemOn })}
          >
            <Power aria-hidden="true" />
            Impianto {view.systemOn ? "acceso" : "spento"}
          </button>
          <button
            type="button"
            aria-label="Aria fresca o calore"
            aria-pressed={view.comfort === "heat"}
            onClick={() =>
              change({ comfort: view.comfort === "heat" ? "cool" : "heat" })
            }
          >
            <Thermometer aria-hidden="true" />
            {view.comfort === "heat" ? "Calore" : "Aria fresca"}
          </button>
          <button
            type="button"
            aria-pressed={view.tour}
            onClick={() => change({ tour: !view.tour })}
          >
            <Path aria-hidden="true" />
            {view.tour ? "Ferma tour" : "Tour del progetto"}
          </button>
          <button
            type="button"
            aria-pressed={view.explain}
            onClick={() => change({ explain: !view.explain })}
          >
            <Presentation aria-hidden="true" />
            Presentazione
          </button>
        </nav>
      )}
      {project && !showStoves && (
        <footer className={styles.footer}>
          <span>
            {project.floors.find((floor) => floor.id === activeFloor)?.name}
          </span>
          {project.installations.map((item) => (
            <span key={item.id}>
              {item.name} · {installationLabels[item.type]}
            </span>
          ))}
          <small>Finiture illustrative · modello di progetto</small>
        </footer>
      )}
    </main>
  );
}
