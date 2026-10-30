import type { Project } from "@/schemas/project";
import { IndexedDbProjectRepository, ProjectConflictError } from "./repository";
import { MAX_PROJECT_BYTES, prepareProject } from "./format";
import { assertPayloadSize, PayloadTooLargeError } from "@/utils/payload-size";
export type SharedDetails = {
  project: Project;
  previous?: Project | null;
  revision: number;
  owner: string;
  members: string[];
  audit: { at: string; username: string; action: string; revision: number }[];
  editingBy?: string | null;
};
export async function sharedRequest(path = "", body?: object) {
  const response = await fetch(`/api/projects${path}`, {
    cache: "no-store",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: assertPayloadSize(
            JSON.stringify(body),
            MAX_PROJECT_BYTES,
            "Il progetto",
          ),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok) {
    const error =
      response.status === 409 || response.status === 423
        ? new ProjectConflictError()
        : new Error();
    error.message = result.message ?? "Archivio condiviso non disponibile.";
    throw error;
  }
  if (result.project) result.project = await prepareProject(result.project);
  if (result.previous) result.previous = await prepareProject(result.previous);
  if (Array.isArray(result.projects))
    result.projects = await Promise.all(result.projects.map(prepareProject));
  return result;
}
export class SharedProjectRepository extends IndexedDbProjectRepository {
  listError: string | null = null;
  readonly token = crypto.randomUUID();
  private shared = new Map<string, SharedDetails>();
  private readonlyIds = new Set<string>();
  isShared(id: string) {
    return this.shared.has(id);
  }
  isReadOnly(id: string) {
    return this.readonlyIds.has(id);
  }
  details(id: string) {
    return this.shared.get(id);
  }
  private notify() {
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("shared-project-access"));
  }
  async refresh(id: string) {
    const details: SharedDetails = await sharedRequest(
      `?id=${encodeURIComponent(id)}`,
    );
    const existing = this.shared.get(id);
    this.shared.set(
      id,
      existing
        ? {
            ...existing,
            owner: details.owner,
            members: details.members,
            audit: details.audit,
            previous: details.previous,
            editingBy: details.editingBy,
          }
        : details,
    );
    return details;
  }
  async openShared(details: SharedDetails) {
    const id = details.project.id;
    this.shared.set(id, details);
    try {
      this.shared.set(
        id,
        await sharedRequest("", { action: "acquire", id, token: this.token }),
      );
      this.readonlyIds.delete(id);
    } catch (error) {
      this.readonlyIds.add(id);
      this.notify();
      if (!(error instanceof ProjectConflictError)) throw error;
    }
    this.notify();
    return this.shared.get(id)!.project;
  }
  async publish(project: Project) {
    const details = await sharedRequest("", {
      action: "publish",
      id: project.id,
      project,
      token: this.token,
    });
    this.shared.set(project.id, details);
    this.readonlyIds.delete(project.id);
    await super.delete(project.id);
    await super.setActiveId(project.id);
    this.notify();
    return details;
  }
  async action(id: string, action: string, username?: string) {
    const details = this.shared.get(id);
    if (!details) throw new Error("Progetto non condiviso.");
    try {
      const updated = await sharedRequest("", {
        action,
        id,
        username,
        token: this.token,
        revision: details.revision,
      });
      if (action !== "release" && action !== "delete")
        this.shared.set(
          id,
          action === "renew"
            ? {
                ...this.shared.get(id)!,
                audit: updated.audit,
                members: updated.members,
              }
            : updated,
        );
      return updated;
    } catch (error) {
      if (error instanceof ProjectConflictError) {
        this.readonlyIds.add(id);
        this.notify();
      }
      throw error;
    }
  }
  async list() {
    const local = await super.list();
    try {
      const { projects } = await sharedRequest();
      this.listError = null;
      const ids = new Set(projects.map((p: Project) => p.id));
      return [...projects, ...local.filter((p) => !ids.has(p.id))].toSorted(
        (a: Project, b: Project) => b.updatedAt.localeCompare(a.updatedAt),
      );
    } catch {
      this.listError =
        "Archivio condiviso non disponibile. Sono visibili solo i progetti locali; quelli condivisi non sono stati cancellati.";
      return local.filter((p) => !this.isShared(p.id));
    }
  }
  async get(id: string) {
    let details: SharedDetails;
    try {
      if (!this.isShared(id)) {
        const { projects } = await sharedRequest();
        if (!projects.some((p: Project) => p.id === id)) return super.get(id);
      }
      details = await this.refresh(id);
    } catch (error) {
      if (this.isShared(id)) throw error;
      return super.get(id);
    }
    return this.openShared(details);
  }
  async save(project: Project) {
    if (!this.isShared(project.id)) return super.save(project);
    const details = this.shared.get(project.id)!;
    if (this.isReadOnly(project.id)) throw new ProjectConflictError();
    try {
      const updated = await sharedRequest("", {
        action: "save",
        id: project.id,
        token: this.token,
        revision: details.revision,
        project,
      });
      this.shared.set(project.id, { ...updated, previous: details.project });
    } catch (error) {
      // Un salvataggio troppo grande non è partito: il progetto resta modificabile.
      if (!(error instanceof PayloadTooLargeError)) {
        this.readonlyIds.add(project.id);
        this.notify();
      }
      throw error;
    }
  }
  async previous(id: string) {
    return this.isShared(id)
      ? ((await this.refresh(id)).previous ?? null)
      : super.previous(id);
  }
  async delete(id: string) {
    if (!this.isShared(id)) {
      if (await super.get(id)) return super.delete(id);
      await this.refresh(id);
      await this.openShared(this.shared.get(id)!);
    }
    await this.action(id, "delete");
    this.shared.delete(id);
    await super.delete(id);
  }
}
