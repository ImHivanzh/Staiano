"use client";
import { removeInstallation, type Installation } from "@/domain/installations";
import { useProjectStore } from "@/stores/project-store";

export function DeleteInstallationButton({
  installation,
  onDeleted,
}: {
  installation: Installation | undefined;
  onDeleted: () => void;
}) {
  return (
    <button
      type="button"
      className="bottone piccolo pericolo"
      disabled={!installation}
      onClick={() => {
        if (
          !installation ||
          !window.confirm(
            `Eliminare ${installation.name} e tutti i suoi apparecchi, bocchette, plenum e canali? Gli altri impianti restano invariati. Puoi recuperarlo con Annulla.`,
          )
        )
          return;
        useProjectStore
          .getState()
          .commit((project) => removeInstallation(project, installation.id));
        if (!useProjectStore.getState().error) onDeleted();
      }}
    >
      Elimina impianto
    </button>
  );
}
