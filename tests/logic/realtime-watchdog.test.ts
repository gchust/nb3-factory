// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  guardRealtimeReconnect,
  startRealtimeWatchdog,
  type RealtimeConnection,
} from '../../client/lib/realtime-watchdog.js';

function createRealtime(overrides: Partial<RealtimeConnection> = {}) {
  return {
    active: true,
    connected: false,
    reconnect: vi.fn(),
    ...overrides,
  } satisfies RealtimeConnection;
}

describe('startRealtimeWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('forces a fresh connection while subscriptions are active without a socket', () => {
    const realtime = createRealtime();
    const stop = startRealtimeWatchdog(realtime);

    vi.advanceTimersByTime(5_000);

    expect(realtime.reconnect).toHaveBeenCalledTimes(1);
    stop();
  });

  it('leaves an open connection and a client without subscriptions alone', () => {
    const connected = createRealtime({ connected: true });
    const inactive = createRealtime({ active: false });
    const stopConnected = startRealtimeWatchdog(connected);
    const stopInactive = startRealtimeWatchdog(inactive);

    vi.advanceTimersByTime(10_000);

    expect(connected.reconnect).not.toHaveBeenCalled();
    expect(inactive.reconnect).not.toHaveBeenCalled();
    stopConnected();
    stopInactive();
  });

  it('does not retry while the document is hidden or the browser is offline', () => {
    const hidden = createRealtime();
    const offline = createRealtime();
    const stopHidden = startRealtimeWatchdog(hidden, {
      isVisible: () => false,
    });
    const stopOffline = startRealtimeWatchdog(offline, {
      isOnline: () => false,
    });

    vi.advanceTimersByTime(10_000);

    expect(hidden.reconnect).not.toHaveBeenCalled();
    expect(offline.reconnect).not.toHaveBeenCalled();
    stopHidden();
    stopOffline();
  });

  it('keeps supervising after a reconnect attempt throws', () => {
    const error = new Error('invalid realtime URL');
    const realtime = createRealtime({
      reconnect: vi.fn(() => {
        throw error;
      }),
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const stop = startRealtimeWatchdog(realtime);

    vi.advanceTimersByTime(10_000);

    expect(realtime.reconnect).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledWith(
      'Unable to reconnect the realtime client.',
      error,
    );
    stop();
  });

  it('survives a connection state that throws because WebSocket is unavailable', () => {
    const error = new Error('WebSocket is not defined');
    const reconnect = vi.fn();
    const realtime: RealtimeConnection = {
      active: true,
      get connected(): boolean {
        throw error;
      },
      reconnect,
    };
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const stop = startRealtimeWatchdog(realtime);

    expect(() => vi.advanceTimersByTime(5_000)).not.toThrow();

    expect(reconnect).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      'Unable to reconnect the realtime client.',
      error,
    );
    stop();
  });

  it('stops inspecting the connection when stopped', () => {
    const realtime = createRealtime();
    const stop = startRealtimeWatchdog(realtime);

    stop();
    vi.advanceTimersByTime(15_000);

    expect(realtime.reconnect).not.toHaveBeenCalled();
  });
});

describe('guardRealtimeReconnect', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps a throwing reconnect inside the realtime layer and restores the original method', () => {
    const error = new Error('blocked by the browser');
    const original = vi.fn(() => {
      throw error;
    });
    const realtime = createRealtime({ reconnect: original });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const restore = guardRealtimeReconnect(realtime);

    expect(() => realtime.reconnect()).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith(
      'Unable to start the realtime connection.',
      error,
    );

    original.mockClear();
    restore();
    expect(() => realtime.reconnect()).toThrow(error);
    expect(original).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite a wrapper installed after it', () => {
    const original = vi.fn();
    const realtime = createRealtime({ reconnect: original });
    const restore = guardRealtimeReconnect(realtime);
    const replacement = vi.fn();
    realtime.reconnect = replacement;

    restore();

    expect(realtime.reconnect).toBe(replacement);
  });
});
