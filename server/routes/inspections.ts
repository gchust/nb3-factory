import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import {
  serviceDirectoryServiceToken,
  serviceInspectionServiceToken,
} from '../providers/tokens.js';
import type { ServiceDirectoryService } from '../providers/directory-service.js';
import type { ServiceInspectionService } from '../providers/inspection-service.js';
import {
  actorOf,
  authorizeAction,
  errorCode,
  jsonBody,
  numericParam,
  queryBoolean,
  queryInteger,
  queryValue,
  requirePolicy,
  type ServiceEnv,
} from './service-shared.js';

function notFound(): HTTPException {
  return new HTTPException(404, { message: 'Not found' });
}

/** Inspection plans, their completion, and the read-only staff directory. */
export function createInspectionRoutes(
  app: AppPluginApplication,
): Hono<ServiceEnv> {
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const inspections: ServiceInspectionService = app.container.resolve(
    serviceInspectionServiceToken,
  );
  const routes = new Hono<ServiceEnv>();

  routes.use('*', auth.required(), authz.middleware());

  routes.get('/', async (context) => {
    const policies = await authorizeAction(
      context,
      'service.inspections',
      'view',
    );
    const data = await inspections.list(
      requirePolicy(policies, 'serviceInspections'),
      {
        status: queryValue(context, 'status'),
        assigneeId: queryValue(context, 'assigneeId'),
        customerId: queryInteger(context, 'customerId'),
        deviceId: queryInteger(context, 'deviceId'),
        from: queryValue(context, 'from'),
        to: queryValue(context, 'to'),
        overdue: queryBoolean(context, 'overdue'),
        limit: queryInteger(context, 'limit'),
        offset: queryInteger(context, 'offset'),
      },
    );
    return context.json({ data });
  });

  routes.post('/', async (context) => {
    const policies = await authorizeAction(
      context,
      'service.inspections',
      'manage',
    );
    const body = await jsonBody(context);
    const title = body.title;
    const scheduledDate = body.scheduledDate;
    if (typeof title !== 'string' || title.trim().length === 0) {
      throw new HTTPException(400, { message: 'title is required' });
    }
    if (
      typeof scheduledDate !== 'string' ||
      Number.isNaN(Date.parse(scheduledDate))
    ) {
      throw new HTTPException(400, { message: 'scheduledDate is required' });
    }
    const inspection = await inspections.create(
      requirePolicy(policies, 'serviceInspections'),
      {
        title,
        scheduledDate: new Date(scheduledDate).toISOString(),
        customerId: requireInteger(body, 'customerId'),
        deviceId: requireInteger(body, 'deviceId'),
        assigneeId:
          typeof body.assigneeId === 'string' ? body.assigneeId : null,
        findings: typeof body.findings === 'string' ? body.findings : null,
      },
      actorOf(context),
    );
    return context.json({ data: inspection }, 201);
  });

  routes.get('/:id', async (context) => {
    const policies = await authorizeAction(
      context,
      'service.inspections',
      'view',
    );
    const inspection = await inspections.get(
      requirePolicy(policies, 'serviceInspections'),
      numericParam(context),
    );
    if (!inspection) throw notFound();
    return context.json({ data: inspection });
  });

  routes.post('/:id/complete', async (context) => {
    const policies = await authorizeAction(
      context,
      'service.inspections',
      'complete',
    );
    const body = await jsonBody(context);
    const result = body.result;
    if (result !== 'normal' && result !== 'abnormal') {
      throw new HTTPException(400, {
        message: 'result must be normal or abnormal',
      });
    }
    try {
      const inspection = await inspections.complete(
        requirePolicy(policies, 'serviceInspections'),
        numericParam(context),
        {
          result,
          findings: typeof body.findings === 'string' ? body.findings : null,
          message: typeof body.message === 'string' ? body.message : null,
        },
        actorOf(context),
      );
      return context.json({ data: inspection });
    } catch (error) {
      if (errorCode(error) === 'recordNotFound') throw notFound();
      throw error;
    }
  });

  return routes;
}

/** Read-only staff directory for assignment pickers. */
export function createDirectoryRoutes(
  app: AppPluginApplication,
): Hono<ServiceEnv> {
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const directory: ServiceDirectoryService = app.container.resolve(
    serviceDirectoryServiceToken,
  );
  const routes = new Hono<ServiceEnv>();

  routes.use('*', auth.required(), authz.middleware());

  // Only staff who can see the service dashboard may read the directory.
  routes.get('/users', async (context) => {
    await authorizeAction(context, 'service.dashboard', 'view');
    return context.json({ data: await directory.listUsers() });
  });

  routes.get('/teams', async (context) => {
    await authorizeAction(context, 'service.dashboard', 'view');
    return context.json({ data: await directory.listTeams() });
  });

  return routes;
}

function requireInteger(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  if (!Number.isInteger(parsed)) {
    throw new HTTPException(400, { message: `${key} is required` });
  }
  return parsed;
}
