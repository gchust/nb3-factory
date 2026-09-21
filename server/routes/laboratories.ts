import type { Application } from '@nocobase/app-server/application';

import {
  createFeatureRouter,
  jsonBody,
  labService,
  parseId,
  userId,
} from './lab-http.js';

/** `/api/lab/laboratories` — the laboratory directory and its membership-scoped edits. */
export function createLaboratoryRouter(app: Application) {
  const router = createFeatureRouter();
  const service = labService(app);

  router.get('/', async (context) => {
    const caller = userId(context);
    return context.json({ data: await service.listLaboratories(caller) });
  });

  router.get('/:id/members', async (context) => {
    const caller = userId(context);
    const id = parseId(context.req.param('id'), 'laboratory id');
    return context.json({ data: await service.listLabMembers(caller, id) });
  });

  router.post('/', async (context) => {
    const caller = userId(context);
    const created = await service.createLaboratory(
      caller,
      await jsonBody(context),
    );
    return context.json({ data: created }, 201);
  });

  router.patch('/:id', async (context) => {
    const caller = userId(context);
    const id = parseId(context.req.param('id'), 'laboratory id');
    const updated = await service.updateLaboratory(
      caller,
      id,
      await jsonBody(context),
    );
    return context.json({ data: updated });
  });

  return router;
}
