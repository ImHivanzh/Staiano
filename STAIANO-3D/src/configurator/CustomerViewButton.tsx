"use client";
import { useEffect, useRef } from "react";
import { Monitor } from "@phosphor-icons/react";
import { useProjectStore } from "@/stores/project-store";
import { useCustomerCamera } from "./viewer3d/customer-camera";

export function CustomerViewButton() {
  const connection = useRef<{ window: Window; close: () => void } | null>(null);
  useEffect(() => () => connection.current?.close(), []);
  return (
    <button
      className="bottone piccolo tenue"
      title="Apri una finestra separata da spostare sulla TV collegata al PC"
      onClick={() => {
        if (connection.current && !connection.current.window.closed) {
          connection.current.window.focus();
          return;
        }
        connection.current?.close();
        const token = crypto.randomUUID();
        const channel = new BroadcastChannel(`staiano-customer-${token}`);
        const customer = window.open(
          `/cliente#${token}`,
          "_blank",
          "popup,width=1280,height=800",
        );
        if (!customer) {
          channel.close();
          useProjectStore
            .getState()
            .setError(
              "Finestra bloccata. Consenti i popup per aprire la vista cliente.",
            );
          return;
        }
        const send = () => {
          const { project, activeFloorId, revision } =
            useProjectStore.getState();
          // No source drawings or attachments are needed by the client model.
          channel.postMessage({
            type: "snapshot",
            project: project
              ? {
                  ...project,
                  attachments: [],
                  floors: project.floors.map((floor) => ({
                    ...floor,
                    background: null,
                    importAnalysis: null,
                  })),
                }
              : null,
            activeFloorId,
            revision,
          });
        };
        channel.onmessage = (event) => {
          if (event.data?.type === "ready") {
            send();
            sendCamera();
          }
        };
        const sendCamera = () => {
          const { camera } = useCustomerCamera.getState();
          if (camera) channel.postMessage({ type: "camera", camera });
        };
        const unsubscribeCamera = useCustomerCamera.subscribe(sendCamera);
        const unsubscribe = useProjectStore.subscribe((state, previous) => {
          if (
            state.project !== previous.project ||
            state.activeFloorId !== previous.activeFloorId
          )
            send();
        });
        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          unsubscribe();
          unsubscribeCamera();
          channel.postMessage({ type: "closed" });
          channel.close();
          window.removeEventListener("pagehide", close);
          clearInterval(poll);
        };
        const poll = window.setInterval(() => {
          if (customer.closed) {
            close();
            connection.current = null;
          }
        }, 1000);
        window.addEventListener("pagehide", close, { once: true });
        connection.current = { window: customer, close };
      }}
    >
      <Monitor aria-hidden="true" /> Apri vista cliente
    </button>
  );
}
