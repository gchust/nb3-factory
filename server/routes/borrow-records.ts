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
  readDateField,
  readJsonObject,
} from './equipment-http.js';

const LOAN_NOT_FOUND = () =>
  new EquipmentError('LOAN_NOT_FOUND', 'Borrow record not found.');

/** Borrow records: the full history, a new borrow, and recording a return. */
export const borrowRecordApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes<Application>((app) => {
    const router = new Hono();
    const routes = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    const equipment = app.container.resolve(equipmentServiceToken);

    routes.onError(equipmentErrorHandler);
    routes.use('*', authentication.required());

    routes.get('/', async (context) =>
      context.json({ data: await equipment.listLoans() }),
    );

    routes.post('/', async (context) => {
      const body = await readJsonObject(context);
      const created = await equipment.borrow({
        equipmentId: body.equipmentId as number,
        borrower: body.borrower as string,
        purpose: body.purpose as string | null | undefined,
        expectedReturnAt: readDateField(
          body.expectedReturnAt,
          'Expected return date',
        ),
      });
      return context.json({ data: created }, 201);
    });

    routes.post('/:id/return', async (context) => {
      const id = parsePositiveInteger(context.req.param('id'));
      if (id === null) {
        throw LOAN_NOT_FOUND();
      }
      return context.json({ data: await equipment.returnLoan(id) });
    });

    router.route('/borrow-records', routes);
    return router;
  });
