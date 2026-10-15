"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./FullscreenDialog.module.css";

function outsideDialog(element: HTMLDialogElement, x: number, y: number) {
  const bounds = element.getBoundingClientRect();
  return (
    x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom
  );
}

export function FullscreenDialog({
  open,
  title,
  onClose,
  closeLabel = "Chiudi configurazione",
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  closeLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pressedOutside = useRef(false);
  useEffect(() => {
    const element = dialog.current;
    if (!open) {
      element?.close();
      return;
    }
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) {
        const target = previous.getClientRects().length
          ? previous
          : previous.closest("details")?.querySelector("summary");
        target?.focus();
      }
    };
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label={title}
      onPointerDownCapture={(event) => {
        pressedOutside.current =
          event.target === event.currentTarget &&
          outsideDialog(event.currentTarget, event.clientX, event.clientY);
      }}
      onPointerCancel={() => {
        pressedOutside.current = false;
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (
          pressedOutside.current &&
          event.target === event.currentTarget &&
          outsideDialog(event.currentTarget, event.clientX, event.clientY)
        )
          onClose();
        pressedOutside.current = false;
      }}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header className={styles.header}>
        <h2>{title}</h2>
        <button type="button" className="bottone" onClick={onClose}>
          {closeLabel}
        </button>
      </header>
      <div className={styles.content}>{children}</div>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </dialog>
  );
}

export function FullscreenSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="bottone chiara"
        onClick={() => setOpen(true)}
      >
        {title}
      </button>
      <FullscreenDialog
        open={open}
        title={title}
        onClose={() => setOpen(false)}
      >
        {children}
      </FullscreenDialog>
    </>
  );
}
