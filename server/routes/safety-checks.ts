import type { Application } from '@nocobase/app-server/application';

import {
  createFeatureRouter,
  jsonBody,
  labService,
  optionalIntQuery,
  optionalTextQuery,
  parseId,
  userId,
} from './lab-http.js';

/** `/api/lab/safety-checks` — inspections, findings and their closure. */
export function createSafetyCheckRouter(app: Application) {
  const router = createFeatureRouter();
  const service = labService(app);

  router.get('/', async (context) => {
    const caller = userId(context);
    return context.json({
      data: await service.listSafetyChecks(caller, {
        status: optionalTextQuery(context, 'status'),
        result: optionalTextQuery(context, 'result'),
        severity: optionalTextQuery(context, 'severity'),
        labId: optionalIntQuery(context, 'labId'),
      }),
    });
  });

  router.post('/', async (context) => {
    const caller = userId(context);
    const created = await service.createSafetyCheck(
      caller,
      await jsonBody(context),
    );
    return context.json({ data: created }, 201);
  });

  router.patch('/:id', async (context) => {
    const caller = userId(context);
    const id = parseId(context.req.param('id'), 'safety inspection id');
    const updated = await service.updateSafetyCheck(
      caller,
      id,
      await jsonBody(context),
    );
    return context.json({ data: updated });
  });

  router.post('/:id/close', async (context) => {
    const caller = userId(context);
    const id = parseId(context.req.param('id'), 'safety inspection id');
    const closed = await service.closeSafetyCheck(
      caller,
      id,
      await jsonBody(context),
    );
    return context.json({ data: closed });
  });

  return router;
}
