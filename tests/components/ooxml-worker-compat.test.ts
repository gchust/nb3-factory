import { afterEach, describe, expect, it, vi } from 'vitest';

import { installOfficeOpenXmlWorkerCompat } from '../../client/extensions/nocobase-file-component-ui/lib/ooxml-worker-compat.js';

afterEach(() => vi.unstubAllGlobals());

describe('ooxml render worker compatibility', () => {
  it('runs the render worker as a classic worker and leaves others alone', () => {
    const created: Array<{ url: string; type: string | undefined }> = [];
    class FakeWorker {
      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        created.push({ url: String(scriptURL), type: options?.type });
      }
    }
    vi.stubGlobal('Worker', FakeWorker);

    installOfficeOpenXmlWorkerCompat();
    const WorkerCompat = window.Worker;

    new WorkerCompat(
      'http://localhost/main/assets/render-worker-CtLMFj9r-BB20No3F.js',
      { type: 'module' },
    );
    new WorkerCompat('http://localhost/main/assets/other-worker-abc.js', {
      type: 'module',
    });
    new WorkerCompat('/main/assets/render-worker.js', { type: 'module' });
    new WorkerCompat('http://localhost/main/assets/render-worker-abc.js', {
      type: 'classic',
    });

    expect(created).toEqual([
      {
        url: 'http://localhost/main/assets/render-worker-CtLMFj9r-BB20No3F.js',
        type: undefined,
      },
      {
        url: 'http://localhost/main/assets/other-worker-abc.js',
        type: 'module',
      },
      { url: '/main/assets/render-worker.js', type: undefined },
      {
        url: 'http://localhost/main/assets/render-worker-abc.js',
        type: 'classic',
      },
    ]);
  });
});
