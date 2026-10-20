"use client";
import type { Project } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { ceilingFrontPose } from "@/domain/geometry/ceilings";

export function TerminalCeilingFront({
  project,
  id,
}: {
  project: Project;
  id: string;
}) {
  const terminal = project.airTerminals.find((t) => t.id === id)!;
  const room = project.rooms.find((r) => r.id === terminal.roomId)!;
  const { commit } = useProjectStore();
  if (terminal.mounting !== "wall" || !room.ceilingBands?.length) return null;
  return (
    <form
      key={`${id}-${terminal.ceilingBandId}-${terminal.ceilingEdge}`}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const bandId = String(data.get("band"));
        commit((p) => ({
          ...p,
          airTerminals: p.airTerminals.map((t) =>
            t.id === id
              ? bandId
                ? {
                    ...t,
                    ...ceilingFrontPose(
                      p,
                      { ...t, ceilingBandId: bandId },
                      t.position,
                      Number(data.get("edge")),
                    ),
                  }
                : { ...t, ceilingBandId: undefined, ceilingEdge: undefined }
              : t,
          ),
        }));
      }}
    >
      <fieldset disabled={terminal.locked}>
        <legend>Posa sul controsoffitto</legend>
        <label className="campo">
          <span>Fronte del ribassamento</span>
          <select name="band" defaultValue={terminal.ceilingBandId ?? ""}>
            <option value="">Parete della stanza</option>
            {room.ceilingBands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Lato della fascia</span>
          <select name="edge" defaultValue={terminal.ceilingEdge ?? 2}>
            <option value={2}>Fronte verso il centro stanza</option>
            <option value={1}>Testata finale</option>
            <option value={3}>Testata iniziale</option>
            <option value={0}>Lato parete</option>
          </select>
        </label>
        <button className="bottone piccolo">Applica posa sul fronte</button>
      </fieldset>
    </form>
  );
}
