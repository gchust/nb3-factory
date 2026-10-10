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
  createCustomer,
  createDevice,
  getCustomer,
  getDevice,
  listCustomers,
  listDevices,
  listServiceGroups,
  updateCustomer,
  updateDevice,
} from '../services/catalog.js';
import {
  customerInput,
  customerSchema,
  deviceInput,
  deviceSchema,
  idParam,
  listMetaSchema,
  paginationQuery,
  serviceGroupSchema,
} from './schemas.js';
import {
  data,
  page,
  requestContext,
  type ServiceHttpServices,
  type ServiceRouter,
} from './support.js';

const listDeviceQuery = paginationQuery.extend({
  customerId: z.coerce.number().int().positive().optional(),
  engineerId: z.string().trim().max(64).optional(),
});

export function registerCatalogRoutes(
  router: ServiceRouter,
  services: ServiceHttpServices,
): void {
  router.get(
    '/serviceGroups',
    describeRoute({
      tags: ['Customers and devices'],
      summary: 'List the engineer groups',
      operationId: 'listServiceGroups',
      responses: {
        '200': dataResponse(z.array(serviceGroupSchema)),
        ...apiErrorResponses,
      },
    }),
    async (context) =>
      data(context, await listServiceGroups(requestContext(services, context))),
  );

  router.get(
    '/customers',
    describeRoute({
      tags: ['Customers and devices'],
      summary: 'List customers',
      operationId: 'listCustomers',
      responses: {
        '200': listResponse(customerSchema, listMetaSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', paginationQuery),
    async (context) =>
      page(
        context,
        await listCustomers(
          requestContext(services, context),
          context.req.valid('query'),
        ),
      ),
  );

  router.post(
    '/customers',
    describeRoute({
      tags: ['Customers and devices'],
      summary: 'Create a customer',
      operationId: 'createCustomer',
      responses: {
        '200': dataResponse(customerSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', customerInput),
    async (context) =>
      data(
        context,
        await createCustomer(
          requestContext(services, context),
          context.req.valid('json'),
        ),
      ),
  );

  router.patch(
    '/customers/:id',
    describeRoute({
      tags: ['Customers and devices'],
      summary: 'Update a customer',
      operationId: 'updateCustomer',
      responses: {
        '200': dataResponse(customerSchema),
        '404': apiErrorResponse(404, 'No manageable customer has this id.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', idParam),
    apiValidator('json', customerInput.partial()),
    async (context) =>
      data(
        context,
        await updateCustomer(
          requestContext(services, context),
          context.req.valid('param').id,
          context.req.valid('json'),
        ),
      ),
  );

  router.get(
    '/devices',
    describeRoute({
      tags: ['Customers and devices'],
      summary: 'List devices',
      operationId: 'listDevices',
      responses: {
        '200': listResponse(deviceSchema, listMetaSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', listDeviceQuery),
    async (context) =>
      page(
        context,
        await listDevices(
          requestContext(services, context),
          context.req.valid('query'),
        ),
      ),
  );

  router.post(
    '/devices',
    describeRoute({
      tags: ['Customers and devices'],
      summary: 'Register a device',
      operationId: 'createDevice',
      responses: {
        '200': dataResponse(deviceSchema),
        '400': apiErrorResponse(400, 'The device code is already in use.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', deviceInput),
    async (context) =>
      data(
        context,
        await createDevice(
          requestContext(services, context),
          context.req.valid('json'),
        ),
      ),
  );

  router.get(
    '/customers/:id',
    describeRoute({
      tags: ['Customers and devices'],
      summary: 'Get a customer',
      operationId: 'getCustomer',
      responses: {
        '200': dataResponse(customerSchema),
        '404': apiErrorResponse(404, 'No visible customer has this id.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', idParam),
    async (context) =>
      data(
        context,
        await getCustomer(
          requestContext(services, context),
          context.req.valid('param').id,
        ),
      ),
  );

  router.get(
    '/devices/:id',
    describeRoute({
      tags: ['Customers and devices'],
      summary: 'Get a device',
      operationId: 'getDevice',
      responses: {
        '200': dataResponse(deviceSchema),
        '404': apiErrorResponse(404, 'No visible device has this id.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', idParam),
    async (context) =>
      data(
        context,
        await getDevice(
          requestContext(services, context),
          context.req.valid('param').id,
        ),
      ),
  );

  router.patch(
    '/devices/:id',
    describeRoute({
      tags: ['Customers and devices'],
      summary: 'Update a device',
      operationId: 'updateDevice',
      responses: {
        '200': dataResponse(deviceSchema),
        '400': apiErrorResponse(400, 'The device code is already in use.'),
        '404': apiErrorResponse(404, 'No manageable device has this id.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', idParam),
    apiValidator('json', deviceInput.partial()),
    async (context) =>
      data(
        context,
        await updateDevice(
          requestContext(services, context),
          context.req.valid('param').id,
          context.req.valid('json'),
        ),
      ),
  );
}
