import { Hono } from 'hono';
import {
  ApiError,
  apiErrorResponse,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  SalesConflictError,
  SalesNotFoundError,
  SalesReferenceError,
  salesServiceToken,
  type SalesService,
} from '../providers/sales.js';
import {
  ContactSchema,
  CreateContactInput,
  CreateCustomerInput,
  CreateOpportunityInput,
  CustomerDetailSchema,
  CustomerSchema,
  IdParam,
  ListContactsQuery,
  ListCustomersQuery,
  ListMetaSchema,
  ListOpportunitiesQuery,
  OpportunitySchema,
  UpdateContactInput,
  UpdateCustomerInput,
  UpdateOpportunityInput,
} from './schemas.js';

/** The domain every reason below belongs to. */
const domain = 'app';

/** An operation addressed a record that does not exist. */
function notFound(
  resource: 'customer' | 'contact' | 'opportunity',
  id: string,
): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: `${resource.toUpperCase()}_NOT_FOUND`,
    domain,
    message: `The ${resource} "${id}" was not found.`,
  });
}

/**
 * Translate a failure from the service into the one the client sees. A domain error becomes a status and a stable
 * reason a client can branch on; anything else is rethrown for the application to answer as an unexpected failure.
 */
function toApiError(error: unknown): unknown {
  if (error instanceof SalesNotFoundError) {
    return notFound(error.resource, error.id);
  }
  if (error instanceof SalesReferenceError) {
    return new ApiError({
      status: 'FAILED_PRECONDITION',
      reason: 'SALES_REFERENCE_NOT_FOUND',
      domain,
      message: error.message,
      fieldViolations: [
        {
          field: error.field,
          description: `The referenced record "${error.id}" does not exist.`,
          reason: 'REFERENCE_NOT_FOUND',
        },
      ],
    });
  }
  if (error instanceof SalesConflictError) {
    return new ApiError({
      status: 'ALREADY_EXISTS',
      reason: 'CUSTOMER_NAME_TAKEN',
      domain,
      message: error.message,
      fieldViolations: [
        {
          field: error.field,
          description: `A customer named "${error.value}" already exists.`,
          reason: 'DUPLICATE_NAME',
        },
      ],
    });
  }
  return error;
}

/** Run a service call, answering a domain failure in the standard error body. */
async function call<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toApiError(error);
  }
}

/** `200` for a route that answers a single record, plus the failures it can produce. */
const readResponses = {
  '401': apiErrorResponse(401),
  '500': apiErrorResponse(500),
} as const;

const writeResponses = {
  '401': apiErrorResponse(401),
  '404': apiErrorResponse(404),
  '409': apiErrorResponse(409),
  '500': apiErrorResponse(500),
} as const;

/**
 * The customer, contact and opportunity endpoints.
 *
 * Each entity is its own sub-router mounted at its collection path, so `auth.required()` is scoped to exactly those
 * paths and cannot leak into another contribution mounted beside it. Being signed in is the whole requirement: every
 * signed-in member of the sales team may read and change these records, which is what the `authz: 'skip'` pages
 * declare on the client.
 */
