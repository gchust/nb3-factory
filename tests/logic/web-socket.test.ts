import { createApp } from '../../client/app.js';
import { restoreWebSocketReadyStateConstants } from '../../client/lib/web-socket.js';
import appRuntime from '../../client/runtime.js';
import {
  ClientApplication,
  realtimeClientToken,
  type RealtimeClient,
} from '@nocobase/app-client';
import { resolveAppRuntime } from '@nocobase/app-client/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

type FakeSocket = {
  url: string;
  readyState: number;
  sent: string[];
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
};

/**
 * The shape agent-browser's allowed-domains containment and some extensions install: construction is forwarded to the
 * native implementation, the prototype keeps the readyState constants, and the constructor loses them.
 */
function createWrappedWebSocket(): {
  WrappedWebSocket: new (url: string) => FakeSocket;
  instances: FakeSocket[];
} {
  const instances: FakeSocket[] = [];
  class WrappedWebSocket implements FakeSocket {
    public readyState = 0;
    public readonly sent: string[] = [];
    public onopen: (() => void) | null = null;
    public onmessage: ((event: { data: string }) => void) | null = null;
    public onerror: (() => void) | null = null;
    public onclose: (() => void) | null = null;

    public constructor(public readonly url: string) {
      instances.push(this);
      queueMicrotask(() => {
        this.readyState = 1;
        this.onopen?.();
      });
    }

    public send(data: string): void {
      this.sent.push(data);
    }

    public close(): void {
      this.readyState = 3;
      this.onclose?.();
    }
  }
  Object.defineProperties(WrappedWebSocket.prototype, {
    CONNECTING: { value: 0 },
    OPEN: { value: 1 },
    CLOSING: { value: 2 },
    CLOSED: { value: 3 },
  });
  return { WrappedWebSocket, instances };
}

async function startApplication(): Promise<{
  app: ClientApplication;
  realtime: RealtimeClient;
}> {
  const runtime = await resolveAppRuntime(appRuntime);
  const app = createApp(runtime);
  await app.start();
  return { app, realtime: app.services.resolve(realtimeClientToken) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('restoreWebSocketReadyStateConstants', () => {
  it('gives a wrapping constructor the standard constants without replacing it', () => {
    const { WrappedWebSocket } = createWrappedWebSocket();
    vi.stubGlobal('WebSocket', WrappedWebSocket);
    expect(WrappedWebSocket.OPEN).toBeUndefined();

    restoreWebSocketReadyStateConstants();

    expect(globalThis.WebSocket).toBe(WrappedWebSocket);
    expect(WrappedWebSocket.CONNECTING).toBe(0);
    expect(WrappedWebSocket.OPEN).toBe(1);
    expect(WrappedWebSocket.CLOSING).toBe(2);
    expect(WrappedWebSocket.CLOSED).toBe(3);
  });

  it('leaves a native-shaped constructor and a missing WebSocket alone', () => {
    class NativeShape {
      public static readonly CONNECTING = 0;
      public static readonly OPEN = 1;
      public static readonly CLOSING = 2;
      public static readonly CLOSED = 3;
    }
    vi.stubGlobal('WebSocket', NativeShape);
    restoreWebSocketReadyStateConstants();
    expect(globalThis.WebSocket).toBe(NativeShape);

    vi.stubGlobal('WebSocket', undefined);
    expect(() => restoreWebSocketReadyStateConstants()).not.toThrow();
  });
});

describe('realtime connection with a wrapped WebSocket', () => {
  it('does not connect until the readyState constants are restored, then subscribes', async () => {
    const { WrappedWebSocket, instances } = createWrappedWebSocket();
    vi.stubGlobal('WebSocket', WrappedWebSocket);
    const { app, realtime } = await startApplication();
    try {
      // Without the constants the client reads `undefined === WebSocket.OPEN` and treats the absent socket as open,
      // so it neither dials on subscribe nor on reconnect, which is exactly what the session-preparation gate does.
      const unsubscribe = realtime.subscribe('test:topic', () => {});
      expect(instances).toHaveLength(0);

      realtime.reconnect();
      expect(instances).toHaveLength(0);

      restoreWebSocketReadyStateConstants();
      realtime.reconnect();
      await Promise.resolve();
      await Promise.resolve();

      expect(instances).toHaveLength(1);
      const socket = instances[0];
      expect(new URL(socket.url).pathname).toBe('/main/ws');
      expect(socket.sent.map((data) => JSON.parse(data))).toContainEqual(
        expect.objectContaining({ type: 'subscribe', topic: 'test:topic' }),
      );
      unsubscribe();
    } finally {
      await app.shutdown();
    }
  });
});
