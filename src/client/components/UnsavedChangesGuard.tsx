import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog } from "./Dialog";

/** Protect local edits on both browser exits and ordinary in-app link navigation. */
export function UnsavedChangesGuard({ active }: { active: boolean }) {
  const navigate = useNavigate();
  const [destination, setDestination] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const followLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download"))
        return;
      const next = new URL(link.href, window.location.origin);
      if (
        next.origin !== window.location.origin ||
        `${next.pathname}${next.search}` ===
          `${window.location.pathname}${window.location.search}`
      )
        return;
      event.preventDefault();
      setDestination(`${next.pathname}${next.search}${next.hash}`);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", followLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", followLink, true);
    };
  }, [active]);
  return (
    <Dialog
      isOpen={!!destination}
      onClose={() => setDestination(null)}
      title="Leave without saving?"
      description="Your latest answer changes haven’t been saved. Stay here to save them, or discard those edits."
    >
      <div className="dialog-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setDestination(null)}
        >
          Keep editing
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (destination) {
              const next = destination;
              setDestination(null);
              navigate(next);
            }
          }}
        >
          Discard changes and leave
        </button>
      </div>
    </Dialog>
  );
}
