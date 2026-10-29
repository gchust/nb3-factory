/**
 * The realtime client only reconnects on its own after a socket closes. A socket that never reaches the browser, or a
 * reconnect attempt that throws before constructing one, leaves active subscriptions without a connection and the
 * session preparation screen waiting until its timeout. Supervising the connection from the application keeps live
 * updates recoverable without making every page carry its own retry loop.
 */
export interface RealtimeConnection {
  readonly active: boolean;
  readonly connected: boolean;
  reconnect(): void;
}

export interface RealtimeWatchdogOptions {
  /** How often to inspect the connection. A healthy socket is left alone. */
  readonly intervalMs?: number;
  readonly isOnline?: () => boolean;
  readonly isVisible?: () => boolean;
}

const DEFAULT_INTERVAL_MS = 5_000;

/**
 * Starts a watchdog that forces a fresh connection while the client has subscriptions but no open socket.
 * Returns the stop function; callers must invoke it during shutdown so the timer does not outlive the application.
 */
export function startRealtimeWatchdog(
  client: RealtimeConnection,
  options: RealtimeWatchdogOptions = {},
): () => void {
  const isOnline =
    options.isOnline ??
    (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const isVisible =
    options.isVisible ??
    (() =>
      typeof document === 'undefined' ||
      document.visibilityState === 'visible');

  const timer = setInterval(() => {
    try {
      if (typeof WebSocket === 'undefined') return;
      if (!client.active || client.connected) return;
      // A hidden tab or an offline browser cannot open a socket; retrying only burns battery and floods the server.
      if (!isVisible() || !isOnline()) return;
      client.reconnect();
    } catch (error) {
      // Reading `connected` or reconnecting can throw while the browser has no usable WebSocket constructor. Do not
      // let that stop future attempts: the application remains usable over HTTP and the next interval may recover.
      console.error('Unable to reconnect the realtime client.', error);
    }
  }, options.intervalMs ?? DEFAULT_INTERVAL_MS);

  return () => clearInterval(timer);
}

/**
 * A reconnect that throws before constructing a socket would otherwise escape the authentication provider's effect,
 * unmounting the signed-in application and leaving no way to reach the retry path. Keep the failure inside the
 * realtime layer: the session is valid over HTTP, and the watchdog above keeps trying.
 */
export function guardRealtimeReconnect(client: RealtimeConnection): () => void {
  const original = client.reconnect.bind(client);
  const guarded = (): void => {
    try {
      original();
    } catch (error) {
      console.error('Unable to start the realtime connection.', error);
    }
  };
  client.reconnect = guarded;
  return () => {
    if (client.reconnect === guarded) {
      client.reconnect = original;
    }
  };
}
