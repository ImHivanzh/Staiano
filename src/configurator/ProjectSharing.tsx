"use client";
import { NotificationToast } from "./NotificationToast";
import { useEffect, useState } from "react";
import type { Project } from "@/schemas/project";
import {
  flushSave,
  repository,
  settlePendingSaves,
} from "@/services/project/session";
import {
  sharedRequest,
  type SharedDetails,
} from "@/services/project/shared-repository";
import { FullscreenDialog } from "./FullscreenDialog";
import { useProjectStore } from "@/stores/project-store";

export function ProjectSharing({
  project,
  username,
}: {
  project: Project;
  username: string;
}) {
  const [details, setDetails] = useState<SharedDetails | undefined>(() =>
    repository.details(project.id),
  );
  const [users, setUsers] = useState<
    { username: string; displayName: string }[]
  >([]);
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    void sharedRequest()
      .then((result) => {
        if (active) setUsers(result.users);
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      });
    const timer = window.setInterval(() => {
      if (!repository.isShared(project.id)) return;
      if (repository.isReadOnly(project.id)) {
        void repository
          .refresh(project.id)
          .then((latest) => {
            if (active) setDetails(latest);
          })
          .catch((failure) => {
            if (active) setError(failure.message);
          });
        return;
      }
      void repository
        .action(project.id, "renew")
        .then(() => {
          if (active) setDetails(repository.details(project.id));
        })
        .catch((failure) => {
          if (active) setError(failure.message);
        });
    }, 25_000);
    const destination = repository;
    const release = () => {
      if (!destination.isShared(project.id)) return;
      void fetch("/api/projects", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "release",
          id: project.id,
          token: destination.token,
        }),
      });
    };
    const pagehide = () => {
      void flushSave()
        .then(release)
        .catch(() => {});
    };
    window.addEventListener("pagehide", pagehide);
    const access = () => {
      if (active) setDetails(repository.details(project.id));
    };
    window.addEventListener("shared-project-access", access);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("shared-project-access", access);
      void settlePendingSaves().then(() => {
        if (useProjectStore.getState().project?.id !== project.id) release();
      });
    };
  }, [project.id, username]);
  async function act(action: string, user?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await flushSave();
      if (!repository.isShared(project.id)) await repository.publish(project);
      if (action !== "publish")
        await repository.action(project.id, action, user);
      setDetails(repository.details(project.id));
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Condivisione fallita.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="bottone piccolo tenue"
        onClick={() => setOpen(true)}
      >
        Condividi progetto
      </button>
      <FullscreenDialog
        open={open}
        title="Condivisione progetto"
        onClose={() => setOpen(false)}
        closeLabel="Chiudi"
      >
        <p>
          Un solo utente modifica alla volta. Le modifiche sono registrate sul
          server.
        </p>
        {error && <NotificationToast message={error} />}
        {details && (
          <p>
            Proprietario: {details.owner}
            {repository.isReadOnly(project.id)
              ? " · Sola lettura: progetto occupato"
              : " · Modifica riservata a questa scheda"}
          </p>
        )}
        {details && repository.isReadOnly(project.id) && (
          <button
            type="button"
            className="bottone"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const latest = await repository.get(project.id);
                if (latest && !repository.isReadOnly(project.id))
                  useProjectStore.getState().load(latest);
                else
                  setError(
                    "Progetto ancora occupato. Riprova dopo il rilascio.",
                  );
                setDetails(repository.details(project.id));
              } catch (failure) {
                setError((failure as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Ricarica e acquisisci modifica
          </button>
        )}
        {(!details || details.owner === username) && (
          <>
            <label>
              Utente registrato{" "}
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Scegli utente</option>
                {users
                  .filter((u) => u.username !== username)
                  .map((u) => (
                    <option key={u.username} value={u.username}>
                      {u.displayName} ({u.username})
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !target || repository.isReadOnly(project.id)}
              onClick={() => void act("share", target)}
            >
              Condividi
            </button>
            {details?.members.map((member) => (
              <p key={member}>
                {member}{" "}
                <button
                  type="button"
                  disabled={busy || repository.isReadOnly(project.id)}
                  onClick={() => void act("revoke", member)}
                >
                  Revoca
                </button>
              </p>
            ))}
          </>
        )}
        {details && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                try {
                  setDetails(await repository.refresh(project.id));
                } catch (failure) {
                  setError((failure as Error).message);
                }
              }}
            >
              Aggiorna registro
            </button>
            <ol>
              {details.audit.toReversed().map((entry, i) => (
                <li key={`${entry.at}-${i}`}>
                  {new Date(entry.at).toLocaleString("it-IT")} ·{" "}
                  {entry.username} · {entry.action} · v{entry.revision}
                </li>
              ))}
            </ol>
          </>
        )}
      </FullscreenDialog>
    </>
  );
}
