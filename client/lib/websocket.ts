// Browser automation can replace the global WebSocket constructor with a function that enforces a URL policy but
// forgets the standard static ready-state constants. @nocobase/realtime compares readyState against WebSocket.OPEN,
// so with OPEN undefined it never treats an open socket as connected, and authentication reports that the realtime
// connection could not be prepared. Restore the constants on whatever constructor the browser installed; the wrapper
// itself stays in place, so its policy still applies.
const WEB_SOCKET_CONSTANTS = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

export function restoreWebSocketConstants(
  candidate: unknown = globalThis.WebSocket,
): void {
  if (typeof candidate !== 'function') return;

  const constructor = candidate as typeof WebSocket & Record<string, unknown>;
  for (const [name, value] of Object.entries(WEB_SOCKET_CONSTANTS)) {
    if (constructor[name] === value) continue;
    Object.defineProperty(constructor, name, {
      configurable: true,
      enumerable: true,
      value,
      writable: false,
    });
  }
}
