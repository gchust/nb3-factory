import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import {
  accessCounterServiceToken,
  HOME_COUNTER_KEY,
} from '../providers/access-counter.js';
import { buildInfoServiceToken } from '../providers/build-info.js';

/**
 * Endpoints behind the preview smoke homepage: server-provided build information and a shared visit counter.
 *
 * The homepage is a `required` route, so only signed-in users reach the page; each endpoint still installs
 * `auth.required()` on its own path, because mounting under `/api` authenticates nothing.
 */
export const previewSmokeRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const buildInfo = app.container.resolve(buildInfoServiceToken);
    const counters = app.container.resolve(accessCounterServiceToken);

    router.use('/preview-smoke/info', auth.required());
    router.use('/preview-smoke/visits', auth.required());

    router.get('/preview-smoke/info', (context) =>
      context.json({ data: buildInfo.get() }),
    );

    router.get('/preview-smoke/visits', async (context) =>
      context.json({ data: { count: await counters.read(HOME_COUNTER_KEY) } }),
    );

    router.post('/preview-smoke/visits', async (context) =>
      context.json({
        data: { count: await counters.increment(HOME_COUNTER_KEY) },
      }),
    );

    return router;
  });
