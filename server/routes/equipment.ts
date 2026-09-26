import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import {
  EquipmentError,
  equipmentServiceToken,
} from '../providers/equipment.js';
import {
  equipmentErrorHandler,
  parsePositiveInteger,
  readJsonObject,
} from './equipment-http.js';

const EQUIPMENT_NOT_FOUND = () =>
  new EquipmentError('EQUIPMENT_NOT_FOUND', 'Equipment not found.');

/** The equipment ledger: read the list, create, load one and update one. */
export const equipmentApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes<Application>((app) => {
    const router = new Hono();
    const routes = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    const equipment = app.container.resolve(equipmentServiceToken);

    routes.onError(equipmentErrorHandler);
    routes.use('*', authentication.required());

    routes.get('/', async (context) =>
      context.json({ data: await equipment.listEquipment() }),
    );

    routes.get('/:id', async (context) => {
      const id = parsePositiveInteger(context.req.param('id'));
      if (id === null) {
        throw EQUIPMENT_NOT_FOUND();
      }
      return context.json({ data: await equipment.getEquipment(id) });
    });

    routes.post('/', async (context) => {
      const body = await readJsonObject(context);
      const created = await equipment.createEquipment({
        assetCode: body.assetCode as string,
        name: body.name as string,
        category: body.category as string | null | undefined,
        notes: body.notes as string | null | undefined,
      });
      return context.json({ data: created }, 201);
    });

    routes.patch('/:id', async (context) => {
      const id = parsePositiveInteger(context.req.param('id'));
      if (id === null) {
        throw EQUIPMENT_NOT_FOUND();
      }
      const body = await readJsonObject(context);
      const updated = await equipment.updateEquipment(id, {
        assetCode: body.assetCode as string,
        name: body.name as string,
        category: body.category as string | null | undefined,
        notes: body.notes as string | null | undefined,
      });
      return context.json({ data: updated });
    });

    router.route('/equipment', routes);
    return router;
  });
