import { Hono } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import {
  accessServiceToken,
  inspectionServiceToken,
  schedulerRunServiceToken,
} from '../services/contracts.js';
import { DAILY_SCHEDULE_KEYS } from '../services/inspection-service.js';
import {
  asText,
  readJsonBody,
  requireActor,
  route,
  toBoolean,
  toNumber,
} from './helpers.js';

/**
 * Inspection planning plus a manual trigger for the two daily jobs, so the
 * scheduler's work is observable without waiting for 09:00 Asia/Shanghai.
 *
 * The trigger does not run the business step directly: it fires the same
 * Scheduler schedules the cron does, waits for their execution records, and
 * reports what those records say. A failed or still-running execution is
 * therefore visible as such instead of being reported as a completion.
 */
export function createInspectionRouter(app: Application): Hono {
  const router = new Hono();
  const inspections = () => app.container.resolve(inspectionServiceToken);
  const schedulerRuns = () => app.container.resolve(schedulerRunServiceToken);
  const access = () => app.container.resolve(accessServiceToken);

  router.get(
    '/inspections',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const items = await inspections().listInspections(actor, {
        deviceId: toNumber(context.req.query('deviceId')),
        status: context.req.query('status') || undefined,
        from: context.req.query('from') || undefined,
        to: context.req.query('to') || undefined,
      });
      return context.json({ data: items });
    }),
  );

  router.post(
    '/inspections/run-daily',
    route(async (context) => {
      const actor = await requireActor(context, access());
      access().assertSupervisor(actor);
      const executions = await schedulerRuns().runAll([
        DAILY_SCHEDULE_KEYS.inspection,
        DAILY_SCHEDULE_KEYS.reminder,
      ]);
      const outcomeByKey = new Map(
        executions.map((execution) => [execution.key, execution]),
      );
      // The result is the real target result written into the execution
      // record — null when the schedule never produced a terminal outcome.
      const generation =
        outcomeByKey.get(DAILY_SCHEDULE_KEYS.inspection)?.result ?? null;
      const reminders =
        outcomeByKey.get(DAILY_SCHEDULE_KEYS.reminder)?.result ?? null;
      return context.json({ data: { generation, reminders, executions } });
    }),
  );

  router.post(
    '/inspections/:id/complete',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const body = await readJsonBody(context);
      const status = body.status === 'skipped' ? 'skipped' : 'completed';
      const view = await inspections().completeInspection(
        actor,
        Number(context.req.param('id')),
        {
          resultNote: asText(body.resultNote),
          status,
          createTicket: toBoolean(body.createTicket),
        },
      );
      return context.json({ data: view });
    }),
  );

  return router;
}
