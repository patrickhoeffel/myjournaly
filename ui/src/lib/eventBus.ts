type Listener = () => void;

const listeners = new Set<Listener>();

export function onDataUpdated(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitDataUpdated() {
  listeners.forEach((fn) => fn());
}
