let _toggle: (() => void) | null = null;
let _close: (() => void) | null = null;

export function registerAIToggle(fn: () => void) {
  _toggle = fn;
}

export function triggerAIToggle() {
  _toggle?.();
}

export function registerAIClose(fn: () => void) {
  _close = fn;
}

export function triggerAIClose() {
  _close?.();
}
