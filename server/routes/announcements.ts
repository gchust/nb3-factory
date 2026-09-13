import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { announcementServiceToken } from '../providers/announcements.js';

const MAX_TITLE_LENGTH = 200;

/**
 * The announcements board API.
 *
 * Any signed-in team member may read and publish announcements, so the routes require a session but no additional
 * permission. `auth.required()` is installed on `/announcements` only, and this router owns that path.
 */
export const announcementsRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const announcements = app.container.resolve(announcementServiceToken);

    router.use('/announcements', auth.required());

    router.get('/announcements', async (context) =>
      context.json({ data: await announcements.list() }),
    );

    router.post('/announcements', async (context) => {
      let payload: Record<string, unknown> = {};
      try {
        const parsed: unknown = await context.req.json();
        if (isRecord(parsed)) payload = parsed;
      } catch {
        // An absent or malformed body is handled as missing fields below.
      }

      const title =
        typeof payload.title === 'string' ? payload.title.trim() : '';
      const body = typeof payload.body === 'string' ? payload.body.trim() : '';

      if (title.length === 0) {
        return context.json({ code: 'TITLE_REQUIRED' }, 400);
      }
      if (title.length > MAX_TITLE_LENGTH) {
        return context.json({ code: 'TITLE_TOO_LONG' }, 400);
      }
      if (body.length === 0) {
        return context.json({ code: 'BODY_REQUIRED' }, 400);
      }

      const created = await announcements.create({ title, body });
      return context.json({ data: created }, 201);
    });

    return router;
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export default announcementsRoutes;
