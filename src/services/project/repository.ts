import type { Project } from "@/schemas/project";
import { parseProject } from "./format";
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
    return raw
      .map(parseProject)
      .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async get(id: string) {
    const db = await this.db();
    const raw = await request(
      db.transaction("projects").objectStore("projects").get(id),
    );
    return raw ? parseProject(raw) : null;
  }
  async previous(id: string) {
    const db = await this.db();
    const raw = await request(
      db.transaction("previous").objectStore("previous").get(id),
    );
    return raw ? parseProject(raw) : null;
  }
  async save(project: Project) {
    const p = parseProject(project),
      db = await this.db(),
      tx = db.transaction(["projects", "previous"], "readwrite"),
      done = completed(tx);
    const store = tx.objectStore("projects"),
      req = store.get(p.id);
    req.onsuccess = () => {
      const old = req.result as Project | undefined;
      if (old && old.updatedAt !== p.updatedAt)
        tx.objectStore("previous").put(old, p.id);
      store.put(p, p.id);
    };
    await done;
  }
  async delete(id: string) {
    const db = await this.db(),
      tx = db.transaction(["projects", "previous", "meta"], "readwrite"),
      done = completed(tx);
    tx.objectStore("projects").delete(id);
    tx.objectStore("previous").delete(id);
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