export const salesApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const auth = app.container.resolve(authenticationToken);
    const service = (): SalesService =>
      app.container.resolve(salesServiceToken);

    const customers = new Hono();
    customers.use('*', auth.required());

    customers.get(
      '/',
      describeRoute({
        tags: ['Sales'],
        summary: 'List customers',
        operationId: 'listCustomers',
        responses: {
          '200': listResponse(CustomerSchema, ListMetaSchema),
          ...readResponses,
        },
      }),
      apiValidator('query', ListCustomersQuery),
      async (context) => {
        const { q, page, pageSize } = context.req.valid('query');
        const result = await call(() =>
          service().listCustomers({ q, page, pageSize }),
        );
        return context.json({
          data: result.rows,
          meta: { total: result.total, page, pageSize },
        });
      },
    );

    customers.post(
      '/',
      describeRoute({
        tags: ['Sales'],
        summary: 'Create a customer',
        operationId: 'createCustomer',
        responses: {
          '200': dataResponse(CustomerSchema),
          '409': apiErrorResponse(
            409,
            'A customer with this name already exists.',
          ),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('json', CreateCustomerInput),
      async (context) => {
        const input = context.req.valid('json');
        return context.json({
          data: await call(() => service().createCustomer(input)),
        });
      },
    );

    customers.get(
      '/:id',
      describeRoute({
        tags: ['Sales'],
        summary:
          'Get a customer with its contacts, opportunities and opportunity total',
        operationId: 'getCustomer',
        responses: {
          '200': dataResponse(CustomerDetailSchema),
          ...readResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', IdParam),
      async (context) => {
        const { id } = context.req.valid('param');
        const detail = await call(() => service().getCustomer(id));
        if (!detail) throw notFound('customer', id);
        return context.json({ data: detail });
      },
    );

    customers.patch(
      '/:id',
      describeRoute({
        tags: ['Sales'],
        summary: 'Update a customer',
        operationId: 'updateCustomer',
        responses: {
          '200': dataResponse(CustomerSchema),
          ...writeResponses,
        },
      }),
      apiValidator('param', IdParam),
      apiValidator('json', UpdateCustomerInput),
      async (context) => {
        const { id } = context.req.valid('param');
        const input = context.req.valid('json');
        const record = await call(() => service().updateCustomer(id, input));
        if (!record) throw notFound('customer', id);
        return context.json({ data: record });
      },
    );

    const contacts = new Hono();
    contacts.use('*', auth.required());

    contacts.get(
      '/',
      describeRoute({
        tags: ['Sales'],
        summary: 'List contacts',
        operationId: 'listContacts',
        responses: {
          '200': listResponse(ContactSchema, ListMetaSchema),
          ...readResponses,
        },
      }),
      apiValidator('query', ListContactsQuery),
      async (context) => {
        const { q, customerId, page, pageSize } = context.req.valid('query');
        const result = await call(() =>
          service().listContacts({ q, customerId, page, pageSize }),
        );
        return context.json({
          data: result.rows,
          meta: { total: result.total, page, pageSize },
        });
      },
    );

    contacts.post(
      '/',
      describeRoute({
        tags: ['Sales'],
        summary: 'Create a contact',
        operationId: 'createContact',
        responses: {
          '200': dataResponse(ContactSchema),
          '400': apiErrorResponse(
            400,
            'The customer the contact refers to does not exist.',
          ),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('json', CreateContactInput),
      async (context) => {
        const input = context.req.valid('json');
        return context.json({
          data: await call(() => service().createContact(input)),
        });
      },
    );

    contacts.get(
      '/:id',
      describeRoute({
        tags: ['Sales'],
        summary: 'Get a contact',
        operationId: 'getContact',
        responses: {
          '200': dataResponse(ContactSchema),
          ...readResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', IdParam),
      async (context) => {
        const { id } = context.req.valid('param');
        const record = await call(() => service().getContact(id));
        if (!record) throw notFound('contact', id);
        return context.json({ data: record });
      },
    );

    contacts.patch(
      '/:id',
      describeRoute({
        tags: ['Sales'],
        summary: 'Update a contact',
        operationId: 'updateContact',
        responses: {
          '200': dataResponse(ContactSchema),
          '400': apiErrorResponse(
            400,
            'The customer the contact refers to does not exist.',
          ),
          ...writeResponses,
        },
      }),
      apiValidator('param', IdParam),
      apiValidator('json', UpdateContactInput),
      async (context) => {
        const { id } = context.req.valid('param');
        const input = context.req.valid('json');
        const record = await call(() => service().updateContact(id, input));
        if (!record) throw notFound('contact', id);
        return context.json({ data: record });
      },
    );

    const opportunities = new Hono();
    opportunities.use('*', auth.required());

    opportunities.get(
      '/',
      describeRoute({
        tags: ['Sales'],
        summary: 'List opportunities, optionally by stage or customer',
        operationId: 'listOpportunities',
        responses: {
          '200': listResponse(OpportunitySchema, ListMetaSchema),
          ...readResponses,
        },
      }),
      apiValidator('query', ListOpportunitiesQuery),
      async (context) => {
        const { q, customerId, stage, page, pageSize } =
          context.req.valid('query');
        const result = await call(() =>
          service().listOpportunities({ q, customerId, stage, page, pageSize }),
        );
        return context.json({
          data: result.rows,
          meta: { total: result.total, page, pageSize },
        });
      },
    );

    opportunities.post(
      '/',
      describeRoute({
        tags: ['Sales'],
        summary: 'Create an opportunity',
        operationId: 'createOpportunity',
        responses: {
          '200': dataResponse(OpportunitySchema),
          '400': apiErrorResponse(
            400,
            'The customer the opportunity refers to does not exist.',
          ),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('json', CreateOpportunityInput),
      async (context) => {
        const input = context.req.valid('json');
        return context.json({
          data: await call(() => service().createOpportunity(input)),
        });
      },
    );

    opportunities.get(
      '/:id',
      describeRoute({
        tags: ['Sales'],
        summary: 'Get an opportunity',
        operationId: 'getOpportunity',
        responses: {
          '200': dataResponse(OpportunitySchema),
          ...readResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', IdParam),
      async (context) => {
        const { id } = context.req.valid('param');
        const record = await call(() => service().getOpportunity(id));
        if (!record) throw notFound('opportunity', id);
        return context.json({ data: record });
      },
    );

    opportunities.patch(
      '/:id',
      describeRoute({
        tags: ['Sales'],
        summary: 'Update an opportunity',
        operationId: 'updateOpportunity',
        responses: {
          '200': dataResponse(OpportunitySchema),
          '400': apiErrorResponse(
            400,
            'The customer the opportunity refers to does not exist.',
          ),
          ...writeResponses,
        },
      }),
      apiValidator('param', IdParam),
      apiValidator('json', UpdateOpportunityInput),
      async (context) => {
        const { id } = context.req.valid('param');
        const input = context.req.valid('json');
        const record = await call(() => service().updateOpportunity(id, input));
        if (!record) throw notFound('opportunity', id);
        return context.json({ data: record });
      },
    );

    const router = new Hono();
    router.route('/customers', customers);
    router.route('/contacts', contacts);
    router.route('/opportunities', opportunities);
    return router;
  });
