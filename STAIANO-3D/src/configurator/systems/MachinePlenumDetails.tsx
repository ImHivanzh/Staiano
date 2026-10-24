"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Project } from "@/schemas/project";

const SupplyPlenumPanel = dynamic(
  () =>
    import("./SupplyPlenumPanel").then((module) => module.SupplyPlenumPanel),
  {
    ssr: false,
    loading: () => <p role="status">Caricamento schema plenum…</p>,
  },
);

export function MachinePlenumDetails({
  project,
  systemId,
}: {
  project: Project;
  systemId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="azione-inspector"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Schema e dimensionamento plenum</summary>
      {open && (
        <SupplyPlenumPanel
          key={systemId}
          project={project}
          systemId={systemId}
        />
      )}
    </details>
  );
}
