// Browser shells, extensions and acceptance harnesses sometimes replace the page's WebSocket constructor with a thin
// wrapper that forwards construction but drops the constructor's own readyState constants. The realtime client
// compares `socket?.readyState` with `WebSocket.OPEN`; when no socket exists yet and the constant is missing, that
// comparison is `undefined === undefined`, so connect() decides it is already connecting and never creates a socket.
// The session preparation gate then times out and the application stays unusable behind "Unable to connect", while a
// WebSocket opened by hand from the same page still works. Restore the standard constants on the existing constructor
// without replacing it; a normal browser already has them. Installed once as the client starts (client/index.tsx).
const READY_STATES = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'] as const;

// The WebSocket.readyState values from the HTML standard.
const READY_STATE_VALUES: Record<(typeof READY_STATES)[number], number> = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
};

export function restoreWebSocketReadyStateConstants(): void {
  const Constructor = globalThis.WebSocket;
  if (typeof Constructor !== 'function') return;

  for (const name of READY_STATES) {
    const constructorRecord = Constructor as unknown as Record<string, unknown>;
    if (constructorRecord[name] === READY_STATE_VALUES[name]) continue;

    try {
      Object.defineProperty(Constructor, name, {
        value: READY_STATE_VALUES[name],
        configurable: true,
        enumerable: true,
        writable: false,
      });
    } catch {
      // A frozen wrapper cannot be repaired; a native browser always has the constants, so there is nothing to do.
    }
  }
}
