import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponse,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { CrmError, crmServiceToken } from '../providers/crm.js';
import {
  ContactParams,
  ContactSchema,
  CreateContactInput,
  CreateCustomerInput,
  CreateOpportunityInput,
  CustomerDetailSchema,
  CustomerParams,
  CustomerSchema,
  ListContactsQuery,
  ListCustomersQuery,
  ListOpportunitiesQuery,
  OpportunityParams,
  OpportunitySchema,
  UpdateContactInput,
  UpdateCustomerInput,
  UpdateOpportunityInput,
} from './schemas.js';

/**
 * The feature's namespace, and the domain of the error reasons defined here.
 *
 * The routes serve three resources rather than one URL prefix, so there is no
 * single namespace to borrow from the paths; `crm` names the feature that
 * defined the reasons.
 */
const CRM_DOMAIN = 'crm';

/** A `customerId` in a request body names a customer that is not there. */
const invalidCustomerReference = apiErrorResponse(
  400,
  'The `customerId` names a customer that does not exist (`INVALID_CUSTOMER_REFERENCE`).',
);

/** The 401 and 500 of an authenticated route that checks no permission. */
const sessionErrors = {
  401: apiErrorResponse(401),
  500: apiErrorResponse(500),
};

/**
 * Turn this feature's domain failures into the error bodies their HTTP status
 * is reported with. Everything else is the framework's to render.
 */
function toApiError(error: CrmError): ApiError {
  if (error.code === 'INVALID_CUSTOMER_REFERENCE') {
    return new ApiError({
      status: 'INVALID_ARGUMENT',
      reason: error.code,
      domain: CRM_DOMAIN,
      message: error.message,
      fieldViolations: [{ field: 'customerId', description: error.message }],
      cause: error,
    });
  }
  return new ApiError({
    status: 'NOT_FOUND',
    reason: error.code,
    domain: CRM_DOMAIN,
    message: error.message,
    cause: error,
  });
}

/**
 * The customer, contact and opportunity endpoints.
 *
 * Every one of them requires a session: the whole sales team shares one set of
 * permissions, so there is no grant to check beyond identity. Each resource is
 * mounted as its own router, so the authentication middleware covers the paths
 * this contribution owns and nothing else.
 */
