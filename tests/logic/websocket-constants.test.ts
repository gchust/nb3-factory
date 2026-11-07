import { describe, expect, it } from 'vitest';

import { restoreWebSocketConstants } from '../../client/lib/websocket.js';

describe('WebSocket ready-state constants', () => {
  it('restores the constants on a wrapper that omitted them', () => {
    // Browser automation installs a plain function in place of the native constructor; it is not a class, so it has
    // none of the static constants the realtime client compares against.
    function WebSocketWrapper(): void {}
    const wrapper = WebSocketWrapper as typeof WebSocket;

    restoreWebSocketConstants(wrapper);

    expect(wrapper).toBe(WebSocketWrapper);
    expect(wrapper.CONNECTING).toBe(0);
    expect(wrapper.OPEN).toBe(1);
    expect(wrapper.CLOSING).toBe(2);
    expect(wrapper.CLOSED).toBe(3);
  });

  it('leaves a native or already repaired constructor unchanged', () => {
    function WebSocketConstructor(): void {}
    const constructor = WebSocketConstructor as typeof WebSocket;
    Object.assign(constructor, {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3,
    });
    const descriptors = Object.getOwnPropertyDescriptors(constructor);

    restoreWebSocketConstants(constructor);

    expect(Object.getOwnPropertyDescriptors(constructor)).toEqual(descriptors);
  });

  it('does nothing when the browser provides no WebSocket constructor', () => {
    expect(() => restoreWebSocketConstants(undefined)).not.toThrow();
  });
});
