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

// Stack of undo functions accumulated for consecutive task completions
let taskUndoStack: (() => void)[] = [];

const DURATIONS: Record<ToastType, number> = {
  subtask: 2500,
  task: 4000,
  section: 5500,
};

export function showToast(payload: ToastPayload) {
  if (payload.type === 'task' && payload.onUndo) {
    // Accumulate: push to stack, update count, extend timer
    taskUndoStack.push(payload.onUndo);
    const count = taskUndoStack.length;
    const stackSnapshot = [...taskUndoStack];
    const undoAll = () => {
      [...stackSnapshot].reverse().forEach(fn => fn());
      taskUndoStack = [];
      current = null;
      if (timer) { clearTimeout(timer); timer = null; }
      listeners.forEach(fn => fn());
    };
    current = {
      type: 'task',
      message: count === 1 ? payload.message : `${count} tâches terminées`,
      onUndo: undoAll,
      id: current?.id ?? String(Date.now()), // keep same id to avoid flicker
    };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      taskUndoStack = [];
      current = null;
      listeners.forEach(fn => fn());
    }, DURATIONS.task);
    listeners.forEach(fn => fn());
  } else {
    // Non-task toast: reset stack and show normally
    taskUndoStack = [];
    if (timer) clearTimeout(timer);
    current = { ...payload, id: String(Date.now()) };
    listeners.forEach(fn => fn());
    timer = setTimeout(() => {
      current = null;
      listeners.forEach(fn => fn());
    }, DURATIONS[payload.type]);
  }
}

export function dismissToast() {
  taskUndoStack = [];
  if (timer) clearTimeout(timer);
  current = null;
  listeners.forEach(fn => fn());
}

export function getToast() { return current; }

export function subscribeToast(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
