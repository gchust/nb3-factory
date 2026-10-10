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
  createKnowledge,
  createManual,
  getKnowledge,
  getManual,
  listKnowledge,
  listManuals,
  publishKnowledge,
  unpublishKnowledge,
  updateKnowledge,
  updateManual,
} from '../services/knowledge.js';
import {
  deviceManualSchema,
  idParam,
  knowledgeInput,
  listMetaSchema,
  manualIndexResultSchema,
  manualInput,
  paginationQuery,
  repairKnowledgeSchema,
} from './schemas.js';
import {
  data,
  page,
  requestContext,
  type ServiceHttpServices,
  type ServiceRouter,
} from './support.js';

const listKnowledgeQuery = paginationQuery.extend({
  status: z.string().trim().max(16).optional(),
  category: z.string().trim().max(64).optional(),
});

const listManualQuery = paginationQuery.extend({
  status: z.string().trim().max(16).optional(),
  deviceId: z.coerce.number().int().positive().optional(),
});

export function registerKnowledgeRoutes(
  router: ServiceRouter,
  services: ServiceHttpServices,
): void {
  router.get(
    '/repairKnowledge',
    describeRoute({
      tags: ['Repair knowledge'],
      summary: 'List repair knowledge entries',
      operationId: 'listRepairKnowledge',
      responses: {
        '200': listResponse(repairKnowledgeSchema, listMetaSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', listKnowledgeQuery),
    async (context) =>
      page(
        context,
        await listKnowledge(
          requestContext(services, context),
          context.req.valid('query'),
        ),
      ),
  );

  router.post(
    '/repairKnowledge',
    describeRoute({
      tags: ['Repair knowledge'],
      summary: 'Create a repair knowledge entry',
      operationId: 'createRepairKnowledge',
      responses: {
        '200': dataResponse(repairKnowledgeSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', knowledgeInput),
    async (context) =>
      data(
        context,
        await createKnowledge(
          requestContext(services, context),
          context.req.valid('json'),
        ),
      ),
  );

  router.get(
    '/repairKnowledge/:id',
    describeRoute({
      tags: ['Repair knowledge'],
      summary: 'Read one repair knowledge entry',
      operationId: 'getRepairKnowledge',
      responses: {
        '200': dataResponse(repairKnowledgeSchema),
        '404': apiErrorResponse(404, 'No visible knowledge entry has this id.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', idParam),
    async (context) =>
      data(
        context,
        await getKnowledge(
          requestContext(services, context),
          context.req.valid('param').id,
        ),
      ),
  );

  router.patch(
    '/repairKnowledge/:id',
    describeRoute({
      tags: ['Repair knowledge'],
      summary: 'Update a repair knowledge entry',
      operationId: 'updateRepairKnowledge',
      responses: {
        '200': dataResponse(repairKnowledgeSchema),
        '404': apiErrorResponse(
          404,
          'No manageable knowledge entry has this id.',
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', idParam),
    apiValidator('json', knowledgeInput.partial()),
    async (context) =>
      data(
        context,
        await updateKnowledge(
          requestContext(services, context),
          context.req.valid('param').id,
          context.req.valid('json'),
        ),
      ),
  );

  for (const [suffix, operationId, summary, run] of [
    [
      'publish',
      'publishRepairKnowledge',
      'Publish a repair knowledge entry',
      publishKnowledge,
    ],
    [
      'unpublish',
      'unpublishRepairKnowledge',
      'Return a published entry to draft',
      unpublishKnowledge,
    ],
  ] as const) {
    router.post(
      `/repairKnowledge/:id/${suffix}`,
      describeRoute({
        tags: ['Repair knowledge'],
        summary,
        operationId,
        responses: {
          '200': dataResponse(repairKnowledgeSchema),
          '404': apiErrorResponse(
            404,
            'No manageable knowledge entry has this id.',
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', idParam),
      async (context) =>
        data(
          context,
          await run(
            requestContext(services, context),
            context.req.valid('param').id,
          ),
        ),
    );
  }

  router.get(
    '/deviceManuals',
    describeRoute({
      tags: ['Device manuals'],
      summary: 'List device manuals and their knowledge-base status',
      operationId: 'listDeviceManuals',
      responses: {
        '200': listResponse(deviceManualSchema, listMetaSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', listManualQuery),
    async (context) =>
      page(
        context,
        await listManuals(
          requestContext(services, context),
          context.req.valid('query'),
        ),
      ),
  );

  router.post(
    '/deviceManuals',
    describeRoute({
      tags: ['Device manuals'],
      summary:
        'Upload a Markdown manual and try to load it into the knowledge base',
      operationId: 'createDeviceManual',
      responses: {
        '200': dataResponse(deviceManualSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', manualInput),
    async (context) => {
      const serviceContext = requestContext(services, context);
      const manual = await createManual(
        serviceContext,
        context.req.valid('json'),
      );
      // The document is stored first and indexed afterwards. The manual keeps
      // whatever status the ingestion actually reported, so a sandbox without a
      // vector database shows `failed` with its reason instead of a fake `ready`.
      const outcome = await services.manualIndex?.indexManual(manual.id);
      const current = outcome
        ? await getManual(serviceContext, manual.id)
        : manual;
      return data(context, current);
    },
  );

  router.get(
    '/deviceManuals/:id',
    describeRoute({
      tags: ['Device manuals'],
      summary: 'Read one device manual',
      operationId: 'getDeviceManual',
      responses: {
        '200': dataResponse(deviceManualSchema),
        '404': apiErrorResponse(404, 'No visible manual has this id.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', idParam),
    async (context) =>
      data(
        context,
        await getManual(
          requestContext(services, context),
          context.req.valid('param').id,
        ),
      ),
  );

  router.patch(
    '/deviceManuals/:id',
    describeRoute({
      tags: ['Device manuals'],
      summary: 'Update a device manual and reset its knowledge-base status',
      operationId: 'updateDeviceManual',
      responses: {
        '200': dataResponse(deviceManualSchema),
        '404': apiErrorResponse(404, 'No manageable manual has this id.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', idParam),
    apiValidator('json', manualInput.partial()),
    async (context) =>
      data(
        context,
        await updateManual(
          requestContext(services, context),
          context.req.valid('param').id,
          context.req.valid('json'),
        ),
      ),
  );

  router.post(
    '/deviceManuals/:id/reindex',
    describeRoute({
      tags: ['Device manuals'],
      summary:
        'Run knowledge-base ingestion for a manual and report the real outcome',
      operationId: 'reindexDeviceManual',
      responses: {
        '200': dataResponse(manualIndexResultSchema),
        '404': apiErrorResponse(404, 'No visible manual has this id.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', idParam),
    async (context) => {
      const serviceContext = requestContext(services, context);
      const id = context.req.valid('param').id;
      await getManual(serviceContext, id);
      const index = services.manualIndex;
      if (!index) {
        return data(context, {
          status: 'failed',
          detail: 'No manual index service is registered in this application.',
        });
      }
      return data(context, await index.indexManual(id));
    },
  );
}
