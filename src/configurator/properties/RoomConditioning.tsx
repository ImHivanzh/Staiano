"use client";
import { useState } from "react";
import type { Room } from "@/schemas/project";
import { updateRoom } from "@/domain/project";
import { useProjectStore } from "@/stores/project-store";

export function RoomConditioning({ room }: { room: Room }) {
  const { commit } = useProjectStore();
  const [excluded, setExcluded] = useState(!!room.conditioningExclusion);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        commit((p) =>
          updateRoom(p, room.id, {
            conditioningExclusion: excluded
              ? { reason: String(data.get("reason")).trim() }
              : undefined,
          }),
        );
      }}
    >
      <label className="campo">
        <span>
          <input
            type="checkbox"
            checked={excluded}
            onChange={(event) => setExcluded(event.target.checked)}
          />{" "}
          Ambiente non climatizzato
        </span>
      </label>
      {excluded && (
        <label className="campo">
          <span>Motivo esclusione</span>
          <input
            name="reason"
            defaultValue={room.conditioningExclusion?.reason ?? ""}
            maxLength={500}
            required
          />
        </label>
      )}
      <p className="nota">
        L’esclusione azzera il fabbisogno da dimensionare e conserva superficie,
        volume e apparecchi. Eventuali impianti ancora associati vengono
        segnalati nei controlli.
      </p>
      <button className="bottone piccolo">
        Applica climatizzazione ambiente
      </button>
    </form>
  );
}
