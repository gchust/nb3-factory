import {
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  describeRoute,
  listResponse,
} from '@nocobase/app-server/router';

import { autoAcceptOrder, acceptOrderAsUser } from '../services/acceptance.js';
import {
  MAX_ATTACHMENT_BYTES,
  readOrderAttachment,
  removeOrderAttachment,
  uploadOrderAttachment,
} from '../services/attachments.js';
import {
  assignOrder,
  confirmOrder,
  createOrder,
  getOrder,
  grantOrderShare,
  listOrderAttachments,
  listOrders,
  listOrderTimeline,
  returnOrder,
  revokeOrderShare,
  startOrder,
  submitOrder,
} from '../services/orders.js';
import { ServiceError } from '../services/errors.js';
import type { RequestServiceContext } from '../services/context.js';
import {
  acceptOrderInput,
  assignOrderInput,
  createOrderInput,
  grantShareInput,
  listMetaSchema,
  orderParam,
  paginationQuery,
  removalResultSchema,
  serviceOrderFileSchema,
  serviceOrderSchema,
  serviceOrderShareSchema,
  shareParam,
  submitOrderInput,
  returnOrderInput,
  orderTimelineSchema,
  uploadParam,
} from './schemas.js';
import {
  data,
  page,
  requestContext,
  type ServiceHttpServices,
  type ServiceRouter,
} from './support.js';
import type { Context } from 'hono';
import { z } from 'zod';

/** The list query of the order collection. */
const listOrderQuery = paginationQuery.extend({
  status: z.string().trim().max(32).optional(),
  priority: z.string().trim().max(16).optional(),
  assigneeId: z.string().trim().max(64).optional(),
  customerId: z.coerce.number().int().positive().optional(),
  deviceId: z.coerce.number().int().positive().optional(),
  dueBefore: z.string().trim().max(64).optional(),
});

const createdOrderSchema = z.object({
  order: serviceOrderSchema,
  created: z.boolean(),
});

const acceptedOrderSchema = z.object({
  order: serviceOrderSchema,
  viaWorkflow: z.boolean(),
});

