import { useProjectStore } from "@/stores/project-store";
import { IndexedDbProjectRepository } from "./repository";
export const repository = new IndexedDbProjectRepository();
let saving = Promise.resolve();
export function saveCurrent() {
  const { project, revision } = useProjectStore.getState();
  if (!project) return Promise.resolve();
  const task = saving
    .catch(() => {})
    .then(async () => {
      await repository.save(project);
      await repository.setActiveId(project.id);
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
