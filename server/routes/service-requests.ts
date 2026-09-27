import { Hono } from 'hono';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';
import {
  ServiceRequestWorkflowError,
  serviceRequestServiceToken,
  type CreateServiceRequestInput,
} from '../providers/service-request-service.js';

interface CreateServiceRequestBody {
  readonly title?: unknown;
  readonly urgent?: unknown;
  readonly assigneeId?: unknown;
}

function parseId(raw: string | undefined): number | undefined {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function parseCreateBody(
  body: CreateServiceRequestBody,
): CreateServiceRequestInput | undefined {
  const { title, urgent, assigneeId } = body;
  if (typeof title !== 'string') return undefined;
  if (typeof assigneeId !== 'string') return undefined;
  return {
    title,
    urgent: urgent === true,
    assigneeId,
  };
}

/**
 * Application-owned HTTP surface for service requests. It owns its security:
 * an isolated sub-router mounted at the request prefix installs
 * `auth.required()` on every path it owns, and the workflow's own effects run
 * behind the acceptance endpoint.
 */
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const authentication = app.container.resolve(authenticationToken);
    const service = app.container.resolve(serviceRequestServiceToken);

    const router = new Hono();

    router.use('/service-requests/*', authentication.required());

    router.get('/service-requests', async (context) =>
      context.json({ data: await service.list() }),
    );

    router.post('/service-requests', async (context) => {
      let body: CreateServiceRequestBody;
      try {
        body = await context.req.json();
      } catch {
        return context.json(
          { code: 'INVALID_BODY', message: 'A JSON request body is required.' },
          400,
        );
      }
      const input = parseCreateBody(body);
      if (!input) {
        return context.json(
          {
            code: 'INVALID_BODY',
            message: 'title and assigneeId are required.',
          },
          400,
        );
      }
      try {
        const record = await service.create(input);
        return context.json({ data: record }, 201);
      } catch (error) {
        return context.json(
          {
            code: 'INVALID_BODY',
            message: error instanceof Error ? error.message : 'Invalid input.',
          },
          400,
        );
      }
    });

    // Declared before the `:id` route so "assignees" is not read as an id.
    router.get('/service-requests/assignees', async (context) =>
      context.json({ data: await service.findAssignees() }),
    );

    router.get('/service-requests/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json(
          { code: 'INVALID_ID', message: 'A numeric request id is required.' },
          400,
        );
      }
      const record = await service.get(id);
      if (!record) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Service request not found.' },
          404,
        );
      }
      return context.json({ data: record });
    });

    router.post('/service-requests/:id/accept', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json(
          { code: 'INVALID_ID', message: 'A numeric request id is required.' },
          400,
        );
      }
      const record = await service.get(id);
      if (!record) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Service request not found.' },
          404,
        );
      }
      let receipt;
      try {
        receipt = await service.accept(id);
      } catch (error) {
        if (error instanceof ServiceRequestWorkflowError) {
          return context.json(
            { code: error.code, message: error.message },
            502,
          );
        }
        throw error;
      }
      if (receipt.status === 'skipped') {
        return context.json(
          {
            code: 'SERVICE_REQUEST_WORKFLOW_UNAVAILABLE',
            reason: receipt.reason,
            message: 'The service request acceptance workflow is not enabled.',
          },
          503,
        );
      }
      return context.json({
        data: { runId: receipt.runId, request: receipt.request },
      });
    });

    return router;
  },
);

export default [apiRoutes];
