export type ToastType = 'task' | 'subtask' | 'section';

export type ToastPayload = {
  type: ToastType;
  message: string;
  subMessage?: string;
  onUndo?: () => void;
};

type ToastItem = ToastPayload & { id: string };

let current: ToastItem | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const DURATIONS: Record<ToastType, number> = {
  subtask: 2500,
  task: 4000,
  section: 5500,
};

export function showToast(payload: ToastPayload) {
  if (timer) clearTimeout(timer);
  current = { ...payload, id: String(Date.now()) };
  listeners.forEach(fn => fn());
  timer = setTimeout(() => {
    current = null;
    listeners.forEach(fn => fn());
  }, DURATIONS[payload.type]);
}

export function dismissToast() {
  if (timer) clearTimeout(timer);
  current = null;
  listeners.forEach(fn => fn());
}

export function getToast() { return current; }

export function subscribeToast(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
