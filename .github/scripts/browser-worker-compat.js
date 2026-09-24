// agent-browser 0.36.0 guards module workers using `await import(url)`.
// Native messages may arrive during that import, before the target installs its
// handlers. Buffer those events without removing or changing the domain guard.
// Replayed events are synthetic; their data and transferred ports are retained.
// Only the exact guarded, single-string module bootstrap is adapted. Ordinary
// application blobs, classic workers and unrecognized wrappers are untouched.
(() => {
  const NativeBlob = globalThis.Blob;
  if (typeof NativeBlob !== 'function') return;
  const prefix = '(function _agentBrowserInstallDomainFilter(';
  const suffix = /\nawait import\("(?:[^"\\]|\\.)*"\);\n$/;
  const before = `const __factoryWorkerEvents = [];
const __factoryHoldWorkerEvent = event => {
  event.stopImmediatePropagation();
  __factoryWorkerEvents.push(event);
};
for (const type of ['message', 'messageerror', 'connect']) {
  addEventListener(type, __factoryHoldWorkerEvent, { capture: true });
}
`;
  const after = `
for (const type of ['message', 'messageerror', 'connect']) {
  removeEventListener(type, __factoryHoldWorkerEvent, { capture: true });
}
for (const event of __factoryWorkerEvents.splice(0)) {
  dispatchEvent(new MessageEvent(event.type, {
    data: event.data, origin: event.origin, lastEventId: event.lastEventId,
    source: event.source, ports: event.ports,
  }));
}
__factoryWorkerEvents.length = 0;
`;
  globalThis.Blob = new Proxy(NativeBlob, {
    construct(target, args, newTarget) {
      const parts = args[0];
      if (Array.isArray(parts) && parts.length === 1 && typeof parts[0] === 'string' &&
          parts[0].startsWith(prefix) && suffix.test(parts[0])) {
        return Reflect.construct(target, [[before + parts[0] + after], ...args.slice(1)], newTarget);
      }
      return Reflect.construct(target, args, newTarget);
    },
  });
})();
