/**
 * Makes the OOXML renderer's worker run under a guarded browser.
 *
 * The viewer renders through a dedicated worker. When it uses `mode: 'main'`
 * that worker is an inline blob script created with `{ type: 'module' }`, and
 * when it uses `mode: 'worker'` it loads the application's bundled
 * `render-worker-*.js` the same way. It only asks for module semantics so its
 * first line can revoke the object URL it was created from.
 *
 * A browser that enforces worker egress containment wraps dedicated workers in
 * a bootstrap guard. That guard cannot wrap an ES module worker, so the worker
 * is refused and the preview hangs on "Loading preview..." forever — this is
 * exactly what the in-app Office/PDF preview check observed. The bundled
 * render worker is otherwise a classic script (no `import.meta`, no
 * top-level `import`/`export`), so recreating it as a classic worker keeps the
 * WebAssembly parser working while still passing through the guard.
 *
 * Only the renderer's own worker URL is affected; every other module worker in
 * the application keeps its requested type.
 */
const RENDER_WORKER_PATH = /(?:^|[/\\])render-worker[^/\\]*\.(?:m?js)$/u;

let installed = false;

export function installOfficeOpenXmlWorkerCompat(): void {
  if (
    installed ||
    typeof window === 'undefined' ||
    typeof window.Worker !== 'function'
  ) {
    return;
  }
  installed = true;
  const NativeWorker = window.Worker;

  const isRenderWorkerUrl = (scriptURL: string | URL): boolean => {
    try {
      return RENDER_WORKER_PATH.test(
        new URL(String(scriptURL), window.location.href).pathname,
      );
    } catch {
      return false;
    }
  };

  class OfficeOpenXmlWorker extends NativeWorker {
    constructor(scriptURL: string | URL, options?: WorkerOptions) {
      const useClassicWorker =
        options?.type === 'module' && isRenderWorkerUrl(scriptURL);
      super(
        scriptURL,
        useClassicWorker ? { ...options, type: undefined } : options,
      );
    }
  }

  window.Worker = OfficeOpenXmlWorker;
}
