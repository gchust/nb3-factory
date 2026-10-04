import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { defineRootRoutes } from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';
import { Readable } from 'node:stream';

import type { MaterialAttachmentRecord } from '../providers/materials.js';

/**
 * The authenticated byte route for material attachments.
 *
 * The File Repository's own byte route is deliberately public — it serves anyone holding the UUID and is not
 * reached by a Policy. The product requires the opposite: an attachment belongs to the user who uploaded it, and
 * neither a colleague with the link nor a signed-out visitor may read it. So this application serves the bytes
 * itself, from the same `local` disk the upload wrote to, and looks the record up with the caller's id in the
 * filter. A missing record, another user's record and a non-`png`/`docx` record are indistinguishable: all 404.
 */

const UUID =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.([a-z0-9]{1,32}))?$/;

const MIME_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export default defineRootRoutes((app: Application) => {
  const router = new Hono<AuthEnv>();
  const auth = app.container.resolve(authenticationToken);

  router.get('/uploads/materials/:file', auth.required(), async (context) => {
    const session = context.get('auth');
    if (!session) return context.json({ code: 'UNAUTHORIZED' }, 401);

    const match = UUID.exec(context.req.param('file'));
    if (!match) return context.notFound();

    const [, id, extension = ''] = match;
    if (!(extension in MIME_TYPES)) return context.notFound();

    const database = app.container.resolve(databaseManagerToken);
    const record = await database
      .repository<MaterialAttachmentRecord>('material_files')
      .findOne({ filter: { id, ownerId: session.user.id } });
    if (!record || record.ext !== extension) return context.notFound();

    const disk = app.container.resolve(driveManagerToken).use(record.disk);
    if (!(await disk.exists(record.key))) return context.notFound();

    const filename = encodeURIComponent(
      Buffer.from(record.filename).toString('utf8'),
    ).replace(
      /['()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );

    context.header('Cache-Control', 'private, no-store');
    context.header('Content-Type', MIME_TYPES[extension]);
    context.header('Content-Length', String(record.size));
    context.header('X-Content-Type-Options', 'nosniff');
    context.header('Content-Security-Policy', "sandbox; default-src 'none'");
    context.header(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${filename}`,
    );
    return context.body(Readable.toWeb(await disk.getStream(record.key)));
  });

  // `defineRootRoutes` returns a plain `Hono`; mounting the typed router keeps `AuthEnv` on the
  // handler while the contribution's factory keeps the shape the runtime expects.
  const root = new Hono();
  root.route('/', router);
  return root;
});
