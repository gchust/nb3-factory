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

/**
 * `/api/lab/work-orders` — maintenance requests and their state machine.
 *
 * The legal transitions, the required review comment, the safety block and the
 * equipment status side effects all live in the service; this router only
 * forwards `action` and `comment`.
 */
export function createWorkOrderRouter(app: Application) {
  const router = createFeatureRouter();
  const service = labService(app);

  router.get('/', async (context) => {
    const caller = userId(context);
    return context.json({
      data: await service.listWorkOrders(caller, {
        status: optionalTextQuery(context, 'status'),
        priority: optionalTextQuery(context, 'priority'),
        labId: optionalIntQuery(context, 'labId'),
      }),
    });
  });

  router.post('/', async (context) => {
    const caller = userId(context);
    const created = await service.createWorkOrder(
      caller,
      await jsonBody(context),
    );
    return context.json({ data: created }, 201);
  });

  router.get('/:id', async (context) => {
    const caller = userId(context);
    const id = parseId(context.req.param('id'), 'work order id');
    return context.json({ data: await service.getWorkOrder(caller, id) });
  });

  router.post('/:id/transition', async (context) => {
    const caller = userId(context);
    const id = parseId(context.req.param('id'), 'work order id');
    const updated = await service.transitionWorkOrder(
      caller,
      id,
      await jsonBody(context),
    );
    return context.json({ data: updated });
  });

  return router;
}
