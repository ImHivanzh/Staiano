"use client";
import { NotificationToast } from "./NotificationToast";
import { HostMaintenance } from "./HostMaintenance";
import { useEffect, useState, type FormEvent } from "react";
import { FloppyDisk, Key, UserPlus } from "@phosphor-icons/react";
import type { ManagedUser } from "@/server/auth";

export function AdminUsers({ username }: { username: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/users", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.message ?? "Utenti non disponibili.");
        setUsers(result.users);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Utenti non disponibili.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body = new URLSearchParams();
    fields.forEach((value, key) => body.set(key, String(value)));
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        body,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? "Operazione non riuscita.");
      form.reset();
      setUsers(result.users);
      setMessage(result.message);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Operazione non riuscita.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="pagina admin-utenti">
      <h2>Gestione utenti</h2>
      <p className="nota">
        Crea account personali e imposta le password iniziali. Ogni utente
        sceglie una password personale al primo accesso.
      </p>
      {error && <NotificationToast message={error} />}
      {message && <NotificationToast message={message} tone="info" />}
      {busy && <p role="status">Aggiornamento utenti…</p>}
      <div className="gestione-utenti">
        <section aria-label="Nuovo utente">
          <h3>Crea utente</h3>
          <form onSubmit={submit}>
            <input type="hidden" name="action" value="create" />
            <fieldset disabled={busy}>
              <label className="campo">
                Nome utente
                <input
                  name="username"
                  required
                  minLength={2}
                  maxLength={40}
                  pattern={"[A-Za-z0-9][A-Za-z0-9._\\-]{1,39}"}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </label>
              <label className="campo">
                Nome visualizzato
                <input
                  name="displayName"
                  required
                  maxLength={80}
                  autoComplete="off"
                />
              </label>
              <label className="campo">
                Password iniziale
                <input
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={256}
                  autoComplete="new-password"
                />
              </label>
              <label className="campo">
                Ripeti password iniziale
                <input
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={12}
                  maxLength={256}
                  autoComplete="new-password"
                />
              </label>
              <p className="nota">
                Password di 12–256 caratteri. Il nuovo account può usare il
                configuratore; la gestione utenti resta riservata all’admin.
              </p>
              <button className="bottone" type="submit">
                <UserPlus aria-hidden="true" />
                Crea utente
              </button>
            </fieldset>
          </form>
        </section>
        <section aria-label="Utenti configurati">
          <h3>Utenti configurati ({users.length})</h3>
          {users.map((user) => (
            <article
              className="utente-account"
              aria-label={`Utente ${user.username}`}
              key={user.username}
            >
              <header>
                <strong>{user.displayName}</strong>
                <span className="nota">
                  {user.role === "admin" ? "Admin" : "Operatore"}
                </span>
              </header>
              <p className="nota">
                {user.username} ·{" "}
                {user.disabled
                  ? "Disabilitato"
                  : user.mustChangePassword
                    ? "Cambio password richiesto"
                    : "Attivo"}
              </p>
              {user.username === username ? (
                <a className="fonte-catalogo" href="/accedi?password=change">
                  Cambia la tua password
                </a>
              ) : (
                <details>
                  <summary>
                    <Key aria-hidden="true" /> Imposta password
                  </summary>
                  <form onSubmit={submit}>
                    <input type="hidden" name="action" value="reset" />
                    <input
                      type="hidden"
                      name="username"
                      value={user.username}
                    />
                    <fieldset disabled={busy || user.disabled}>
                      <label className="campo">
                        Nuova password per {user.username}
                        <input
                          name="password"
                          type="password"
                          required
                          minLength={12}
                          maxLength={256}
                          autoComplete="new-password"
                        />
                      </label>
                      <label className="campo">
                        Ripeti password per {user.username}
                        <input
                          name="confirmPassword"
                          type="password"
                          required
                          minLength={12}
                          maxLength={256}
                          autoComplete="new-password"
                        />
                      </label>
                      <p className="nota">
                        Il reset chiude le sessioni di questo utente e richiede
                        il cambio password al prossimo accesso.
                      </p>
                      <button className="bottone piccolo" type="submit">
                        <FloppyDisk aria-hidden="true" />
                        Salva password
                      </button>
                    </fieldset>
                  </form>
                </details>
              )}
            </article>
          ))}
        </section>
      </div>
      <HostMaintenance />
    </main>
  );
}