/** Turns a `File` from a multipart body into bytes, refusing an oversized one early. */
async function readUpload(context: Context): Promise<{
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}> {
  const body = (await context.req.parseBody()) as Record<string, unknown>;
  const file = body.file;
  if (!(file instanceof File)) {
    throw new ServiceError(
      'INVALID_ARGUMENT',
      'MULTIPART_FILE_REQUIRED',
      'The request must be multipart/form-data with a `file` part.',
    );
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new ServiceError(
      'INVALID_ARGUMENT',
      'ATTACHMENT_TOO_LARGE',
      `The attachment is larger than ${MAX_ATTACHMENT_BYTES} bytes.`,
    );
  }
  return {
    filename: file.name,
    mimeType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
}

export function registerOrderRoutes(
  router: ServiceRouter,
  services: ServiceHttpServices,
): void {
  router.get(
    '/serviceOrders',
    describeRoute({
      tags: ['Service orders'],
      summary: 'List service orders visible to the caller',
      operationId: 'listServiceOrders',
      responses: {
        '200': listResponse(serviceOrderSchema, listMetaSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', listOrderQuery),
    async (context) => {
      const query = context.req.valid('query');
      return page(
        context,
        await listOrders(requestContext(services, context), {
          ...query,
          dueBefore: query.dueBefore,
        }),
      );
    },
  );

  router.post(
    '/serviceOrders',
    describeRoute({
      tags: ['Service orders'],
      summary: 'Create a service order and accept it automatically',
      operationId: 'createServiceOrder',
      responses: {
        '200': dataResponse(createdOrderSchema),
        '400': apiErrorResponse(400, 'The customer does not own the device.'),
        '404': apiErrorResponse(404, 'The device or customer does not exist.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', createOrderInput),
    async (context) => {
      const serviceContext = requestContext(services, context);
      const created = await createOrder(
        serviceContext,
        context.req.valid('json'),
      );
      if (!created.created) {
        return data(context, created);
      }
      const accepted = await autoAcceptOrder(serviceContext, created.order.id);
      return data(context, {
        order: accepted.order ?? created.order,
        created: true,
      });
    },
  );

  router.get(
    '/serviceOrders/:orderId',
    describeRoute({
      tags: ['Service orders'],
      summary: 'Read one service order',
      operationId: 'getServiceOrder',
      responses: {
        '200': dataResponse(serviceOrderSchema),
        '404': apiErrorResponse(404, 'No visible order has this id.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', orderParam),
    async (context) =>
      data(
        context,
        await getOrder(
          requestContext(services, context),
          context.req.valid('param').orderId,
        ),
      ),
  );

  router.post(
    '/serviceOrders/:orderId/accept',
    describeRoute({
      tags: ['Service orders'],
      summary: 'Accept an order, through the acceptance workflow',
      operationId: 'acceptServiceOrder',
      responses: {
        '200': dataResponse(acceptedOrderSchema),
        '404': apiErrorResponse(404, 'No processable order has this id.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', orderParam),
    apiValidator('json', acceptOrderInput),
    async (context) => {
      const result = await acceptOrderAsUser(
        requestContext(services, context),
        context.req.valid('param').orderId,
        context.req.valid('json').acceptanceNote ?? null,
      );
      return data(context, result);
    },
  );

  /**
   * Registers a status transition that takes no request body.
   *
   * `start` and `confirm` share the shape, so they are declared once; the routes
   * that carry input are written out.
   */
  const transition = (
    path: string,
    operationId: string,
    summary: string,
    run: (
      serviceContext: RequestServiceContext,
      orderId: number,
    ) => Promise<unknown>,
  ) => {
    router.post(
      path,
      describeRoute({
        tags: ['Service orders'],
        summary,
        operationId,
        responses: {
          '200': dataResponse(serviceOrderSchema),
          '404': apiErrorResponse(404, 'No processable order has this id.'),
          '409': apiErrorResponse(
            409,
            'The order is not in a status this transition allows.',
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', orderParam),
      async (context) =>
        data(
          context,
          await run(
            requestContext(services, context),
            context.req.valid('param').orderId,
          ),
        ),
    );
  };

  transition(
    '/serviceOrders/:orderId/start',
    'startServiceOrder',
    'Start processing an accepted order',
    (serviceContext, orderId) => startOrder(serviceContext, orderId),
  );

  router.post(
    '/serviceOrders/:orderId/submit',
    describeRoute({
      tags: ['Service orders'],
      summary: 'Submit a processed order for confirmation',
      operationId: 'submitServiceOrder',
      responses: {
        '200': dataResponse(serviceOrderSchema),
        '404': apiErrorResponse(404, 'No processable order has this id.'),
        '409': apiErrorResponse(409, 'The order is not being processed.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', orderParam),
    apiValidator('json', submitOrderInput),
    async (context) =>
      data(
        context,
        await submitOrder(
          requestContext(services, context),
          context.req.valid('param').orderId,
          context.req.valid('json').resolution,
        ),
      ),
  );

  transition(
    '/serviceOrders/:orderId/confirm',
    'confirmServiceOrder',
    'Confirm and close a submitted order',
    (serviceContext, orderId) => confirmOrder(serviceContext, orderId),
  );

  router.post(
    '/serviceOrders/:orderId/return',
    describeRoute({
      tags: ['Service orders'],
      summary: 'Return a submitted order for further work',
      operationId: 'returnServiceOrder',
      responses: {
        '200': dataResponse(serviceOrderSchema),
        '404': apiErrorResponse(404, 'No processable order has this id.'),
        '409': apiErrorResponse(
          409,
          'The order is not waiting for confirmation.',
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', orderParam),
    apiValidator('json', returnOrderInput),
    async (context) =>
      data(
        context,
        await returnOrder(
          requestContext(services, context),
          context.req.valid('param').orderId,
          context.req.valid('json').returnReason,
        ),
      ),
  );

  router.post(
    '/serviceOrders/:orderId/assign',
    describeRoute({
      tags: ['Service orders'],
      summary: 'Assign an order to an engineer, a group or a due date',
      operationId: 'assignServiceOrder',
      responses: {
        '200': dataResponse(serviceOrderSchema),
        '404': apiErrorResponse(404, 'No assignable order has this id.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', orderParam),
    apiValidator('json', assignOrderInput),
    async (context) =>
      data(
        context,
        await assignOrder(
          requestContext(services, context),
          context.req.valid('param').orderId,
          context.req.valid('json'),
        ),
      ),
  );

  router.get(
    '/serviceOrders/:orderId/timeline',
    describeRoute({
      tags: ['Service orders'],
      summary: 'Read the audit log and the temporary shares of an order',
      operationId: 'getServiceOrderTimeline',
      responses: {
        '200': dataResponse(orderTimelineSchema),
        '404': apiErrorResponse(404, 'No visible order has this id.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', orderParam),
    async (context) =>
      data(
        context,
        await listOrderTimeline(
          requestContext(services, context),
          context.req.valid('param').orderId,
        ),
      ),
  );

  router.post(
    '/serviceOrders/:orderId/shares',
    describeRoute({
      tags: ['Service orders'],
      summary: 'Grant an engineer temporary access to an order',
      operationId: 'grantServiceOrderShare',
      responses: {
        '200': dataResponse(serviceOrderShareSchema),
        '404': apiErrorResponse(404, 'No shareable order has this id.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', orderParam),
    apiValidator('json', grantShareInput),
    async (context) =>
      data(
        context,
        await grantOrderShare(
          requestContext(services, context),
          context.req.valid('param').orderId,
          context.req.valid('json'),
        ),
      ),
  );

  router.delete(
    '/serviceOrders/:orderId/shares/:shareId',
    describeRoute({
      tags: ['Service orders'],
      summary: 'Revoke a temporary order share',
      operationId: 'revokeServiceOrderShare',
      responses: {
        '200': dataResponse(serviceOrderShareSchema),
        '404': apiErrorResponse(404, 'The order or the share was not found.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', shareParam),
    async (context) => {
      const params = context.req.valid('param');
      return data(
        context,
        await revokeOrderShare(
          requestContext(services, context),
          params.orderId,
          params.shareId,
        ),
      );
    },
  );

  router.get(
    '/serviceOrders/:orderId/attachments',
    describeRoute({
      tags: ['Service order attachments'],
      summary: 'List the attachments of an order',
      operationId: 'listServiceOrderAttachments',
      responses: {
        '200': dataResponse(z.array(serviceOrderFileSchema)),
        '404': apiErrorResponse(404, 'No visible order has this id.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', orderParam),
    async (context) =>
      data(
        context,
        await listOrderAttachments(
          requestContext(services, context),
          context.req.valid('param').orderId,
        ),
      ),
  );

  router.post(
    '/serviceOrders/:orderId/attachments',
    describeRoute({
      tags: ['Service order attachments'],
      summary: 'Upload a PNG photo or a DOCX report onto an order',
      operationId: 'uploadServiceOrderAttachment',
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: { file: { type: 'string', format: 'binary' } },
              required: ['file'],
            },
          },
        },
      },
      responses: {
        '200': dataResponse(serviceOrderFileSchema),
        '400': apiErrorResponse(
          400,
          'The file is missing, empty, oversized or of an unsupported type.',
        ),
        '404': apiErrorResponse(404, 'No processable order has this id.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', orderParam),
    async (context) => {
      const orderId = context.req.valid('param').orderId;
      const serviceContext = requestContext(services, context);
      // The upload is the one request whose body is not a JSON document, so the
      // multipart part is validated here and the failure is reported in the
      // standard error body the route documents for 400.
      let upload: { filename: string; mimeType: string; bytes: Uint8Array };
      try {
        upload = await readUpload(context);
      } catch (error) {
        if (error instanceof ServiceError) {
          throw error;
        }
        throw new ServiceError(
          'INVALID_ARGUMENT',
          'MULTIPART_MALFORMED',
          'The multipart body could not be read.',
        );
      }
      return data(
        context,
        await uploadOrderAttachment(serviceContext, orderId, upload),
      );
    },
  );

  router.get(
    '/serviceOrders/:orderId/attachments/:fileId/content',
    describeRoute({
      tags: ['Service order attachments'],
      summary: 'Download the bytes of an order attachment',
      operationId: 'downloadServiceOrderAttachment',
      responses: {
        '200': {
          description: 'The stored attachment',
          content: {
            'image/png': {},
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
              {},
            'application/octet-stream': {},
          },
        },
        '404': apiErrorResponse(
          404,
          'The order or the attachment was not found.',
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', uploadParam),
    async (context) => {
      const params = context.req.valid('param');
      const { file, bytes } = await readOrderAttachment(
        requestContext(services, context),
        params.orderId,
        params.fileId,
      );
      const disposition = file.category === 'report' ? 'attachment' : 'inline';
      return context.body(new Uint8Array(bytes), 200, {
        'content-type': file.mimeType,
        'content-length': String(file.size),
        'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        'cache-control': 'private, max-age=60',
      });
    },
  );

  router.delete(
    '/serviceOrders/:orderId/attachments/:fileId',
    describeRoute({
      tags: ['Service order attachments'],
      summary: 'Remove an order attachment from the order and from storage',
      operationId: 'removeServiceOrderAttachment',
      responses: {
        '200': dataResponse(removalResultSchema),
        '404': apiErrorResponse(
          404,
          'The order or the attachment was not found.',
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', uploadParam),
    async (context) => {
      const params = context.req.valid('param');
      await removeOrderAttachment(
        requestContext(services, context),
        params.orderId,
        params.fileId,
      );
      return data(context, { removed: true });
    },
  );
}
