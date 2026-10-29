import { useEffect, useState } from "react";
import styles from "./PlanImportWizard.module.css";

const activation =
  '$staianoPython312 = py -3.12 -c "import sys; print(sys.executable)"\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\\deploy\\setup-plan-recognizer.ps1" -Python $staianoPython312';
export function PlanAiStatus({ notes = [] }: { notes?: string[] }) {
  const [status, setStatus] = useState<{
      state: string;
      message: string;
    } | null>(null),
    [model, setModel] = useState<boolean | null>(null),
    [loading, setLoading] = useState(false),
    [copied, setCopied] = useState<"idle" | "copied" | "manual">("idle");
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch("/api/import/reconstruct", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw Error();
          setStatus(await response.json());
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setStatus({
              state: "error",
              message:
                "Stato del servizio non disponibile: ripeti la verifica.",
            });
        }),
      fetch("/models/floorplan-unet.onnx", {
        method: "HEAD",
        signal: controller.signal,
      })
        .then((r) => setModel(r.ok))
        .catch(() => {
          if (!controller.signal.aborted) setModel(false);
        }),
    ]);
    return () => controller.abort();
  }, []);
  // Durante la preparazione automatica il server si aggiorna da solo: riprova finché non finisce.
  useEffect(() => {
    if (status?.state !== "preparing") return;
    const timer = setInterval(() => {
      void fetch("/api/import/reconstruct", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((next) => next && setStatus(next))
        .catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [status?.state]);
  async function check() {
    setLoading(true);
    try {
      const response = await fetch("/api/import/reconstruct?check=1", {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw Error();
      setStatus(await response.json());
    } catch {
      setStatus({
        state: "error",
        message:
          "Verifica non riuscita. Controlla che Staiano sia avviato sul PC server e riprova.",
      });
    } finally {
      setLoading(false);
    }
  }
  return (
    <details className={styles.analysisOptions}>
      <summary>
        Stato AI ·{" "}
        {status?.state === "ready"
          ? "pronta"
          : status?.state === "preparing"
            ? "in preparazione"
            : status?.state === "installed"
              ? "installata"
              : status?.state === "busy"
                ? "in uso"
                : status?.state === "error"
                  ? "verifica non riuscita"
                  : status
                    ? "da attivare"
                    : "controllo…"}
      </summary>
      <p className={styles.notice}>
        {notes.some((n) => n.includes("Segmentazione AI locale"))
          ? "Rilevamento nel browser: AI locale in uso."
          : model === true
            ? "Rilevamento nel browser: modello AI locale disponibile."
            : model === false
              ? "Rilevamento nel browser: analisi geometrica disponibile; modello AI locale non raggiungibile."
              : "Controllo del modello locale…"}
      </p>
      <p className={styles.notice} role="status">
        {loading
          ? "Verifica di Python e dipendenze AI…"
          : (status?.message ?? "Controllo della ricostruzione avanzata…")}
      </p>
      <button
        type="button"
        className="bottone piccolo tenue"
        disabled={loading}
        onClick={() => void check()}
      >
        Verifica AI
      </button>
      {status?.state !== "preparing" && (
        <>
          <h3>Attivazione manuale</h3>
          <p className={styles.notice}>
            Di norma il server prepara da solo la ricostruzione avanzata e, se
            il modello cambia, sostituisce quello vecchio. Questi passaggi
            servono solo se la preparazione automatica non riesce.
          </p>
          <ol className={styles.notice}>
            <li>
              Sul PC che esegue Staiano installa Python 3.12. Su iPad il
              riconoscitore avanzato usa quel PC.
            </li>
            <li>
              Apri PowerShell nella cartella del server contenente{" "}
              <code>deploy</code> ed esegui il comando seguente. La procedura
              prepara il runtime e scarica modello e dipendenze locali (diversi
              GB). Con il programma EXE, la cartella è <code>runtime</code>{" "}
              accanto all’eseguibile.
            </li>
            <li>
              Torna qui e premi Verifica AI. Il riconoscitore parte su
              richiesta: non occorre avviare un servizio Windows separato.
            </li>
          </ol>
          <pre className={styles.aiCommand}>{activation}</pre>
          <button
            type="button"
            className="bottone piccolo tenue"
            onClick={() => {
              void (async () => {
                try {
                  await navigator.clipboard.writeText(activation);
                  setCopied("copied");
                } catch {
                  setCopied("manual");
                }
              })();
            }}
          >
            {copied === "copied"
              ? "Comando copiato"
              : copied === "manual"
                ? "Seleziona e copia il comando qui sopra"
                : "Copia comando di attivazione"}
          </button>
        </>
      )}
    </details>
  );
}
