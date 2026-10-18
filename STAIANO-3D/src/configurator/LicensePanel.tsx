"use client";
import { useEffect, useState, type FormEvent } from "react";
import { NotificationToast } from "./NotificationToast";

type LicenseStatusView = {
  ok: boolean;
  state: string;
  enforce: boolean;
  machineId: string;
  serverUrl: string;
  licenseId: string | null;
  customer: string | null;
  plan: string | null;
  expiresAt: number | null;
  lastVerifiedAt: number | null;
  activatedAt: number | null;
  message: string;
};

type LicenseSetupView = {
  enforced: boolean;
  serverUrl: string;
  publicKey: boolean;
  machineId: string;
  filePath: string;
  filePresent: boolean;
  toleranceMinutes: number;
  checkMinutes: number;
};

const stateLabels: Record<string, string> = {
  active: "Attiva",
  disabled: "Controllo disattivato",
  missing: "Nessuna licenza",
  unconfigured: "Server non configurato",
  invalid: "Licenza non valida",
  revoked: "Disattivata dal server",
  expired: "Scaduta",
  unreachable: "Server non raggiungibile",
  "update-required": "Aggiornamento obbligatorio",
  "seats-exhausted": "Già attiva altrove",
};

const formatDate = (value: number | null) =>
  value ? new Date(value).toLocaleString("it-IT") : "mai";

export function LicensePanel() {
  const [status, setStatus] = useState<LicenseStatusView | null>(null);
  const [setup, setSetup] = useState<LicenseSetupView | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/license", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.message ?? "Licenza non disponibile.");
        setStatus(result.status);
        setSetup(result.setup);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Licenza non disponibile.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, []);

  async function send(action: string, licenseKey?: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, licenseKey }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? "Operazione non riuscita.");
      setStatus(result.status);
      setSetup(result.setup);
      setMessage(
        action === "activate"
          ? "Licenza attivata su questa postazione."
          : action === "deactivate"
            ? "Postazione liberata: la licenza può essere attivata su un’altra macchina."
            : "Verifica della licenza eseguita.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Operazione non riuscita.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await send("activate", String(new FormData(form).get("licenseKey") ?? ""));
    form.reset();
  }

  return (
    <main className="pagina admin-utenti">
      <h2>Licenza</h2>
      <p className="nota">
        La licenza è legata a questa postazione: il server remoto rilascia un
        token firmato che viene verificato localmente e rinnovato
        periodicamente. Dalla revoca sul server il configuratore si blocca.
      </p>
      {error && <NotificationToast message={error} />}
      {message && <NotificationToast message={message} tone="info" />}
      {busy && <p role="status">Aggiornamento licenza…</p>}
      <div className="gestione-utenti">
        <section aria-label="Stato della licenza">
          <h3>Stato</h3>
          <p className="nota">
            <strong>
              {status
                ? (stateLabels[status.state] ?? status.state)
                : "Verifica in corso"}
            </strong>
            {status?.message ? ` — ${status.message}` : ""}
          </p>
          <p className="nota">
            Cliente: {status?.customer ?? "—"} · Piano: {status?.plan ?? "—"}
            <br />
            Licenza: {status?.licenseId ?? "—"}
            <br />
            Postazione: {status?.machineId ?? "—"}
            <br />
            Attivata il: {formatDate(status?.activatedAt ?? null)} · Ultima
            verifica: {formatDate(status?.lastVerifiedAt ?? null)}
            <br />
            Scadenza:{" "}
            {status?.expiresAt
              ? new Date(status.expiresAt * 1000).toLocaleDateString("it-IT")
              : "nessuna"}
          </p>
          <div>
            <button
              className="bottone piccolo"
              type="button"
              disabled={busy}
              onClick={() => void send("refresh")}
            >
              Verifica adesso
            </button>{" "}
            <button
              className="bottone tenue piccolo"
              type="button"
              disabled={busy || !setup?.filePresent}
              onClick={() => {
                if (
                  window.confirm(
                    "Disattivare la licenza su questa postazione? Il configuratore si bloccherà finché non viene attivata di nuovo.",
                  )
                )
                  void send("deactivate");
              }}
            >
              Disattiva questa postazione
            </button>
          </div>
        </section>
        <section aria-label="Attivazione licenza">
          <h3>Attiva una licenza</h3>
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              <label className="campo">
                Chiave di licenza
                <input
                  name="licenseKey"
                  required
                  maxLength={40}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="STAIANO-XXXXX-XXXXX-XXXXX-XXXXX"
                />
              </label>
              <button className="bottone" type="submit">
                Attiva su questa postazione
              </button>
            </fieldset>
          </form>
          <p className="nota">
            Server licenze: {setup?.serverUrl || "non configurato"}
            <br />
            Chiave pubblica di firma:{" "}
            {setup?.publicKey ? "presente" : "assente"}
            <br />
            Controllo:{" "}
            {setup?.enforced
              ? `attivo · verifica ogni ${setup.checkMinutes} min · tolleranza ${setup.toleranceMinutes} min`
              : "non attivo"}
            <br />
            File locale: {setup?.filePath ?? "—"}
          </p>
          {setup && !setup.enforced && (
            <p className="avviso attenzione">
              Il blocco non è attivo: impostare <code>LICENSE_ENFORCE=1</code>{" "}
              nell’ambiente del server per rendere la licenza obbligatoria.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
