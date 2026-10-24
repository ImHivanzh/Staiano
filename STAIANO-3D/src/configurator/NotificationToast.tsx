"use client";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";

function subscribeToDialogs(update: () => void) {
  const observer = new MutationObserver(update);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["open"],
  });
  return () => observer.disconnect();
}
function toastHost() {
  return (
    Array.from(document.querySelectorAll("dialog[open]")).at(-1) ??
    document.body
  );
}

export function NotificationToast({
  message,
  tone = "error",
  onDismiss,
  persistent = false,
  className = "",
  children,
}: {
  message: string;
  tone?: "error" | "info";
  onDismiss?: () => void;
  persistent?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const liveHost = useSyncExternalStore(
    subscribeToDialogs,
    toastHost,
    () => null,
  );
  // L'host resta fermo finché la notifica è aperta: spostare il portale
  // mentre un dialogo si chiude faceva fallire removeChild a React.
  const [shown, setShown] = useState({ message, host: liveHost });
  if (shown.message !== message || (!shown.host && liveHost))
    setShown({ message, host: liveHost });
  const host = shown.host;
  const element = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const visible = message !== dismissed;
  useEffect(() => {
    if (!visible) return;
    const toast = element.current;
    // Mount inside the modal too: the top layer alone does not escape dialog inertness.
    if (!toast?.isConnected) return;
    toast.showPopover();
    const timer = persistent
      ? undefined
      : window.setTimeout(() => {
          setDismissed(message);
          onDismiss?.();
        }, 8000);
    return () => {
      window.clearTimeout(timer);
      if (toast?.isConnected && toast.matches(":popover-open"))
        toast.hidePopover();
    };
  }, [message, visible, persistent, onDismiss, host]);
  if (!visible || !host) return null;
  return createPortal(
    <div
      ref={element}
      popover="manual"
      className={`notifica-toast ${className}`}
      data-tone={tone}
      role={tone === "error" ? "alert" : "status"}
      aria-atomic="true"
    >
      <span>{message}</span>
      {children}
      {!persistent && (
        <button
          type="button"
          className="bottone tenue piccolo"
          aria-label={tone === "error" ? "Chiudi errore" : "Chiudi notifica"}
          onClick={() => {
            setDismissed(message);
            onDismiss?.();
          }}
        >
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </div>,
    host,
  );
}
