import {
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  describeRoute,
  listResponse,
} from '@nocobase/app-server/router';
import { z } from 'zod';

import {
  completeInspection,
  createInspection,
  dashboardSummary,
  getInspection,
  listInspections,
} from '../services/inspections.js';
import {
  completeInspectionInput,
  dashboardSummarySchema,
  idParam,
  inspectionInput,
  listMetaSchema,
  paginationQuery,
  serviceInspectionSchema,
} from './schemas.js';
import {
  data,
  page,
  requestContext,
  type ServiceHttpServices,
  type ServiceRouter,
} from './support.js';

const listInspectionQuery = paginationQuery.extend({
  status: z.string().trim().max(16).optional(),
  deviceId: z.coerce.number().int().positive().optional(),
  assigneeId: z.string().trim().max(64).optional(),
});

export function registerInspectionRoutes(
  router: ServiceRouter,
  services: ServiceHttpServices,
): void {
  router.get(
    '/serviceInspections',
    describeRoute({
      tags: ['Service inspections'],
      summary: 'List service inspections',
      operationId: 'listServiceInspections',
      responses: {
        '200': listResponse(serviceInspectionSchema, listMetaSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', listInspectionQuery),
    async (context) =>
      page(
        context,
        await listInspections(
          requestContext(services, context),
          context.req.valid('query'),
        ),
      ),
  );

  router.post(
    '/serviceInspections',
    describeRoute({
      tags: ['Service inspections'],
      summary: 'Plan an inspection for a device',
      operationId: 'createServiceInspection',
      responses: {
        '200': dataResponse(serviceInspectionSchema),
        '404': apiErrorResponse(404, 'The device does not exist.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', inspectionInput),
    async (context) =>
      data(
        context,
        await createInspection(
          requestContext(services, context),
          context.req.valid('json'),
        ),
      ),
  );

  router.get(
    '/serviceInspections/:id',
    describeRoute({
      tags: ['Service inspections'],
      summary: 'Read one service inspection',
      operationId: 'getServiceInspection',
      responses: {
        '200': dataResponse(serviceInspectionSchema),
        '404': apiErrorResponse(404, 'No visible inspection has this id.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', idParam),
    async (context) =>
      data(
        context,
        await getInspection(
          requestContext(services, context),
          context.req.valid('param').id,
        ),
      ),
  );

  router.post(
    '/serviceInspections/:id/complete',
    describeRoute({
      tags: ['Service inspections'],
      summary: 'Record the result of an inspection',
      operationId: 'completeServiceInspection',
      responses: {
        '200': dataResponse(serviceInspectionSchema),
        '404': apiErrorResponse(404, 'No visible inspection has this id.'),
        '409': apiErrorResponse(409, 'The inspection is already completed.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', idParam),
    apiValidator('json', completeInspectionInput),
    async (context) =>
      data(
        context,
        await completeInspection(
          requestContext(services, context),
          context.req.valid('param').id,
          context.req.valid('json'),
        ),
      ),
  );

  router.get(
    '/serviceDashboard/summary',
    describeRoute({
      tags: ['Service dashboard'],
      summary:
        'Read the counters and the recent orders of the service dashboard',
      operationId: 'getServiceDashboardSummary',
      responses: {
        '200': dataResponse(dashboardSummarySchema),
        ...apiErrorResponses,
      },
    }),
    async (context) =>
      data(context, await dashboardSummary(requestContext(services, context))),
  );
}
