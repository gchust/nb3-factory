import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import {
  fieldVisitServiceToken,
  FieldVisitValidationError,
  type FieldVisitInput,
} from '../providers/field-visits.js';

/**
 * Field service follow-up API.
 *
 * The routes own their authentication: the sub-router mounts `auth.required()` on everything under `/field-visits`, so
 * no endpoint here depends on middleware declared somewhere else.
 */
export const fieldVisitApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const auth = app.container.resolve(authenticationToken);
    const visits = app.container.resolve(fieldVisitServiceToken);

    const router = new Hono();
    const routes = new Hono<AuthEnv>();
    routes.use('*', auth.required());

    routes.get('/', async (context) => {
      const search = context.req.query('search') ?? '';
      const result = await visits.list({ search });
      return context.json({ data: result.records, total: result.total });
    });

    routes.post('/', async (context) => {
      const body = (await context.req
        .json()
        .catch(() => ({}))) as FieldVisitInput;
      try {
        const record = await visits.create(body);
        return context.json({ data: record }, 201);
      } catch (error) {
        if (error instanceof FieldVisitValidationError) {
          return validationResponse(context, error);
        }
        throw error;
      }
    });

    routes.patch('/:id', async (context) => {
      const id = Number(context.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) {
        return context.json(
          { code: 'FIELD_VISIT_NOT_FOUND', message: 'Record not found.' },
          404,
        );
      }

      const body = (await context.req
        .json()
        .catch(() => ({}))) as FieldVisitInput;
      try {
        const record = await visits.update(id, body);
        if (!record) {
          return context.json(
            { code: 'FIELD_VISIT_NOT_FOUND', message: 'Record not found.' },
            404,
          );
        }
        return context.json({ data: record });
      } catch (error) {
        if (error instanceof FieldVisitValidationError) {
          return validationResponse(context, error);
        }
        throw error;
      }
    });

    router.route('/field-visits', routes);
    return router;
  });

function validationResponse(
  context: Context,
  error: FieldVisitValidationError,
) {
  return context.json(
    {
      code: error.code,
      message: error.message,
      issues: error.issues,
    },
    400,
  );
}
