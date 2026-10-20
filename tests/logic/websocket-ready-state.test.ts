import { describe, expect, it } from 'vitest';

import { restoreWebSocketReadyStateConstants } from '../../client/lib/websocket-ready-state.js';

describe('WebSocket readyState compatibility', () => {
  it('restores the standard constants on a wrapper that dropped them', () => {
    function WebSocketWrapper() {}
    const target = WebSocketWrapper as unknown as Record<string, number>;

    restoreWebSocketReadyStateConstants(WebSocketWrapper);

    expect(target.CONNECTING).toBe(0);
    expect(target.OPEN).toBe(1);
    expect(target.CLOSING).toBe(2);
    expect(target.CLOSED).toBe(3);
  });

  it('leaves constants a wrapper already provides untouched', () => {
    const WebSocketWrapper = {
      CONNECTING: 10,
      OPEN: 11,
    };

    restoreWebSocketReadyStateConstants(WebSocketWrapper);

    expect(WebSocketWrapper).toMatchObject({
      CONNECTING: 10,
      OPEN: 11,
      CLOSING: 2,
      CLOSED: 3,
    });
  });

  it('does nothing when there is no WebSocket constructor', () => {
    expect(() => restoreWebSocketReadyStateConstants(undefined)).not.toThrow();
  });
});