export const crmApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    const crm = app.container.resolve(crmServiceToken);

    // A router is not tested on the application's own API router, so it
    // translates what it defines and renders what the framework recognizes.
    router.onError((error, context) =>
      apiErrorHandler(
        error instanceof CrmError ? toApiError(error) : error,
        context,
      ),
    );

    /** A sub-router whose every path needs a session. */
    const authenticated = (): Hono => {
      const routes = new Hono();
      routes.use('*', authentication.required());
      return routes;
    };

    const customers = authenticated();
    const contacts = authenticated();
    const opportunities = authenticated();

    customers.get(
      '/',
      describeRoute({
        tags: ['Customers'],
        summary: 'List customers',
        operationId: 'listCustomers',
        description:
          'Newest first, paged by `page` and `pageSize`. The response `meta` repeats the paging it applied.',
        responses: {
          200: listResponse(CustomerSchema),
          ...sessionErrors,
        },
      }),
      apiValidator('query', ListCustomersQuery),
      async (context) => {
        const query = context.req.valid('query');
        const { items, total } = await crm.listCustomers(query);
        return context.json({
          data: items,
          meta: { total, page: query.page, pageSize: query.pageSize },
        });
      },
    );

    customers.post(
      '/',
      describeRoute({
        tags: ['Customers'],
        summary: 'Create a customer',
        operationId: 'createCustomer',
        responses: {
          201: dataResponse(CustomerSchema, 'The created customer.'),
          ...sessionErrors,
        },
      }),
      apiValidator('json', CreateCustomerInput),
      async (context) => {
        const input = context.req.valid('json');
        const customer = await crm.createCustomer({
          name: input.name,
          industry: input.industry ?? null,
        });
        return context.json({ data: customer }, 201);
      },
    );

    customers.get(
      '/:customerId',
      describeRoute({
        tags: ['Customers'],
        summary: 'Get a customer',
        operationId: 'getCustomer',
        description:
          "The customer with its contacts and opportunities, newest first, and the sum of all of that customer's opportunity amounts. The two lists are capped; the total covers every opportunity the customer owns.",
        responses: {
          200: dataResponse(CustomerDetailSchema),
          404: apiErrorResponse(
            404,
            'No customer has this id (`CUSTOMER_NOT_FOUND`).',
          ),
          ...sessionErrors,
        },
      }),
      apiValidator('param', CustomerParams),
      async (context) =>
        context.json({
          data: await crm.getCustomer(context.req.valid('param').customerId),
        }),
    );

    customers.patch(
      '/:customerId',
      describeRoute({
        tags: ['Customers'],
        summary: 'Update a customer',
        operationId: 'updateCustomer',
        description:
          'Only the fields the body carries are changed; `industry: null` clears the industry.',
        responses: {
          200: dataResponse(CustomerSchema, 'The updated customer.'),
          404: apiErrorResponse(
            404,
            'No customer has this id (`CUSTOMER_NOT_FOUND`).',
          ),
          ...sessionErrors,
        },
      }),
      apiValidator('param', CustomerParams),
      apiValidator('json', UpdateCustomerInput),
      async (context) => {
        const { customerId } = context.req.valid('param');
        const input = context.req.valid('json');
        return context.json({
          data: await crm.updateCustomer(customerId, input),
        });
      },
    );

    contacts.get(
      '/',
      describeRoute({
        tags: ['Contacts'],
        summary: 'List contacts',
        operationId: 'listContacts',
        description:
          'Newest first, paged by `page` and `pageSize`, optionally narrowed by a text search or to one customer. Each contact carries its customer’s name.',
        responses: {
          200: listResponse(ContactSchema),
          ...sessionErrors,
        },
      }),
      apiValidator('query', ListContactsQuery),
      async (context) => {
        const query = context.req.valid('query');
        const { items, total } = await crm.listContacts(query);
        return context.json({
          data: items,
          meta: { total, page: query.page, pageSize: query.pageSize },
        });
      },
    );

    contacts.post(
      '/',
      describeRoute({
        tags: ['Contacts'],
        summary: 'Create a contact',
        operationId: 'createContact',
        responses: {
          201: dataResponse(ContactSchema, 'The created contact.'),
          400: invalidCustomerReference,
          ...sessionErrors,
        },
      }),
      apiValidator('json', CreateContactInput),
      async (context) => {
        const input = context.req.valid('json');
        const contact = await crm.createContact({
          name: input.name,
          contact: input.contact ?? null,
          customerId: input.customerId,
        });
        return context.json({ data: contact }, 201);
      },
    );

    contacts.get(
      '/:contactId',
      describeRoute({
        tags: ['Contacts'],
        summary: 'Get a contact',
        operationId: 'getContact',
        responses: {
          200: dataResponse(ContactSchema),
          404: apiErrorResponse(
            404,
            'No contact has this id (`CONTACT_NOT_FOUND`).',
          ),
          ...sessionErrors,
        },
      }),
      apiValidator('param', ContactParams),
      async (context) =>
        context.json({
          data: await crm.getContact(context.req.valid('param').contactId),
        }),
    );

    contacts.patch(
      '/:contactId',
      describeRoute({
        tags: ['Contacts'],
        summary: 'Update a contact',
        operationId: 'updateContact',
        description:
          'Only the fields the body carries are changed; `contact: null` clears the contact method, and `customerId` moves the contact to another customer.',
        responses: {
          200: dataResponse(ContactSchema, 'The updated contact.'),
          400: invalidCustomerReference,
          404: apiErrorResponse(
            404,
            'No contact has this id (`CONTACT_NOT_FOUND`).',
          ),
          ...sessionErrors,
        },
      }),
      apiValidator('param', ContactParams),
      apiValidator('json', UpdateContactInput),
      async (context) => {
        const { contactId } = context.req.valid('param');
        const input = context.req.valid('json');
        return context.json({
          data: await crm.updateContact(contactId, input),
        });
      },
    );

    opportunities.get(
      '/',
      describeRoute({
        tags: ['Opportunities'],
        summary: 'List opportunities',
        operationId: 'listOpportunities',
        description:
          'Newest first, paged by `page` and `pageSize`, optionally narrowed by a text search, one customer or one stage. Each opportunity carries its customer’s name.',
        responses: {
          200: listResponse(OpportunitySchema),
          ...sessionErrors,
        },
      }),
      apiValidator('query', ListOpportunitiesQuery),
      async (context) => {
        const query = context.req.valid('query');
        const { items, total } = await crm.listOpportunities(query);
        return context.json({
          data: items,
          meta: { total, page: query.page, pageSize: query.pageSize },
        });
      },
    );

    opportunities.post(
      '/',
      describeRoute({
        tags: ['Opportunities'],
        summary: 'Create an opportunity',
        operationId: 'createOpportunity',
        responses: {
          201: dataResponse(OpportunitySchema, 'The created opportunity.'),
          400: invalidCustomerReference,
          ...sessionErrors,
        },
      }),
      apiValidator('json', CreateOpportunityInput),
      async (context) => {
        const input = context.req.valid('json');
        const opportunity = await crm.createOpportunity({
          name: input.name,
          customerId: input.customerId,
          amount: input.amount,
          stage: input.stage,
        });
        return context.json({ data: opportunity }, 201);
      },
    );

    opportunities.get(
      '/:opportunityId',
      describeRoute({
        tags: ['Opportunities'],
        summary: 'Get an opportunity',
        operationId: 'getOpportunity',
        responses: {
          200: dataResponse(OpportunitySchema),
          404: apiErrorResponse(
            404,
            'No opportunity has this id (`OPPORTUNITY_NOT_FOUND`).',
          ),
          ...sessionErrors,
        },
      }),
      apiValidator('param', OpportunityParams),
      async (context) =>
        context.json({
          data: await crm.getOpportunity(
            context.req.valid('param').opportunityId,
          ),
        }),
    );

    opportunities.patch(
      '/:opportunityId',
      describeRoute({
        tags: ['Opportunities'],
        summary: 'Update an opportunity',
        operationId: 'updateOpportunity',
        description:
          'Only the fields the body carries are changed; moving an opportunity to another customer is a `customerId` in the body.',
        responses: {
          200: dataResponse(OpportunitySchema, 'The updated opportunity.'),
          400: invalidCustomerReference,
          404: apiErrorResponse(
            404,
            'No opportunity has this id (`OPPORTUNITY_NOT_FOUND`).',
          ),
          ...sessionErrors,
        },
      }),
      apiValidator('param', OpportunityParams),
      apiValidator('json', UpdateOpportunityInput),
      async (context) => {
        const { opportunityId } = context.req.valid('param');
        const input = context.req.valid('json');
        return context.json({
          data: await crm.updateOpportunity(opportunityId, input),
        });
      },
    );

    router.route('/customers', customers);
    router.route('/contacts', contacts);
    router.route('/opportunities', opportunities);

    return router;
  });
