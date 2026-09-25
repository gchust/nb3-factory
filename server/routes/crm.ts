import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type Context } from 'hono';

import {
  CrmDuplicateError,
  CrmNotFoundError,
  CrmService,
  CrmValidationError,
} from '../providers/crm-service.js';

/**
 * HTTP surface of the simple CRM feature. Every path is mounted under `/api`
 * and enforces its own session: mounting under `/api` authenticates nothing.
 */

const CRM_PREFIXES = ['/customers', '/contacts', '/opportunities'] as const;

/** Reads a JSON object body; a malformed or non-object body is treated as empty. */
async function readBody(
  context: Context<AuthEnv>,
): Promise<Record<string, unknown>> {
  try {
    const parsed = await context.req.json<Record<string, unknown>>();
    return parsed !== null && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Reads a positive integer route parameter. */
function readId(context: Context<AuthEnv>): number {
  const id = Number(context.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw new CrmValidationError('INVALID_ID', 'The record id is not valid.');
  }
  return id;
}

/** Translates a domain error into its HTTP response; anything else is rethrown. */
function toResponse(context: Context<AuthEnv>, error: unknown): Response {
  if (error instanceof CrmValidationError) {
    return context.json({ code: error.code, message: error.message }, 422);
  }
  if (error instanceof CrmDuplicateError) {
    return context.json(
      { code: 'DUPLICATE_NAME', message: error.message },
      409,
    );
  }
  if (error instanceof CrmNotFoundError) {
    return context.json({ code: 'NOT_FOUND', message: error.message }, 404);
  }
  throw error;
}

export const crmApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes<Application>((app) => {
    const router = new Hono<AuthEnv>();
    const auth = app.container.resolve(authenticationToken);
    const crm = new CrmService(app.container.resolve(databaseManagerToken));

    // Scope authentication to this contribution's own prefixes. A `use('*')`
    // would leak into route contributions registered after this one.
    for (const prefix of CRM_PREFIXES) {
      router.use(prefix, auth.required());
      router.use(`${prefix}/*`, auth.required());
    }

    router.get('/customers', async (context) =>
      context.json({ data: await crm.listCustomers() }),
    );

    router.post('/customers', async (context) => {
      try {
        const record = await crm.createCustomer(await readBody(context));
        return context.json({ data: record }, 201);
      } catch (error) {
        return toResponse(context, error);
      }
    });

    router.get('/customers/:id', async (context) => {
      try {
        return context.json({ data: await crm.getCustomer(readId(context)) });
      } catch (error) {
        return toResponse(context, error);
      }
    });

    router.patch('/customers/:id', async (context) => {
      try {
        const record = await crm.updateCustomer(
          readId(context),
          await readBody(context),
        );
        return context.json({ data: record });
      } catch (error) {
        return toResponse(context, error);
      }
    });

    router.get('/contacts', async (context) =>
      context.json({ data: await crm.listContacts() }),
    );

    router.post('/contacts', async (context) => {
      try {
        const record = await crm.createContact(await readBody(context));
        return context.json({ data: record }, 201);
      } catch (error) {
        return toResponse(context, error);
      }
    });

    router.patch('/contacts/:id', async (context) => {
      try {
        const record = await crm.updateContact(
          readId(context),
          await readBody(context),
        );
        return context.json({ data: record });
      } catch (error) {
        return toResponse(context, error);
      }
    });

    router.get('/opportunities', async (context) => {
      const stage = context.req.query('stage');
      try {
        return context.json({
          data: await crm.listOpportunities(stage),
        });
      } catch (error) {
        return toResponse(context, error);
      }
    });

    router.post('/opportunities', async (context) => {
      try {
        const record = await crm.createOpportunity(await readBody(context));
        return context.json({ data: record }, 201);
      } catch (error) {
        return toResponse(context, error);
      }
    });

    router.patch('/opportunities/:id', async (context) => {
      try {
        const record = await crm.updateOpportunity(
          readId(context),
          await readBody(context),
        );
        return context.json({ data: record });
      } catch (error) {
        return toResponse(context, error);
      }
    });

    // The contribution's factory is typed with Hono's untyped default env while
    // this router carries `AuthEnv` so `auth.required()` type-checks; the
    // runtime value is the same. No handler reads `context.get('auth')` here.
    return router as unknown as Hono;
  });
