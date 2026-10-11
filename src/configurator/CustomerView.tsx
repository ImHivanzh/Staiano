"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { ArrowsOut } from "@phosphor-icons/react";
import { projectSchema } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { installationLabels } from "@/domain/installations";
import styles from "./CustomerView.module.css";

const Viewer3D = dynamic(() => import("./viewer3d/Viewer3D"), { ssr: false });
export function CustomerView() {
  const project = useProjectStore((state) => state.project);
  const activeFloor = useProjectStore((state) => state.activeFloorId);
  const [status, setStatus] = useState("In attesa del configuratore…");
  const [fullscreenError, setFullscreenError] = useState("");
  useEffect(() => {
    const token = window.location.hash.slice(1);
    if (!/^[a-f0-9-]{36}$/i.test(token)) return;
    const channel = new BroadcastChannel(`staiano-customer-${token}`);
    let lastSeen = 0;
    let lastRevision: number | undefined;
    let lastFloor: string | undefined;
    channel.onmessage = (event) => {
      if (event.data?.type === "closed") {
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
      lastRevision = event.data.revision;
      lastFloor = event.data.activeFloorId;
      const activeFloorId = next.floors.some(
        (floor) => floor.id === event.data.activeFloorId,
      )
        ? event.data.activeFloorId
        : next.floors[0].id;
      useProjectStore.setState((state) => ({
        project: next,
        activeFloorId,
        revision: state.revision + 1,
        presentation: true,
        selection: [],
        dirty: false,
      }));
      setStatus("Aggiornamento live");
    };
    channel.postMessage({ type: "ready" });
    const heartbeat = window.setInterval(() => {
      if (lastSeen && Date.now() - lastSeen > 10000)
        setStatus("Configuratore scollegato · ultima vista ricevuta");
      channel.postMessage({ type: "ready" });
    }, 4000);
    return () => {
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
      {fullscreenError && <p role="alert">{fullscreenError}</p>}
      <div className={styles.model}>
        {project ? (
          <Viewer3D key={project.id} readOnly />
        ) : (
          <div className={styles.waiting}>
            Apri “Vista cliente” dal configuratore.
            <p>
              Questa finestra mostra il progetto mentre viene modificato sul PC.
            </p>
          </div>
        )}
      </div>
      {project && (
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
