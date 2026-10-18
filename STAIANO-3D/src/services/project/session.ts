import { useProjectStore } from "@/stores/project-store";
import { ProjectConflictError } from "./repository";
import { SharedProjectRepository } from "./shared-repository";
export let repository = new SharedProjectRepository();
export function configureProjectSession(username: string) {
  repository = new SharedProjectRepository(
    username === "admin"
      ? "staiano-hvac-v1"
      : `staiano-hvac-v1-user-${username}`,
  );
}
let saving = Promise.resolve();
export function saveCurrent() {
  const { project, revision, dirty, saveStatus } = useProjectStore.getState();
  if (!project || (!dirty && saveStatus === "saved")) return Promise.resolve();
  const destination = repository;
  const task = saving
    .catch(() => {})
    .then(async () => {
      await destination.save(project);
      await destination.setActiveId(project.id);
      useProjectStore.getState().markSaved(revision);
    });
  saving = task;
  return task.catch((error) => {
    if (useProjectStore.getState().project?.id === project.id)
      useProjectStore.setState({
        saveStatus: "error",
        saveConflict: error instanceof ProjectConflictError,
        error:
          error instanceof ProjectConflictError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Salvataggio fallito. Esportare il progetto per conservarlo.",
      });
    throw error;
  });
}
export async function flushSave() {
  if (useProjectStore.getState().dirty) await saveCurrent();
  await saving;
}

export async function settlePendingSaves() {
  let pending: Promise<void>;
  do {
    pending = saving;
    await pending.catch(() => {});
  } while (pending !== saving);
  saving = Promise.resolve();
}
