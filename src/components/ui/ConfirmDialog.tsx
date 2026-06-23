// A small in-app confirmation dialog — replaces the native window.confirm so
// the prompt is styled, mobile-friendly, and consistent across devices.

import { useEffect } from "react";
import { Button } from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Optional secondary line under the title (e.g. a warning). */
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Style the confirm button as destructive. */
  danger?: boolean;
  /** Disable buttons while the confirm action runs. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={onCancel}
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm rounded-2xl bg-[var(--color-bg)] shadow-2xl border border-[var(--color-border)] p-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {message && <p className="mt-2 text-sm text-muted">{message}</p>}
        <div className="mt-5 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
