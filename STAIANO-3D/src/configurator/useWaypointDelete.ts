import { useEffect } from "react";

export function useWaypointDelete(remove: (() => void) | null) {
  useEffect(() => {
    if (!remove) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (
        document.querySelector(
          'dialog[open],[role="dialog"][aria-modal="true"]',
        ) ||
        (event.target instanceof Element &&
          (event.target.closest("input,textarea,select") ||
            (event.target instanceof HTMLElement &&
              event.target.isContentEditable)))
      )
        return;
      // Consume before the project shortcut can delete the whole duct.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) remove();
    };
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, [remove]);
}
