import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { Hono } from 'hono';

import {
  ExpenseClaimValidationError,
  expenseClaimServiceToken,
  type ExpenseClaim,
} from '../providers/expense-claims.js';
import {
  EXPENSE_CLAIM_FILES_ACCESS_PATH,
  EXPENSE_CLAIM_FILES_COLLECTION,
} from './expense-claim-files.js';

/**
 * Application routes for expense claims:
 *
 * - `GET  /api/expense-claims`      list with the receipt count per claim
 * - `POST /api/expense-claims`      create a claim from already uploaded file ids
 * - `GET  /api/expense-claims/:id`  one claim with its receipt files and download URLs
 *
 * Receipt files are uploaded first through the file repository resource
 * (`/api/expenseClaimFiles:uploadMany`); creating the claim only links the
 * returned file ids, so an abandoned form never leaves a half-written claim.
 */
export const expenseClaimRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const claims = app.container.resolve(expenseClaimServiceToken);
    const auth = app.container.resolve(authenticationToken);
    const files = app.container
      .resolve(serverFileRepositoryManagerToken)
      .repository(EXPENSE_CLAIM_FILES_COLLECTION, {
        connection: 'main',
        disk: 'local',
        accessPath: EXPENSE_CLAIM_FILES_ACCESS_PATH,
      });
    const basePath = (app.publicBasePath ?? '').replace(/\/$/u, '');

    const decorate = (claim: ExpenseClaim) => ({
      ...claim,
      attachments: claim.attachments.map((attachment) => ({
        ...attachment,
        contentUrl: `${basePath}${files.getUrl(attachment)}`,
      })),
    });

    // Isolated sub-router so `auth.required()` cannot leak into another route
    // contribution mounted on the same application router.
    const routes = new Hono();
    routes.use('*', auth.required());

    routes.get('/', async (context) =>
      context.json({ data: await claims.list() }),
    );

    routes.post('/', async (context) => {
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        return context.json(
          { code: 'INVALID_JSON', message: 'A JSON body is required.' },
          400,
        );
      }

      try {
        const claim = await claims.create(body);
        return context.json({ data: decorate(claim) }, 201);
      } catch (error) {
        if (error instanceof ExpenseClaimValidationError) {
          return context.json(
            { code: error.code, message: error.message },
            400,
          );
        }
        throw error;
      }
    });

    routes.get('/:id', async (context) => {
      const id = Number(context.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) {
        return context.json(
          { code: 'INVALID_ID', message: 'A numeric claim id is required.' },
          400,
        );
      }
      const claim = await claims.get(id);
      if (!claim) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Expense claim not found.' },
          404,
        );
      }
      return context.json({ data: decorate(claim) });
    });

    router.route('/expense-claims', routes);
    return router;
  });
