import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { secured } from '../../server/routes/files.js';

/**
 * Regression: the attachment content router is mounted at the application root. Wrapping it with
 * `use('*', auth.required())` authenticates every root request, so `/` answered 401 and the SPA
 * shell never loaded — the application was unreachable in the browser. `secured` must scope the
 * middleware to the routes the repository registered and let everything else fall through.
 */

const deny: MiddlewareHandler = async (context) =>
  context.json({ code: 'UNAUTHORIZED' }, 401);

function createApp(): Hono {
  const inner = new Hono();
  inner.get('/itAttachments:findMany', (context) => context.text('list'));
  inner.post('/itAttachments:uploadOne', (context) => context.text('uploaded'));
  inner.get('/uploads/it-attachments/:file', (context) =>
    context.text('content'),
  );

  // Mirrors the runtime: the file root routes are mounted at `/`, then the SPA catch-all.
  const app = new Hono();
  app.route('/', secured(deny, inner));
  app.get('/*', (context) => context.html('<html>spa</html>'));
  return app;
}

describe('attachment route scoping', () => {
  it('leaves the SPA shell reachable when unauthenticated', async () => {
    const response = await createApp().request('/');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('spa');
  });

  it('leaves unrelated paths reachable when unauthenticated', async () => {
    const response = await createApp().request('/work-orders');
    expect(response.status).toBe(200);
  });

  it('still guards the repository metadata routes', async () => {
    const response = await createApp().request('/itAttachments:findMany');
    expect(response.status).toBe(401);
  });

  it('still guards uploads and attachment downloads', async () => {
    const app = createApp();
    const upload = await app.request('/itAttachments:uploadOne', {
      method: 'POST',
    });
    expect(upload.status).toBe(401);
    const content = await app.request(
      '/uploads/it-attachments/00000000-0000-0000-0000-000000000000',
    );
    expect(content.status).toBe(401);
  });
});
