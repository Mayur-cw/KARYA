import React, { useEffect, useRef, useId } from "react";

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = "560px",
}: DialogProps) {
  const id = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;

      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      // Trap focus
      const focusableElements =
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
      if (focusableElements && focusableElements.length > 0) {
        const preferred =
          dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]");
        (preferred || focusableElements[0]).focus();
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeRef.current();
        } else if (e.key === "Tab") {
          if (!dialogRef.current) return;
          const focusables = Array.from(
            dialogRef.current.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          );
          if (focusables.length === 0) return;

          const firstEl = focusables[0];
          const lastEl = focusables[focusables.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === firstEl) {
              e.preventDefault();
              lastEl.focus();
            }
          } else {
            if (document.activeElement === lastEl) {
              e.preventDefault();
              firstEl.focus();
            }
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = previousOverflow;
        if (previousFocusRef.current) {
          previousFocusRef.current.focus();
        }
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <button
        type="button"
        className="modal-dismiss"
        tabIndex={-1}
        aria-label="Dismiss dialog"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-description` : undefined}
        className="modal-panel"
        style={{ maxWidth }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "16px",
          }}
        >
          <div>
            <h2
              id={`${id}-title`}
              style={{ fontSize: "20px", fontWeight: 700 }}
            >
              {title}
            </h2>
            {description && (
              <p
                id={`${id}-description`}
                style={{
                  fontSize: "14px",
                  color: "var(--ink-muted)",
                  marginTop: "4px",
                }}
              >
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="btn btn-secondary btn-sm"
            style={{ minHeight: "32px", padding: "0 8px", lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
        <div className="dialog-content">{children}</div>
      </div>
    </div>
  );
}
