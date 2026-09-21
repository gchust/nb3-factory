import type { Application } from '@nocobase/app-server/application';

import { createFeatureRouter, labService, userId } from './lab-http.js';

/** `/api/lab/dashboard` — the counters the home page renders. */
export function createDashboardRouter(app: Application) {
  const router = createFeatureRouter();
  const service = labService(app);

  router.get('/', async (context) => {
    const caller = userId(context);
    return context.json({ data: await service.dashboard(caller) });
  });

  router.get('/access', async (context) => {
    const caller = userId(context);
    return context.json({ data: await service.access(caller) });
  });

  return router;
}
