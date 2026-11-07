"use client";
import { useState } from "react";
import { NotificationToast } from "./NotificationToast";

const ACTIONS = [
  {
    action: "anydesk",
    label: "Riavvia AnyDesk",
    confirm: "Riavviare AnyDesk sul server? La connessione remota cade per qualche secondo.",
  },
  {
    action: "reboot",
    label: "Riavvia il computer",
    confirm: "Riavviare l’intero computer del server? Staiano e tutti i programmi si chiudono.",
  },
] as const;

export function HostMaintenance() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function run(action: string, confirmation: string) {
    if (busy || !window.confirm(confirmation)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/host", {
        method: "POST",
        body: new URLSearchParams({ action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Richiesta non riuscita.");
      setMessage(result.message);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Richiesta non riuscita.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Manutenzione del server">
      <h3>Manutenzione del server</h3>
      <p className="nota">
        Esegue il comando sul computer che ospita Staiano. Parte entro 5
        minuti, con il prossimo controllo aggiornamenti.
      </p>
      {error && <NotificationToast message={error} />}
      {message && <NotificationToast message={message} tone="info" />}
      {ACTIONS.map(({ action, label, confirm }) => (
        <button
          className="bottone piccolo"
          type="button"
          key={action}
          disabled={busy}
          onClick={() => void run(action, confirm)}
        >
          {label}
        </button>
      ))}
    </section>
  );
}
