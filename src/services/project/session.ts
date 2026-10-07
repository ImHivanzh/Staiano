import { useProjectStore } from "@/stores/project-store";
import { IndexedDbProjectRepository } from "./repository";
export let repository = new IndexedDbProjectRepository();
export function configureProjectSession(username: string) {
  repository = new IndexedDbProjectRepository(
    username === "admin"
      ? "staiano-hvac-v1"
      : `staiano-hvac-v1-user-${username}`,
  );
}
let saving = Promise.resolve();
export function saveCurrent() {
  const { project, revision } = useProjectStore.getState();
  if (!project) return Promise.resolve();
  const destination = repository;
  const task = saving
    .catch(() => {})
    .then(async () => {
      await destination.save(project);
      await destination.setActiveId(project.id);
      useProjectStore.getState().markSaved(revision);
    });
  saving = task;
  return task.catch(() => {
    useProjectStore.setState({
      saveStatus: "error",
      error:
        "Salvataggio locale fallito. Esportare il progetto per conservarlo.",
    });
    throw new Error("Salvataggio locale fallito.");
  });
}
export async function flushSave() {
  if (useProjectStore.getState().dirty) await saveCurrent();
  await saving;
}
