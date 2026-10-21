"use client";
import type { Project, Wall } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { setWallDrywall } from "@/domain/geometry/drywall";

export function DrywallProperties({
  project,
  wall,
}: {
  project: Project;
  wall: Wall;
}) {
  const { commit } = useProjectStore();
  const rooms = project.rooms.filter((r) => r.wallIds.includes(wall.id));
  if (!rooms.length) return null;
  return (
    <details className="azione-inspector" data-testid="drywall-properties">
      <summary>Cartongesso e vuoto per i canali</summary>
      <form
        key={JSON.stringify(wall.drywall)}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const offsetM = Number(data.get("offset")) / 100;
          commit((p) =>
            setWallDrywall(
              p,
              wall.id,
              offsetM
                ? { roomId: String(data.get("room")), offsetM }
                : undefined,
            ),
          );
        }}
      >
        <fieldset disabled={wall.locked}>
          <label className="campo">
            <span>Lato stanza del cartongesso</span>
            <select
              name="room"
              defaultValue={wall.drywall?.roomId ?? rooms[0].id}
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Scostamento cartongesso (cm)</span>
            <input
              name="offset"
              type="number"
              min="-200"
              max="200"
              step="0.1"
              defaultValue={(wall.drywall?.offsetM ?? 0) * 100}
              required
            />
          </label>
          <p className="nota">
            +30: nuovo fronte 30 cm verso la stanza. −30: la pianta mostra già
            il fronte, con 30 cm di vuoto dietro. 0 rimuove il cartongesso.
          </p>
          <p className="nota">
            L’intercapedine è vuota e disponibile per i canali. Imposta anche le
            pareti laterali per proseguire attorno agli angoli; restano attivi
            diametro e raggio minimo dei tubi.
          </p>
          <button className="bottone chiara">Applica cartongesso</button>
        </fieldset>
      </form>
    </details>
  );
}
