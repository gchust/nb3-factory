import type { Application } from '@nocobase/app-server/application';

import {
  createFeatureRouter,
  jsonBody,
  labService,
  optionalIntQuery,
  parseId,
  userId,
} from './lab-http.js';

/** `/api/lab/training-records` — safety and instrument training sessions. */
export function createTrainingRouter(app: Application) {
  const router = createFeatureRouter();
  const service = labService(app);

  router.get('/', async (context) => {
    const caller = userId(context);
    return context.json({
      data: await service.listTrainingRecords(caller, {
        labId: optionalIntQuery(context, 'labId'),
      }),
    });
  });

  router.post('/', async (context) => {
    const caller = userId(context);
    const created = await service.createTrainingRecord(
      caller,
      await jsonBody(context),
    );
    return context.json({ data: created }, 201);
  });

  router.patch('/:id', async (context) => {
    const caller = userId(context);
    const id = parseId(context.req.param('id'), 'training record id');
    const updated = await service.updateTrainingRecord(
      caller,
      id,
      await jsonBody(context),
    );
    return context.json({ data: updated });
  });

  return router;
}
