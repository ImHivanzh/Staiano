import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Project } from "@/schemas/project";

export class SharingError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}
export type AuditEntry = {
  at: string;
  username: string;
  action: string;
  revision: number;
};
export type SharedRecord = {
  project: Project;
  owner: string;
  members: string[];
  revision: number;
  previous: Project | null;
  audit: AuditEntry[];
  lease: { username: string; token: string; expires: number } | null;
};
export const LEASE_MS = 90_000;
export function accessible(record: SharedRecord, username: string) {
  return record.owner === username || record.members.includes(username);
}
export function requireAccess(
  record: SharedRecord | undefined,
  username: string,
): asserts record is SharedRecord {
  if (!record || !accessible(record, username))
    throw new SharingError("Progetto non disponibile.", 404);
}
export function acquireLease(
  record: SharedRecord,
  username: string,
  token: string,
  now = Date.now(),
) {
  requireAccess(record, username);
  if (
    record.lease &&
    record.lease.expires > now &&
    (record.lease.token !== token || record.lease.username !== username)
  )
    throw new SharingError(
      `Progetto in modifica da ${record.lease.username}. Riprova dopo il rilascio.`,
      423,
    );
  record.lease = { username, token, expires: now + LEASE_MS };
}
export function requireLease(
  record: SharedRecord,
  username: string,
  token: string,
  revision: number,
  now = Date.now(),
) {
  requireAccess(record, username);
  if (
    !record.lease ||
    record.lease.username !== username ||
    record.lease.token !== token ||
    record.lease.expires <= now
  )
    throw new SharingError(
      "Blocco di modifica scaduto. Ricarica il progetto prima di modificarlo.",
      423,
    );
  if (record.revision !== revision)
    throw new SharingError("Versione cambiata. Ricarica il progetto.", 409);
}
export function audit(record: SharedRecord, username: string, action: string) {
  record.audit.push({
    at: new Date().toISOString(),
    username,
    action,
    revision: record.revision,
  });
}
// An atomic filesystem lock also serializes requests across overlapping server builds.
export async function sharedTransaction<T>(
  operation: (records: Record<string, SharedRecord>) => T | Promise<T>,
  file = resolve(process.cwd(), ".cache/shared-projects.json"),
) {
  await mkdir(dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  let acquired = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await mkdir(lock);
      acquired = true;
      await writeFile(
        `${lock}/owner.json`,
        JSON.stringify({ pid: process.pid }),
      );
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const recovery = `${file}.recovery`;
      let recovering = false;
      try {
        await mkdir(recovery);
        recovering = true;
        try {
          const { pid } = JSON.parse(
            await readFile(`${lock}/owner.json`, "utf8"),
          );
          try {
            process.kill(pid, 0);
          } catch (failure) {
            if ((failure as NodeJS.ErrnoException).code === "ESRCH")
              await rm(lock, { recursive: true, force: true });
          }
        } catch {
          try {
            if (Date.now() - (await stat(lock)).mtimeMs > 60_000)
              await rm(lock, { recursive: true, force: true });
          } catch {
            /* Another transaction released it. */
          }
        }
      } catch {
        /* Another request is checking a stopped server's lock. */
      } finally {
        if (recovering) await rm(recovery, { recursive: true, force: true });
      }
      await new Promise((done) => setTimeout(done, 50));
    }
  }
  if (!acquired) throw new SharingError("Archivio occupato. Riprova.", 503);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    let records: Record<string, SharedRecord> = Object.create(null);
    try {
      records = Object.assign(
        Object.create(null),
        JSON.parse(await readFile(file, "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const result = await operation(records);
    await writeFile(temporary, JSON.stringify(records), { mode: 0o600 });
    await rename(temporary, file);
    return result;
  } finally {
    await rm(temporary, { force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
