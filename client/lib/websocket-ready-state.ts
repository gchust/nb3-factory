/**
 * The standard readyState values a WebSocket constructor exposes. Some
 * environments replace `window.WebSocket` with a wrapper that keeps the
 * constructor behavior but drops these static constants (browser-automation
 * domain guards do this). The realtime client compares `socket.readyState`
 * with `WebSocket.OPEN` and `WebSocket.CONNECTING`; when both the socket and
 * the constant are missing it treats "no socket" as connected and never
 * opens one, so session preparation waits for an open event that cannot come.
 *
 * Restoring the standard values keeps the realtime client working without
 * changing how the connection itself is made.
 */
const READY_STATES = [
  ['CONNECTING', 0],
  ['OPEN', 1],
  ['CLOSING', 2],
  ['CLOSED', 3],
] as const;

type WebSocketConstructorLike = {
  readonly CONNECTING?: number;
  readonly OPEN?: number;
  readonly CLOSING?: number;
  readonly CLOSED?: number;
};

export function restoreWebSocketReadyStateConstants(
  target: WebSocketConstructorLike | undefined = globalThis.WebSocket,
): void {
  if (!target || !Object.isExtensible(target)) {
    return;
  }

  for (const [name, value] of READY_STATES) {
    if (typeof target[name] === 'number') {
      continue;
    }

    // Match the platform: the constants are readable but not enumerable.
    Object.defineProperty(target, name, { configurable: true, value });
  }
}
