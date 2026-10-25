import type { Project } from "@/schemas/project";
import { prepareProject } from "./format";
export class ProjectConflictError extends Error {
  constructor() {
    super(
      "Il progetto è stato modificato o eliminato in un’altra scheda. Salva una copia delle tue modifiche oppure carica la versione nell’archivio.",
    );
    this.name = "ProjectConflictError";
  }
}
type SavedVersion = { revision: string | null; updatedAt: string | null };
export interface ProjectRepository {
  list(): Promise<Project[]>;
  get(id: string): Promise<Project | null>;
  save(project: Project): Promise<void>;
  delete(id: string): Promise<void>;
  previous(id: string): Promise<Project | null>;
  lastActiveId(): Promise<string | null>;
  setActiveId(id: string): Promise<void>;
}
const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error("Archivio locale non accessibile."));
  });
const completed = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(
        new Error(
          "Salvataggio locale fallito. Esportare il progetto e controllare lo spazio disponibile.",
        ),
      );
  });
export class IndexedDbProjectRepository implements ProjectRepository {
  private connection: Promise<IDBDatabase> | null = null;
  private versions = new Map<string, SavedVersion>();
  constructor(private readonly databaseName = "staiano-hvac-v1") {}
  private db() {
    this.connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.databaseName, 1);
      req.onupgradeneeded = () => {
        for (const name of ["projects", "previous", "meta"])
          req.result.createObjectStore(name);
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => req.result.close();
        resolve(req.result);
      };
      req.onerror = () => {
        this.connection = null;
        reject(
          new Error(
            "IndexedDB non disponibile. Usare export per salvare il progetto.",
          ),
        );
      };
      req.onblocked = () =>
        reject(
          new Error(
            "Archivio bloccato da un'altra scheda. Chiudere le altre schede HVAC.",
          ),
        );
    });
    return this.connection;
  }
  async list() {
    const db = await this.db();
    const raw = await request(
      db.transaction("projects").objectStore("projects").getAll(),
    );
    return (await Promise.all(raw.map(prepareProject))).toSorted((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }
  async get(id: string) {
    const db = await this.db();
    const tx = db.transaction(["projects", "meta"]);
    const [raw, revision] = await Promise.all([
      request(tx.objectStore("projects").get(id)),
      request(tx.objectStore("meta").get(`revision:${id}`)),
    ]);
    if (raw || !this.versions.has(id))
      this.versions.set(id, {
        revision: revision ?? null,
        updatedAt: raw?.updatedAt ?? null,
      });
    return raw ? prepareProject(raw) : null;
  }
  async previous(id: string) {
    const db = await this.db();
    const raw = await request(
      db.transaction("previous").objectStore("previous").get(id),
    );
    return raw ? prepareProject(raw) : null;
  }
  async save(project: Project) {
    const expected = this.versions.get(project.id) ?? {
      revision: null,
      updatedAt: null,
    };
    const revision = crypto.randomUUID();
    let conflict = false;
    const p = await prepareProject(project),
      db = await this.db(),
      tx = db.transaction(["projects", "previous", "meta"], "readwrite"),
      done = completed(tx);
    const store = tx.objectStore("projects"),
      req = store.get(p.id);
    req.onsuccess = () => {
      const old = req.result as Project | undefined;
      const version = tx.objectStore("meta").get(`revision:${p.id}`);
      version.onsuccess = () => {
        if (
          (version.result ?? null) !== expected.revision ||
          (old?.updatedAt ?? null) !== expected.updatedAt
        ) {
          conflict = true;
          tx.abort();
          return;
        }
        if (old && old.updatedAt !== p.updatedAt)
          tx.objectStore("previous").put(old, p.id);
        store.put(p, p.id);
        tx.objectStore("meta").put(revision, `revision:${p.id}`);
      };
    };
    try {
      await done;
    } catch (error) {
      if (conflict) throw new ProjectConflictError();
      throw error;
    }
    this.versions.set(p.id, { revision, updatedAt: p.updatedAt });
  }
  async delete(id: string) {
    const db = await this.db(),
      tx = db.transaction(["projects", "previous", "meta"], "readwrite"),
      done = completed(tx);
    tx.objectStore("projects").delete(id);
    tx.objectStore("previous").delete(id);
    tx.objectStore("meta").delete(`revision:${id}`);
    const req = tx.objectStore("meta").get("active");
    req.onsuccess = () => {
      if (req.result === id) tx.objectStore("meta").delete("active");
    };
    await done;
  }
  async lastActiveId() {
    const db = await this.db();
    return (
      ((await request(
        db.transaction("meta").objectStore("meta").get("active"),
      )) as string | undefined) ?? null
    );
  }
  async setActiveId(id: string) {
    const db = await this.db(),
      tx = db.transaction("meta", "readwrite"),
      done = completed(tx);
    tx.objectStore("meta").put(id, "active");
    await done;
  }
}
