import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  emptyResponse,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';

import {
  CrmDeniedError,
  CrmNotFoundError,
  resolveCrmAccess,
  type CrmAction,
} from '../crm/access.js';
import { crmServiceToken } from '../crm/tokens.js';
import {
  ContactIdParams,
  ContactListQuery,
  ContactSchema,
  CreateContactInput,
  CreateCustomerInput,
  CreateFollowUpInput,
  CreateOpportunityInput,
  CustomerDetailSchema,
  CustomerIdParams,
  CustomerListQuery,
  CustomerSchema,
  DashboardSchema,
  DecideSuggestionInput,
  FollowUpIdParams,
  FollowUpListQuery,
  FollowUpSchema,
  GenerateSuggestionsResultSchema,
  ImportCommitResultSchema,
  ImportCustomersInput,
  ImportPreviewSchema,
  OpportunityIdParams,
  OpportunityListQuery,
  OpportunitySchema,
  PageMetaSchema,
  SuggestionIdParams,
  SuggestionListQuery,
  SuggestionSchema,
  UpdateContactInput,
  UpdateCustomerInput,
  UpdateFollowUpInput,
  UpdateOpportunityInput,
} from './schemas.js';

/**
 * The CRM HTTP surface. Each route owns its own authentication and permission
 * check; the authorization middleware resolves the caller's session and the
 * `crmAction` guard rejects a caller the composite action denies before the
 * input is validated.
 */
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const crm = app.container.resolve(crmServiceToken);

    const crmAction = (action: CrmAction) =>
      createMiddleware<AuthorizationEnv>(async (context, next) => {
        await resolveCrmAccess(context.get('authz'), [action]);
        await next();
      });

    const routes = new Hono<AuthorizationEnv>();
    routes.use('*', auth.required(), authorization.middleware());

    routes.onError((error, context) => {
      if (error instanceof CrmDeniedError) {
        return apiErrorHandler(
          new ApiError({
            status: 'PERMISSION_DENIED',
            reason: 'CRM_PERMISSION_DENIED',
            domain: 'crm',
            message: error.message,
          }),
          context,
        );
      }
      if (error instanceof CrmNotFoundError) {
        return apiErrorHandler(
          new ApiError({
            status: 'NOT_FOUND',
            reason: 'CRM_RECORD_NOT_FOUND',
            domain: 'crm',
            message: error.message,
          }),
          context,
        );
      }
      return apiErrorHandler(error, context);
    });

    // --- Dashboard and reminders -------------------------------------------------

    routes.get(
      '/dashboard',
      crmAction('view'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Read the CRM dashboard',
        operationId: 'getCrmDashboard',
        responses: {
          '200': dataResponse(
            DashboardSchema,
            'Stage totals and due follow-ups.',
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) =>
        context.json({ data: await crm.dashboard(context.get('authz')) }),
    );

    routes.get(
      '/followUps/reminders',
      crmAction('view'),
      describeRoute({
        tags: ['Crm'],
        summary: 'List the caller’s due follow-ups',
        operationId: 'listCrmReminders',
        responses: {
          '200': dataResponse(
            FollowUpSchema.array(),
            'The follow-ups that are due now.',
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) =>
        context.json({ data: await crm.reminders(context.get('authz')) }),
    );

    // --- Assistant suggestions ---------------------------------------------------

    routes.get(
      '/suggestions',
      crmAction('suggest'),
      describeRoute({
        tags: ['Crm'],
        summary: 'List the assistant suggestions',
        operationId: 'listCrmSuggestions',
        responses: {
          '200': dataResponse(SuggestionSchema.array()),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', SuggestionListQuery),
      async (context) =>
        context.json({
          data: await crm.listSuggestions(
            context.get('authz'),
            context.req.valid('query').status,
          ),
        }),
    );

    routes.post(
      '/suggestions/generate',
      crmAction('suggest'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Generate assistant suggestions from the team’s records',
        operationId: 'generateCrmSuggestions',
        responses: {
          '200': dataResponse(GenerateSuggestionsResultSchema),
          ...apiErrorResponses,
        },
      }),
      async (context) =>
        context.json({
          data: await crm.generateSuggestions(context.get('authz')),
        }),
    );

    routes.post(
      '/suggestions/:suggestionId/decide',
      crmAction('suggest'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Approve or dismiss a suggestion',
        operationId: 'decideCrmSuggestion',
        responses: {
          '200': dataResponse(SuggestionSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', SuggestionIdParams),
      apiValidator('json', DecideSuggestionInput),
      async (context) => {
        const { suggestionId } = context.req.valid('param');
        const { decision } = context.req.valid('json');
        return context.json({
          data: await crm.decideSuggestion(
            context.get('authz'),
            suggestionId,
            decision,
          ),
        });
      },
    );

    // --- Customer import ---------------------------------------------------------

    routes.post(
      '/customers/importPreview',
      crmAction('edit'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Validate customer import rows',
        operationId: 'previewCrmCustomerImport',
        responses: {
          '200': dataResponse(
            ImportPreviewSchema,
            'Each row classified as valid, duplicate or error.',
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', ImportCustomersInput),
      async (context) =>
        context.json({
          data: await crm.importPreview(
            context.get('authz'),
            context.req.valid('json').rows,
          ),
        }),
    );

    routes.post(
      '/customers/import',
      crmAction('edit'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Import the valid customer rows',
        operationId: 'importCrmCustomers',
        responses: {
          '201': dataResponse(ImportCommitResultSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', ImportCustomersInput),
      async (context) => {
        const result = await crm.importCustomers(
          context.get('authz'),
          context.req.valid('json').rows,
        );
        return context.json({ data: result }, 201);
      },
    );

    // --- Customers ---------------------------------------------------------------

    routes.get(
      '/customers',
      crmAction('view'),
      describeRoute({
        tags: ['Crm'],
        summary: 'List customers',
        operationId: 'listCrmCustomers',
        responses: {
          '200': listResponse(CustomerSchema, PageMetaSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', CustomerListQuery),
      async (context) => {
        const query = context.req.valid('query');
        const result = await crm.listCustomers(context.get('authz'), query);
        return context.json({
          data: result.rows,
          meta: {
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
          },
        });
      },
    );

    routes.post(
      '/customers',
      crmAction('edit'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Create a customer',
        operationId: 'createCrmCustomer',
        responses: {
          '201': dataResponse(CustomerSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateCustomerInput),
      async (context) => {
        const created = await crm.createCustomer(
          context.get('authz'),
          context.req.valid('json'),
        );
        return context.json({ data: created }, 201);
      },
    );

    routes.get(
      '/customers/:customerId/detail',
      crmAction('view'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Read a customer with contacts, opportunities and follow-ups',
        operationId: 'getCrmCustomerDetail',
        responses: {
          '200': dataResponse(CustomerDetailSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', CustomerIdParams),
      async (context) =>
        context.json({
          data: await crm.customerDetail(
            context.get('authz'),
            context.req.valid('param').customerId,
          ),
        }),
    );

    routes.get(
      '/customers/:customerId',
      crmAction('view'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Get a customer',
        operationId: 'getCrmCustomer',
        responses: {
          '200': dataResponse(CustomerSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', CustomerIdParams),
      async (context) =>
        context.json({
          data: await crm.getCustomer(
            context.get('authz'),
            context.req.valid('param').customerId,
          ),
        }),
    );

    routes.patch(
      '/customers/:customerId',
      crmAction('edit'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Update a customer',
        operationId: 'updateCrmCustomer',
        responses: {
          '200': dataResponse(CustomerSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', CustomerIdParams),
      apiValidator('json', UpdateCustomerInput),
      async (context) =>
        context.json({
          data: await crm.updateCustomer(
            context.get('authz'),
            context.req.valid('param').customerId,
            context.req.valid('json'),
          ),
        }),
    );

    routes.delete(
      '/customers/:customerId',
      crmAction('delete'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Delete a customer',
        operationId: 'deleteCrmCustomer',
        responses: {
          '204': emptyResponse(),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', CustomerIdParams),
      async (context) => {
        await crm.deleteCustomer(
          context.get('authz'),
          context.req.valid('param').customerId,
        );
        return context.body(null, 204);
      },
    );

    // --- Contacts ----------------------------------------------------------------

    routes.get(
      '/contacts',
      crmAction('view'),
      describeRoute({
        tags: ['Crm'],
        summary: 'List contacts',
        operationId: 'listCrmContacts',
        responses: {
          '200': listResponse(ContactSchema, PageMetaSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ContactListQuery),
      async (context) => {
        const result = await crm.listContacts(
          context.get('authz'),
          context.req.valid('query'),
        );
        return context.json({
          data: result.rows,
          meta: {
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
          },
        });
      },
    );

    routes.post(
      '/contacts',
      crmAction('edit'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Create a contact',
        operationId: 'createCrmContact',
        responses: {
          '201': dataResponse(ContactSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateContactInput),
      async (context) => {
        const created = await crm.createContact(
          context.get('authz'),
          context.req.valid('json'),
        );
        return context.json({ data: created }, 201);
      },
    );

    routes.patch(
      '/contacts/:contactId',
      crmAction('edit'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Update a contact',
        operationId: 'updateCrmContact',
        responses: {
          '200': dataResponse(ContactSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', ContactIdParams),
      apiValidator('json', UpdateContactInput),
      async (context) =>
        context.json({
          data: await crm.updateContact(
            context.get('authz'),
            context.req.valid('param').contactId,
            context.req.valid('json'),
          ),
        }),
    );

    routes.delete(
      '/contacts/:contactId',
      crmAction('delete'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Delete a contact',
        operationId: 'deleteCrmContact',
        responses: {
          '204': emptyResponse(),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', ContactIdParams),
      async (context) => {
        await crm.deleteContact(
          context.get('authz'),
          context.req.valid('param').contactId,
        );
        return context.body(null, 204);
      },
    );

    // --- Opportunities -----------------------------------------------------------

    routes.get(
      '/opportunities',
      crmAction('view'),
      describeRoute({
        tags: ['Crm'],
        summary: 'List opportunities',
        operationId: 'listCrmOpportunities',
        responses: {
          '200': listResponse(OpportunitySchema, PageMetaSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', OpportunityListQuery),
      async (context) => {
        const result = await crm.listOpportunities(
          context.get('authz'),
          context.req.valid('query'),
        );
        return context.json({
          data: result.rows,
          meta: {
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
          },
        });
      },
    );

    routes.post(
      '/opportunities',
      crmAction('edit'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Create an opportunity',
        operationId: 'createCrmOpportunity',
        responses: {
          '201': dataResponse(OpportunitySchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateOpportunityInput),
      async (context) => {
        const created = await crm.createOpportunity(
          context.get('authz'),
          context.req.valid('json'),
        );
        return context.json({ data: created }, 201);
      },
    );

    routes.patch(
      '/opportunities/:opportunityId',
      crmAction('edit'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Update an opportunity, including its stage',
        operationId: 'updateCrmOpportunity',
        responses: {
          '200': dataResponse(OpportunitySchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', OpportunityIdParams),
      apiValidator('json', UpdateOpportunityInput),
      async (context) =>
        context.json({
          data: await crm.updateOpportunity(
            context.get('authz'),
            context.req.valid('param').opportunityId,
            context.req.valid('json'),
          ),
        }),
    );

    routes.delete(
      '/opportunities/:opportunityId',
      crmAction('delete'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Delete an opportunity',
        operationId: 'deleteCrmOpportunity',
        responses: {
          '204': emptyResponse(),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', OpportunityIdParams),
      async (context) => {
        await crm.deleteOpportunity(
          context.get('authz'),
          context.req.valid('param').opportunityId,
        );
        return context.body(null, 204);
      },
    );

    // --- Follow-ups --------------------------------------------------------------

    routes.get(
      '/followUps',
      crmAction('view'),
      describeRoute({
        tags: ['Crm'],
        summary: 'List follow-up records',
        operationId: 'listCrmFollowUps',
        responses: {
          '200': listResponse(FollowUpSchema, PageMetaSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', FollowUpListQuery),
      async (context) => {
        const result = await crm.listFollowUps(
          context.get('authz'),
          context.req.valid('query'),
        );
        return context.json({
          data: result.rows,
          meta: {
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
          },
        });
      },
    );

    routes.post(
      '/followUps',
      crmAction('edit'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Create a follow-up record',
        operationId: 'createCrmFollowUp',
        responses: {
          '201': dataResponse(FollowUpSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateFollowUpInput),
      async (context) => {
        const created = await crm.createFollowUp(
          context.get('authz'),
          context.req.valid('json'),
        );
        return context.json({ data: created }, 201);
      },
    );

    routes.patch(
      '/followUps/:followUpId',
      crmAction('edit'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Update a follow-up, including completing it',
        operationId: 'updateCrmFollowUp',
        responses: {
          '200': dataResponse(FollowUpSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', FollowUpIdParams),
      apiValidator('json', UpdateFollowUpInput),
      async (context) =>
        context.json({
          data: await crm.updateFollowUp(
            context.get('authz'),
            context.req.valid('param').followUpId,
            context.req.valid('json'),
          ),
        }),
    );

    routes.delete(
      '/followUps/:followUpId',
      crmAction('delete'),
      describeRoute({
        tags: ['Crm'],
        summary: 'Delete a follow-up record',
        operationId: 'deleteCrmFollowUp',
        responses: {
          '204': emptyResponse(),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', FollowUpIdParams),
      async (context) => {
        await crm.deleteFollowUp(
          context.get('authz'),
          context.req.valid('param').followUpId,
        );
        return context.body(null, 204);
      },
    );

    router.route('/crm', routes);
    return router;
  },
);
