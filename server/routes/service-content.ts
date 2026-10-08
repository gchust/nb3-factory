import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  describeRoute,
} from '@nocobase/app-server/router';
import { knowledgeBaseManifestServiceToken } from '@nocobase/app-plugin-ai-knowledge-base/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { coerceText } from '../service/scalars.js';
import { runScheduleNow } from '../service/schedule-runner.js';
import { ticketServiceToken } from '../service/ticket-service.js';
import { stamped, touched } from '../service/timestamps.js';
import {
  isSupervisor,
  requireActor,
  requireSupervisor,
  serviceError,
} from './helpers.js';

const tags = ['Service content'];

const idParam = z.object({ id: z.coerce.number().int().positive() });

const knowledgeBody = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  body: z.string().min(1),
  published: z.boolean().default(false),
});

const manualBody = z.object({
  title: z.string().min(1),
  model: z.string().min(1),
  summary: z.string().optional(),
  body: z.string().min(1),
  status: z
    .enum(['unconfigured', 'pending', 'processing', 'ready', 'failed'])
    .optional(),
  fileId: z.string().optional(),
});

const articleShape = z.record(z.string(), z.unknown());
const manualShape = z.record(z.string(), z.unknown());

export function registerContentRoutes(app: Application, router: Hono): void {
  const database = app.container.resolve(databaseManagerToken);
  const tickets = app.container.resolve(ticketServiceToken);

  /**
   * An on-demand operations run lets a supervisor re-run today's work without
   * waiting for the clock, but it must not override the administrator's
   * enable/disable setting on the corresponding Scheduler task: a paused
   * schedule produces no new results, manual or automatic. The schedule row is
   * read read-only; the Scheduler store is never resolved from the container.
   * When Scheduler is not installed, or has not synchronized yet, the manual
   * run stays available.
   */
  const assertScheduleEnabled = async (key: string): Promise<void> => {
    if (!app.container.has(schedulerServiceToken)) {
      return;
    }
    const rows = await database
      .query('main')
      .selectFrom('schedule_definitions')
      .select(['enabled', 'lifecycleState'])
      .where('appName', '=', app.appName)
      .where('key', '=', key)
      .execute<{ enabled: boolean | number; lifecycleState: string }>();
    if (rows.length === 0) {
      return;
    }
    const runnable = rows.every(
      (row) => Boolean(row.enabled) && row.lifecycleState === 'active',
    );
    if (!runnable) {
      throw new ApiError({
        status: 'FAILED_PRECONDITION',
        reason: 'SERVICE_SCHEDULE_DISABLED',
        domain: 'service',
        message: `The scheduled task "${key}" is disabled, so the on-demand run is refused. Enable it in the scheduled tasks settings first.`,
      });
    }
  };

  // --- Knowledge -----------------------------------------------------------
  router.get(
    '/service/knowledge',
    describeRoute({
      tags,
      summary: 'List knowledge articles; drafts only for a supervisor',
      operationId: 'serviceKnowledgeFindMany',
      responses: {
        200: dataResponse(z.array(articleShape)),
        401: apiErrorResponses['401'],
        500: apiErrorResponses['500'],
      },
    }),
    async (context) => {
      const actor = await requireActor(app, context);
      const supervisor = await isSupervisor(app, actor.id);
      const repository = database.repository('knowledge_articles');
      const items = await repository.findMany({
        ...(supervisor ? {} : { filter: { published: true } }),
        sort: (sort) => [sort.field('createdAt').desc()],
      });
      return context.json({ data: items });
    },
  );

  router.post(
    '/service/knowledge',
    describeRoute({
      tags,
      summary: 'Create a knowledge article',
      operationId: 'serviceKnowledgeCreate',
      responses: {
        201: dataResponse(articleShape),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('json', knowledgeBody),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      const body = context.req.valid('json');
      const { record } = await database
        .repository('knowledge_articles')
        .createOne({
          values: stamped({
            title: body.title,
            summary: body.summary ?? null,
            body: body.body,
            published: body.published,
            createdById: actor.id,
          }),
        });
      return context.json({ data: record }, 201);
    },
  );

  router.patch(
    '/service/knowledge/:id',
    describeRoute({
      tags,
      summary: 'Edit or publish a knowledge article',
      operationId: 'serviceKnowledgeUpdate',
      responses: {
        200: dataResponse(articleShape),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        404: apiErrorResponse(404),
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    apiValidator('json', knowledgeBody.partial()),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      const body = context.req.valid('json');
      const values = Object.fromEntries(
        Object.entries(body).filter(([, value]) => value !== undefined),
      );
      const { record } = await database
        .repository('knowledge_articles')
        .updateOne({
          filter: { id: context.req.valid('param').id },
          values: touched(values),
        });
      return context.json({ data: record });
    },
  );

  // --- Manuals -------------------------------------------------------------
  router.get(
    '/service/manuals',
    describeRoute({
      tags,
      summary: 'List device manuals and their knowledge-base status',
      operationId: 'serviceManualsFindMany',
      responses: {
        200: dataResponse(z.array(manualShape)),
        401: apiErrorResponses['401'],
        500: apiErrorResponses['500'],
      },
    }),
    async (context) => {
      await requireActor(app, context);
      const items = await database.repository('manuals').findMany({
        sort: (sort) => [sort.field('createdAt').desc()],
      });
      return context.json({ data: items });
    },
  );

  router.post(
    '/service/manuals',
    describeRoute({
      tags,
      summary: 'Create a device manual',
      operationId: 'serviceManualsCreate',
      responses: {
        201: dataResponse(manualShape),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('json', manualBody),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      const body = context.req.valid('json');
      const { record } = await database.repository('manuals').createOne({
        values: stamped({
          title: body.title,
          model: body.model,
          summary: body.summary ?? body.body.slice(0, 200),
          body: body.body,
          status: body.status ?? 'unconfigured',
          statusMessage: null,
          knowledgeBaseKey: null,
          fileId: body.fileId ?? null,
          createdById: actor.id,
        }),
      });
      return context.json({ data: record }, 201);
    },
  );

  router.patch(
    '/service/manuals/:id',
    describeRoute({
      tags,
      summary: 'Edit a device manual',
      operationId: 'serviceManualsUpdate',
      responses: {
        200: dataResponse(manualShape),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        404: apiErrorResponse(404),
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    apiValidator('json', manualBody.partial()),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      const body = context.req.valid('json');
      const values = Object.fromEntries(
        Object.entries(body).filter(([, value]) => value !== undefined),
      );
      const { record } = await database.repository('manuals').updateOne({
        filter: { id: context.req.valid('param').id },
        values: touched(values),
      });
      return context.json({ data: record });
    },
  );

  /**
   * Push the manual into the AI knowledge base. The result is whatever the
   * integration really reports: when the knowledge base is not configured the
   * manual keeps the `unconfigured` status with the reason it was not
   * indexed.
   */
  router.post(
    '/service/manuals/:id/sync',
    describeRoute({
      tags,
      summary: 'Send a manual to the AI knowledge base and record its status',
      operationId: 'serviceManualsSync',
      responses: {
        200: dataResponse(manualShape),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        404: apiErrorResponse(404),
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      const id = context.req.valid('param').id;
      const manual = await database
        .repository('manuals')
        .findOne({ filter: { id } });
      if (!manual) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'SERVICE_MANUAL_NOT_FOUND',
          domain: 'service',
          message: 'The manual does not exist.',
        });
      }
      const result = await syncManualToKnowledgeBase(app, {
        id,
        title: coerceText(manual.title),
        model: coerceText(manual.model),
        fileId: manual.fileId ? coerceText(manual.fileId) : null,
      });
      const { record } = await database.repository('manuals').updateOne({
        filter: { id },
        values: touched({
          status: result.status,
          statusMessage: result.message,
          knowledgeBaseKey: result.key,
        }),
      });
      return context.json({ data: record });
    },
  );

  // --- Messages ------------------------------------------------------------
  router.get(
    '/service/messages',
    describeRoute({
      tags,
      summary: 'List the signed-in user inbox messages',
      operationId: 'serviceMessagesFindMany',
      responses: {
        200: dataResponse(z.array(manualShape)),
        401: apiErrorResponses['401'],
        500: apiErrorResponses['500'],
      },
    }),
    async (context) => {
      const actor = await requireActor(app, context);
      return context.json({ data: await tickets.listMessages(actor.id) });
    },
  );

  router.get(
    '/service/messages/unread-count',
    describeRoute({
      tags,
      summary: 'Count the signed-in user unread messages',
      operationId: 'serviceMessagesUnreadCount',
      responses: {
        200: dataResponse(z.object({ count: z.number() })),
        401: apiErrorResponses['401'],
        500: apiErrorResponses['500'],
      },
    }),
    async (context) => {
      const actor = await requireActor(app, context);
      return context.json({
        data: { count: await tickets.unreadCount(actor.id) },
      });
    },
  );

  router.post(
    '/service/messages/:id/read',
    describeRoute({
      tags,
      summary: 'Mark one message read',
      operationId: 'serviceMessagesMarkRead',
      responses: {
        200: dataResponse(manualShape),
        401: apiErrorResponses['401'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    async (context) => {
      const actor = await requireActor(app, context);
      try {
        return context.json({
          data: await tickets.markMessageRead(
            context.req.valid('param').id,
            actor.id,
          ),
        });
      } catch (error) {
        serviceError(error);
      }
    },
  );

  // --- Operations ----------------------------------------------------------
  /**
   * Refuse the on-demand run when the corresponding Scheduler task is paused,
   * then run it through the Scheduler so the trigger count, last-trigger time
   * and execution records on the scheduled-tasks page show it. When Scheduler
   * is absent or its definition has not synchronized yet there is nothing to
   * route through, so the business operation runs directly — the result stays
   * the same, only the execution record is missing.
   */
  const runOperation = async (
    key: string,
    fallback: () => Promise<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> => {
    const outcome = await runScheduleNow(app, key);
    if (!outcome) {
      return {
        ...(await fallback()),
        scheduleId: null,
        occurrenceId: null,
        status: 'unscheduled',
      };
    }
    return {
      ...outcome.result,
      scheduleId: outcome.scheduleId,
      occurrenceId: outcome.occurrenceId,
      status: outcome.status,
      ...(outcome.reason ? { reason: outcome.reason } : {}),
    };
  };

  router.post(
    '/service/operations/generate-inspections',
    describeRoute({
      tags,
      summary: 'Run today inspection-task generation on demand',
      operationId: 'serviceOperationsGenerateInspections',
      responses: {
        200: dataResponse(z.record(z.string(), z.unknown())),
        400: apiErrorResponse(400),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      await assertScheduleEnabled('service.daily-inspections');
      return context.json({
        data: await runOperation('service.daily-inspections', () =>
          tickets.generateDailyInspections(),
        ),
      });
    },
  );

  router.post(
    '/service/operations/send-overdue-reminders',
    describeRoute({
      tags,
      summary: 'Run overdue-reminder delivery on demand',
      operationId: 'serviceOperationsSendOverdueReminders',
      responses: {
        200: dataResponse(z.record(z.string(), z.unknown())),
        400: apiErrorResponse(400),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      await assertScheduleEnabled('service.overdue-reminders');
      return context.json({
        data: await runOperation('service.overdue-reminders', () =>
          tickets.sendOverdueReminders(),
        ),
      });
    },
  );

  /**
   * What is really wired in this installation, so the UI can say whether a
   * capability is available instead of pretending.
   */
  router.get(
    '/service/integration-status',
    describeRoute({
      tags,
      summary:
        'Report the availability of the platforms this app integrates with',
      operationId: 'serviceIntegrationStatus',
      responses: {
        200: dataResponse(z.record(z.string(), z.unknown())),
        401: apiErrorResponses['401'],
        500: apiErrorResponses['500'],
      },
    }),
    async (context) => {
      await requireActor(app, context);
      return context.json({ data: integrationStatus(app) });
    },
  );
}

async function syncManualToKnowledgeBase(
  app: Application,
  manual: { id: number; title: string; model: string; fileId: string | null },
): Promise<{ status: string; message: string; key: string | null }> {
  if (!app.container.has(knowledgeBaseManifestServiceToken)) {
    return {
      status: 'unconfigured',
      message:
        'AI knowledge base is not registered in this application, so the manual is stored but not indexed.',
      key: null,
    };
  }
  if (!manual.fileId) {
    return {
      status: 'failed',
      message:
        'No source file is attached to this manual, so there is nothing to index.',
      key: null,
    };
  }
  const status = integrationStatus(app);
  if (!status.vectorDatabase || !status.llmService || !status.embeddingModel) {
    return {
      status: 'unconfigured',
      message: `AI knowledge base is not configured: ${status.missing.join(', ')}.`,
      key: null,
    };
  }
  try {
    const service = app.container.resolve(knowledgeBaseManifestServiceToken);
    const key = `manual-${manual.id}-${manual.model}`;
    const records = await service.apply([
      {
        source: { disk: 'local', location: `manuals/${manual.id}` },
        manifest: {
          key,
          operation: 'init',
          files: [],
        },
      },
    ]);
    const record = records[0];
    const recordStatus = String(record?.status ?? 'PENDING').toLowerCase();
    return {
      status: recordStatus,
      message:
        record?.errorMessage ??
        `Knowledge base accepted the manual (${recordStatus}).`,
      key,
    };
  } catch (error) {
    return {
      status: 'failed',
      message: `Knowledge base indexing failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      key: null,
    };
  }
}

/** Reads the resolved configuration; nothing here is faked. */
export function integrationStatus(app: Application): {
  authorization: boolean;
  workflow: boolean;
  scheduler: boolean;
  notification: boolean;
  knowledgeBase: boolean;
  llmService: boolean;
  vectorDatabase: boolean;
  embeddingModel: boolean;
  missing: string[];
} {
  const ai = app.config.get<Record<string, unknown>>('ai') ?? {};
  const llmServices = ai.llmServices as Record<string, unknown> | undefined;
  const vectorDatabases = ai.vectorDatabases as readonly unknown[] | undefined;
  const embeddingModel = Boolean(
    ai.embeddingModel ?? ai.embedding ?? ai.defaultEmbeddingModel,
  );
  const workflow = app.container.has(workflowServiceToken);
  const scheduler = app.container.has(schedulerServiceToken);
  const knowledgeBase = app.container.has(knowledgeBaseManifestServiceToken);
  const llmService = Boolean(
    llmServices && Object.keys(llmServices).length > 0,
  );
  const vectorDatabase = Boolean(vectorDatabases && vectorDatabases.length > 0);
  const missing: string[] = [];
  if (!llmService) {
    missing.push('no LLM service is configured (ai.llmServices)');
  }
  if (!vectorDatabase) {
    missing.push('no vector database is configured (ai.vectorDatabases)');
  }
  if (!embeddingModel) {
    missing.push('no embedding model is configured');
  }
  // The permission platform is reported as reachable without being part of the
  // returned facts: an integration status that cannot see it is incomplete.
  const authorization = app.container.has(authorizationToken);
  return {
    authorization,
    workflow,
    scheduler,
    notification: app.container.has(notificationServiceToken),
    knowledgeBase,
    llmService,
    vectorDatabase,
    embeddingModel,
    missing,
  };
}
