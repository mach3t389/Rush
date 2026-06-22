let _toggle: (() => void) | null = null;

export function registerAIToggle(fn: () => void) {
  _toggle = fn;
}

export function triggerAIToggle() {
  _toggle?.();
}
