interface ConfirmRequest {
  message: string;
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve: (ok: boolean) => void;
}

let current: ConfirmRequest | null = null;
const listeners = new Set<() => void>();

/**
 * Replaces window.confirm() with an in-app modal. Resolves true/false when
 * the user picks Confirmer/Annuler (or the custom confirmLabel/cancelLabel,
 * for a two-distinct-choice prompt rather than a plain OK/Cancel).
 */
export function confirmDialog(message: string, opts?: { danger?: boolean; confirmLabel?: string; cancelLabel?: string }): Promise<boolean> {
  return new Promise(resolve => {
    current = { message, danger: opts?.danger, confirmLabel: opts?.confirmLabel, cancelLabel: opts?.cancelLabel, resolve };
    listeners.forEach(fn => fn());
  });
}

export function getConfirmRequest(): ConfirmRequest | null { return current; }

export function subscribeConfirm(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resolveConfirm(ok: boolean): void {
  if (!current) return;
  current.resolve(ok);
  current = null;
  listeners.forEach(fn => fn());
}
