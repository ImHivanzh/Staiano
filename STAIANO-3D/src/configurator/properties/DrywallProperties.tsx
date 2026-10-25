"use client";
import { useMemo, useState } from "react";
import type { Project, Wall } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { setWallDrywall } from "@/domain/geometry/drywall";
import { drywallSideForRoom } from "@/domain/geometry/drywall-sides";
import { formatNumber } from "@/utils/format";

export function DrywallProperties({
  project,
  wall,
}: {
  project: Project;
  wall: Wall;
}) {
  const rooms = project.rooms.filter((r) => r.wallIds.includes(wall.id));
  const [roomId, setRoomId] = useState(
    wall.drywall?.roomId ?? rooms[0]?.id ?? "",
  );
  if (!rooms.length) return null;
  return (
    <details className="azione-inspector" data-testid="drywall-properties">
      <summary>Cartongesso e vuoto per i canali</summary>
      <fieldset disabled={wall.locked}>
        <label className="campo">
          <span>Lato stanza del cartongesso</span>
          <select
            name="room"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <DrywallSideForm
          key={`${roomId}-${JSON.stringify(wall.drywall)}`}
          project={project}
          wall={wall}
          roomId={roomId}
        />
      </fieldset>
    </details>
  );
}

function DrywallSideForm({
  project,
  wall,
  roomId,
}: {
  project: Project;
  wall: Wall;
  roomId: string;
}) {
  const { commit } = useProjectStore();
  const savedOffset = drywallSideForRoom(wall, roomId)?.offsetM ?? 0;
  const [intent, setIntent] = useState(savedOffset < 0 ? "existing" : "new");
  const [depthCm, setDepthCm] = useState(String(Math.abs(savedOffset) * 100));
  const offsetM = (Number(depthCm) / 100) * (intent === "existing" ? -1 : 1);
  const preview = useMemo(() => {
    try {
      const next = setWallDrywall(
        project,
        wall.id,
        offsetM ? { roomId, offsetM } : undefined,
        roomId,
      );
      return {
        room: next.rooms.find((room) => room.id === roomId),
        error: null,
      };
    } catch (error) {
      return {
        room: null,
        error:
          error instanceof Error ? error.message : "Profondità non valida.",
      };
    }
  }, [project, wall.id, roomId, offsetM]);
  const room = project.rooms.find((item) => item.id === roomId);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!preview.error)
          commit((p) =>
            setWallDrywall(
              p,
              wall.id,
              offsetM ? { roomId, offsetM } : undefined,
              roomId,
            ),
          );
      }}
    >
      <label className="campo">
        <span>Tipo di controparete</span>
        <select
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
        >
          <option value="new">Nuova controparete verso la stanza</option>
          <option value="existing">Fronte già disegnato · cavità dietro</option>
        </select>
      </label>
      <label className="campo">
        <span>Profondità del vuoto (cm)</span>
        <input
          name="depth"
          type="number"
          min="0"
          max="200"
          step="0.1"
          value={depthCm}
          onChange={(event) => setDepthCm(event.target.value)}
          required
        />
      </label>
      <p className="nota">
        {intent === "new"
          ? "Il nuovo fronte riduce lo spazio della stanza selezionata."
          : "Il fronte disegnato resta fermo; il vuoto si estende dietro la parete."}{" "}
        0 rimuove il cartongesso dal lato selezionato.
      </p>
      <p className="nota">
        L’intercapedine è vuota e disponibile per i canali. Ripeti
        l’impostazione per l’altro lato del muro condiviso; 0 rimuove il
        cartongesso dal lato selezionato.
      </p>
      {preview.error ? (
        <p role="alert">{preview.error}</p>
      ) : (
        room &&
        preview.room && (
          <p className="nota" role="status">
            Lato {room.name}: area {formatNumber(room.netAreaM2)} →{" "}
            {formatNumber(preview.room.netAreaM2)} m²; volume utile{" "}
            {formatNumber(room.volumeM3)} →{" "}
            {formatNumber(preview.room.volumeM3)} m³.
          </p>
        )
      )}
      <button className="bottone chiara" disabled={!!preview.error}>
        Applica lato stanza
      </button>
    </form>
  );
}
