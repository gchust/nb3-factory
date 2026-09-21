import type { Application } from '@nocobase/app-server/application';
import type { Context } from 'hono';

import {
  createFeatureRouter,
  jsonBody,
  labService,
  optionalIntQuery,
  optionalTextQuery,
  parseId,
  userId,
} from './lab-http.js';

function equipmentFilters(context: Context): Record<string, unknown> {
  return {
    labId: optionalIntQuery(context, 'labId'),
    status: optionalTextQuery(context, 'status'),
    category: optionalTextQuery(context, 'category'),
    q: optionalTextQuery(context, 'q'),
  };
}

/** `/api/lab/equipment` — ledger entries, plus the calibration and reservation sub-resources. */
export function createEquipmentRouter(app: Application) {
  const router = createFeatureRouter();
  const service = labService(app);

  router.get('/', async (context) => {
    const caller = userId(context);
    return context.json({
      data: await service.listEquipment(caller, equipmentFilters(context)),
    });
  });

  router.post('/', async (context) => {
    const caller = userId(context);
    const created = await service.createEquipment(
      caller,
      await jsonBody(context),
    );
    return context.json({ data: created }, 201);
  });

  router.get('/:id', async (context) => {
    const caller = userId(context);
    const id = parseId(context.req.param('id'), 'equipment id');
    return context.json({ data: await service.getEquipment(caller, id) });
  });

  router.patch('/:id', async (context) => {
    const caller = userId(context);
    const id = parseId(context.req.param('id'), 'equipment id');
    const updated = await service.updateEquipment(
      caller,
      id,
      await jsonBody(context),
    );
    return context.json({ data: updated });
  });

  router.get('/:id/calibrations', async (context) => {
    const caller = userId(context);
    const equipmentId = parseId(context.req.param('id'), 'equipment id');
    return context.json({
      data: await service.listCalibrations(caller, { equipmentId }),
    });
  });

  router.post('/:id/calibrations', async (context) => {
    const caller = userId(context);
    const equipmentId = parseId(context.req.param('id'), 'equipment id');
    const created = await service.createCalibration(caller, {
      ...(await jsonBody(context)),
      equipmentId,
    });
    return context.json({ data: created }, 201);
  });

  router.get('/:id/reservations', async (context) => {
    const caller = userId(context);
    const equipmentId = parseId(context.req.param('id'), 'equipment id');
    return context.json({
      data: await service.listReservations(caller, { equipmentId }),
    });
  });

  router.post('/:id/reservations', async (context) => {
    const caller = userId(context);
    const equipmentId = parseId(context.req.param('id'), 'equipment id');
    const created = await service.createReservation(caller, {
      ...(await jsonBody(context)),
      equipmentId,
    });
    return context.json({ data: created }, 201);
  });

  return router;
}

/** `/api/lab/calibrations` — calibration history across the laboratories the caller may read. */
export function createCalibrationRouter(app: Application) {
  const router = createFeatureRouter();
  const service = labService(app);

  router.get('/', async (context) => {
    const caller = userId(context);
    return context.json({
      data: await service.listCalibrations(caller, {
        equipmentId: optionalIntQuery(context, 'equipmentId'),
        labId: optionalIntQuery(context, 'labId'),
      }),
    });
  });

  router.post('/', async (context) => {
    const caller = userId(context);
    const created = await service.createCalibration(
      caller,
      await jsonBody(context),
    );
    return context.json({ data: created }, 201);
  });

  return router;
}

/** `/api/lab/reservations` — instrument bookings. */
export function createReservationRouter(app: Application) {
  const router = createFeatureRouter();
  const service = labService(app);

  router.get('/', async (context) => {
    const caller = userId(context);
    return context.json({
      data: await service.listReservations(caller, {
        equipmentId: optionalIntQuery(context, 'equipmentId'),
      }),
    });
  });

  router.post('/', async (context) => {
    const caller = userId(context);
    const created = await service.createReservation(
      caller,
      await jsonBody(context),
    );
    return context.json({ data: created }, 201);
  });

  router.post('/:id/cancel', async (context) => {
    const caller = userId(context);
    const id = parseId(context.req.param('id'), 'reservation id');
    return context.json({ data: await service.cancelReservation(caller, id) });
  });

  return router;
}
