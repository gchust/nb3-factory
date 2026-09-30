import { Hono } from 'hono';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { serviceScheduleServiceToken } from '../providers/tokens.js';
import {
  ServiceScheduleNotFoundError,
  type ServiceScheduleService,
} from '../providers/service-schedules.js';
import { authorizeAction, type ServiceEnv } from './service-shared.js';

/**
 * Controlled immediate execution for the two domain schedules. The Scheduler
 * plugin exposes no trigger (its Settings page and API are read-only), so the
 * application owns this small surface: it authorizes the same capability that
 * owns the business effect — managing inspections — and then reaches the same
 * schedule through the queue's public `Schedule.trigger()`, which dispatches
 * the real target and leaves the Scheduler's own occurrence record behind.
 */
export function createScheduleRoutes(
  app: AppPluginApplication,
): Hono<ServiceEnv> {
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const schedules: ServiceScheduleService = app.container.resolve(
    serviceScheduleServiceToken,
  );
  const routes = new Hono<ServiceEnv>();

  routes.use('*', auth.required(), authz.middleware());

  routes.get('/', async (context) => {
    // The schedules generate inspections and reminders, so the capability that
    // runs them is the one that manages those records.
    await authorizeAction(context, 'service.inspections', 'manage');
    return context.json({ data: await schedules.list() });
  });

  routes.post('/:key/run', async (context) => {
    await authorizeAction(context, 'service.inspections', 'manage');
    try {
      const schedule = await schedules.trigger(context.req.param('key'));
      return context.json({ data: schedule });
    } catch (error) {
      if (error instanceof ServiceScheduleNotFoundError) {
        return context.json({ error: 'Schedule not found.' }, 404);
      }
      throw error;
    }
  });

  return routes;
}
