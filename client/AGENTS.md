# Client notes for this application

Application-owned decisions under `client/` that a template upgrade must not silently revert.

## Realtime endpoint and the session-preparation boundary

`client/config/api.ts` states `api.realtimeURL` (`resolveAppUrl('/ws')`) beside `api.baseURL`. The client
otherwise derives the socket URL from the API base URL, which turns into `<basePath>/api/../ws`; it happens
to normalize to the right path, but any proxy, CDN or mount shape that does not collapse the `..` produces a
handshake that fails silently as a 404. Keep the explicit value: it is what the browser actually dials.

`client/routing/session-preparation.tsx` keeps the framework's handshake barrier (no page mounts until the
session's realtime identity is established, because that is what delivers permission invalidation), and adds
one fallback: if the preparation timeout fires but a socket opened _for the current session_ afterwards, the
page renders anyway. That case is a missed notification, not an unusable transport — the provider stops
listening at the timeout, so without the fallback a working application stays behind the failure screen and
Retry only repeats the same missed event. The open is tracked per session id, so a connection kept from the
previous identity cannot release the boundary for a new one.

Both pieces exist because a fresh browser session reported "Unable to connect" while a WebSocket opened from
the same page was accepted by the server. Tests: `tests/logic/session-preparation.test.tsx`,
`tests/logic/client-runtime.test.ts`.

## A wrapped WebSocket constructor must keep its readyState constants

`client/index.tsx` calls `restoreWebSocketReadyStateConstants()` (`client/lib/web-socket.ts`) before the
application starts. Browsers and tools that wrap `window.WebSocket` — agent-browser's allowed-domains
containment does this, and extensions or proxies can — may forward construction while dropping the
constructor's static `CONNECTING`, `OPEN`, `CLOSING` and `CLOSED`. The realtime client compares
`socket?.readyState === WebSocket.OPEN`; with both sides `undefined` it treats the missing socket as an open
one, so it never dials, reports `connected` while offline, and subscriptions are never sent. The
session-preparation gate then times out into "Unable to connect", and Retry repeats it because `reconnect()`
clears the socket and reaches the same guard. Restoring the standard constants on the existing constructor
(never replacing it) repairs connection and subscription delivery; a native browser already has them, so the
call is a no-op there. Test: `tests/logic/web-socket.test.ts`.
