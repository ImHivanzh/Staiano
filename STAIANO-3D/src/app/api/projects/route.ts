import { NextRequest, NextResponse } from "next/server";
import {
  getAccessConfig,
  getSessionUser,
  isSameOrigin,
  managedUsers,
  SESSION_COOKIE,
} from "@/server/auth";
import {
  accessible,
  acquireLease,
  audit,
  requireAccess,
  requireLease,
  readSharedProjects,
  sharedTransaction,
  SharingError,
  type SharedRecord,
} from "@/server/project-sharing";
import { MAX_PROJECT_BYTES, parseProject } from "@/services/project/format";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function identity(request: NextRequest) {
  const config = await getAccessConfig();
  const user = getSessionUser(
    request.cookies.get(SESSION_COOKIE)?.value,
    config,
  );
  if (!user || user.mustChangePassword)
    throw new SharingError("Accesso richiesto.", 401);
  return { user, config };
}
function failure(error: unknown) {
  return NextResponse.json(
    {
      message:
        error instanceof SharingError
          ? error.message
          : "Archivio condiviso non disponibile.",
    },
    { status: error instanceof SharingError ? error.status : 500, headers },
  );
}
export async function GET(request: NextRequest) {
  try {
    const { user, config } = await identity(request);
    const id = request.nextUrl.searchParams.get("id");
    const records = await readSharedProjects();
    if (!id)
      return NextResponse.json(
        {
          projects: Object.values(records)
            .filter((r) => accessible(r, user.username))
            .map((r) => r.project),
          users: managedUsers(config)
            .filter((u) => !u.disabled)
            .map((u) => ({ username: u.username, displayName: u.displayName })),
        },
        { headers },
      );
    const record = records[id];
    requireAccess(record, user.username);
    return NextResponse.json(
      {
        project: record.project,
        previous: record.previous,
        owner: record.owner,
        members: record.members,
        revision: record.revision,
        audit: record.audit,
        editingBy:
          record.lease && record.lease.expires > Date.now()
            ? record.lease.username
            : null,
      },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request))
      throw new SharingError("Origine non consentita.", 403);
    const { user, config } = await identity(request);
    const reader = request.body?.getReader();
    if (!reader) throw new SharingError("Richiesta non valida.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PROJECT_BYTES) {
        await reader.cancel();
        throw new SharingError("Progetto troppo grande.", 413);
      }
      chunks.push(value);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new SharingError("Richiesta non valida.");
    }
    if (
      !body ||
      typeof body.id !== "string" ||
      body.id.length > 120 ||
      !body.id ||
      ["__proto__", "constructor", "prototype"].includes(body.id)
    )
      throw new SharingError("Identificativo non valido.");
    if (typeof body.token !== "string" || !/^[a-f0-9-]{36}$/.test(body.token))
      throw new SharingError("Sessione di modifica non valida.");
    const result = await sharedTransaction((records) => {
      let record = records[body.id];
      if (body.action === "publish") {
        if (record)
          throw new SharingError(
            "Progetto già condiviso. Ricaricalo dall’archivio.",
            409,
          );
        let project;
        try {
          project = parseProject(body.project);
        } catch {
          throw new SharingError("Progetto non valido.");
        }
        if (project.id !== body.id)
          throw new SharingError("Progetto non valido.");
        record = {
          project,
          owner: user.username,
          members: [],
          revision: 1,
          previous: null,
          lease: null,
          audit: [],
        } satisfies SharedRecord;
        acquireLease(record, user.username, body.token);
        audit(record, user.username, "Pubblicazione");
        records[body.id] = record;
      } else {
        requireAccess(record, user.username);
        if (body.action === "acquire")
          acquireLease(record, user.username, body.token);
        else if (body.action === "release") {
          if (
            record.lease?.token === body.token &&
            record.lease?.username === user.username
          )
            record.lease = null;
        } else if (body.action === "renew") {
          requireLease(record, user.username, body.token, record.revision);
          acquireLease(record, user.username, body.token);
        } else if (body.action === "save") {
          requireLease(record, user.username, body.token, body.revision);
          let project;
          try {
            project = parseProject(body.project);
          } catch {
            throw new SharingError("Progetto non valido.");
          }
          if (project.id !== body.id)
            throw new SharingError("Progetto non valido.");
          const changes: string[] = [];
          for (const key of Object.keys(project) as (keyof typeof project)[]) {
            if (
              key === "updatedAt" ||
              JSON.stringify(record.project[key]) ===
                JSON.stringify(project[key])
            )
              continue;
            const before = record.project[key],
              after = project[key];
            if (
              Array.isArray(before) &&
              Array.isArray(after) &&
              [...before, ...after].every(
                (entry) => entry && typeof entry === "object" && "id" in entry,
              )
            ) {
              const oldItems = new Map(
                before.map((entry) => [entry.id, JSON.stringify(entry)]),
              );
              const newItems = new Map(
                after.map((entry) => [entry.id, JSON.stringify(entry)]),
              );
              const added = [...newItems.keys()].filter(
                (id) => !oldItems.has(id),
              ).length;
              const removed = [...oldItems.keys()].filter(
                (id) => !newItems.has(id),
              ).length;
              const changed = [...newItems].filter(
                ([id, value]) => oldItems.has(id) && oldItems.get(id) !== value,
              ).length;
              changes.push(
                `${key}: +${added}, −${removed}, modificati ${changed}`,
              );
            } else
              changes.push(
                key === "name"
                  ? `nome: ${record.project.name} → ${project.name}`
                  : `${key}: modificato`,
              );
          }
          record.previous = record.project;
          record.project = project;
          record.revision++;
          acquireLease(record, user.username, body.token);
          audit(
            record,
            user.username,
            `Salvataggio${changes.length ? ` · ${changes.join("; ")}` : ""}`,
          );
        } else if (
          body.action === "share" ||
          body.action === "revoke" ||
          body.action === "delete"
        ) {
          if (record.owner !== user.username)
            throw new SharingError(
              "Solo il proprietario può gestire la condivisione.",
              403,
            );
          requireLease(record, user.username, body.token, body.revision);
          if (body.action === "delete") {
            delete records[body.id];
            return { deleted: true };
          }
          if (
            !managedUsers(config).some(
              (u) => u.username === body.username && !u.disabled,
            ) ||
            body.username === record.owner
          )
            throw new SharingError("Scegli un altro utente registrato.");
          record.members = record.members.filter(
            (name) => name !== body.username,
          );
          if (body.action === "share") record.members.push(body.username);
          audit(
            record,
            user.username,
            `${body.action === "share" ? "Condivisione" : "Revoca"}: ${body.username}`,
          );
        } else throw new SharingError("Operazione non valida.");
      }
      return {
        project: record.project,
        revision: record.revision,
        owner: record.owner,
        members: record.members,
        audit: record.audit,
      };
    });
    return NextResponse.json(result, { headers });
  } catch (error) {
    return failure(error);
  }
}
