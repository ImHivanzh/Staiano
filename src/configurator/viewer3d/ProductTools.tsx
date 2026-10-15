"use client";
import type { Project, Room, Wall } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import styles from "./ProductTools.module.css";
export type ProductTool = "radiator" | "split" | "terminal" | "machine";
export type ProductToolsProps = {
  type: ProductTool;
  project: Project;
  activeFloorId: string;
  selectedRoom?: Room;
  selectedWall?: Wall;
  onClose: () => void;
};
export function ProductTools({ type, onClose }: ProductToolsProps) {
  return (
    <aside className={styles.panel} aria-label="Inserisci apparecchio">
      <p>
        Inserisci gli apparecchi sulla pianta principale. Ogni macchina crea il
        proprio impianto.
      </p>
      <button
        className="bottone pieno"
        onClick={() => {
          useProjectStore.getState().setView("2d");
          useProjectStore.setState({
            planPlacementTool: type === "terminal" ? "point" : type,
            tool: "select",
            selection: [],
          });
          onClose();
        }}
      >
        Inserisci sulla pianta
      </button>
      <button className="bottone" onClick={onClose}>
        Chiudi
      </button>
    </aside>
  );
}
