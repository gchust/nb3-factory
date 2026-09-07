import type { Application } from '@nocobase/app-server/application';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationScope,
  type DatabaseAuthorizationConditions,
  type DatabaseAuthorizationParams,
} from '@nocobase/app-plugin-authorization';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { resolveSalesIdentity } from '../providers/sales-identity.js';
import { salesServiceToken } from '../providers/sales-service.js';
import { SalesBusinessError } from '../providers/sales-types.js';

type AuthorizationDecision = Awaited<
  ReturnType<AuthorizationScope['authorize']>
>;
type SalesVariables = AuthEnv['Variables'] & { salesAuthz: SalesAuthzScope };

const CUSTOMER_RESOURCE = {
  type: 'database.collection',
  id: 'main.customers',
} as const;
const CONTACT_RESOURCE = {
  type: 'database.collection',
  id: 'main.contacts',
} as const;
const LEAD_RESOURCE = {
  type: 'database.collection',
  id: 'main.leads',
} as const;
const OPPORTUNITY_RESOURCE = {
  type: 'database.collection',
  id: 'main.opportunities',
} as const;
const FOLLOW_UP_RESOURCE = {
  type: 'database.collection',
  id: 'main.followUps',
} as const;

// The authorization engine rejects a requested output field that is not
// registered on the collection, and `'*'` is not a registered field. Request
// the exact registered field lists so the engine can verify them against the
// grants (which allow `'*'` for staff roles and a public subset for visitors).
const CUSTOMER_FIELDS = [
  'id',
  'customerNo',
  'name',
  'industry',
  'size',
  'status',
  'phone',
  'isPublic',
  'ownerId',
  'createdAt',
  'updatedAt',
] as const;
const CONTACT_FIELDS = [
  'id',
  'name',
  'phone',
  'email',
  'position',
  'customerId',
  'ownerId',
  'createdAt',
  'updatedAt',
] as const;
const LEAD_FIELDS = [
  'id',
  'leadNo',
  'companyName',
  'contactName',
  'phone',
  'email',
  'source',
  'ownerId',
  'status',
  'notes',
  'convertedAt',
  'convertedCustomerId',
  'createdAt',
  'updatedAt',
] as const;
const OPPORTUNITY_FIELDS = [
  'id',
  'opportunityNo',
  'name',
  'customerId',
  'ownerId',
  'stage',
  'expectedAmount',
  'winProbability',
  'weightedAmount',
  'expectedCloseDate',
  'actualAmount',
  'resultReason',
  'approvalStatus',
  'isArchived',
  'createdAt',
  'updatedAt',
] as const;
const FOLLOW_UP_FIELDS = [
  'id',
  'subject',
  'method',
  'followUpAt',
  'nextFollowUpAt',
  'content',
  'customerId',
  'opportunityId',
  'contactId',
  'ownerId',
  'createdAt',
  'updatedAt',
] as const;
// Fields the visitor grant allows on customers; the public directory requests
// exactly this subset so the authorization check passes for every role.
const PUBLIC_CUSTOMER_FIELDS = ['id', 'name', 'industry', 'size', 'status'];

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono<{ Variables: SalesVariables }>();
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const sales = app.container.resolve(salesServiceToken);
    const workflow = app.container.resolve(workflowServiceToken);

    router.onError((error, context) => {
      if (error instanceof SalesBusinessError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status as ContentfulStatusCode,
        );
      }
      if (error instanceof TypeError) {
        return context.json(
          { code: 'INVALID_INPUT', message: error.message },
          400,
        );
      }
      throw error;
    });

    router.use('/sales/*', async (context, next) => {
      // The business-license file routes are mounted by the file contribution
      // and own their own authentication: uploads/list/read carry the file
      // route's `auth.required()` plus its authorizer, and the content endpoint
      // is deliberately public (protected by a signed access token) so file
      // previews work without a session. Do not apply the sales API session
      // guard to them. (`context.req.path` is the full pathname, so match the
      // path segment rather than a base-path-dependent prefix.)
      if (context.req.path.includes('/sales/customer-profiles/')) {
        await next();
        return;
      }
      const session = await auth.getSession(context.req.raw.headers);
      if (!session) {
        return context.json(
          { code: 'UNAUTHENTICATED', message: '未登录。' },
          401,
        );
      }
      context.set('auth', session);
      const identity = await resolveSalesIdentity(database, session.user.id);
      context.set('salesAuthz', authz.for(identity));
      await next();
    });

    // ---------------------------------------------------------------- users

    router.get('/sales/users', async (context) => {
      const rows = await database
        .query()
        .selectFrom('userRoles')
        .innerJoin('roles', 'roles.id', 'userRoles.roleId')
        .innerJoin('user', 'user.id', 'userRoles.userId')
        .select([
          'user.id',
          'user.name',
          'user.email',
          'roles.key',
          'roles.name',
        ])
        .where('roles.key', 'in', ['sales', 'sales-manager'])
        .orderBy('user.name')
        .execute();
      const byUser = new Map<
        string,
        {
          id: string;
          name: string;
          email: string;
          roles: { key: string; name: string }[];
        }
      >();
      for (const row of rows) {
        const id = String(row.id);
        const entry = byUser.get(id) ?? {
          id,
          name: typeof row.name === 'string' ? row.name : '',
          email: typeof row.email === 'string' ? row.email : '',
          roles: [],
        };
        entry.roles.push({ key: String(row.key), name: String(row.name) });
        byUser.set(id, entry);
      }
      return context.json({ data: [...byUser.values()] });
    });

    // ---------------------------------------------------------------- me

    router.get('/sales/me', async (context) => {
      const session = context.get('auth');
      if (!session) {
        return context.json(
          { code: 'UNAUTHENTICATED', message: '未登录。' },
          401,
        );
      }
      const roles = await database
        .query()
        .selectFrom('userRoles')
        .innerJoin('roles', 'roles.id', 'userRoles.roleId')
        .select(['roles.key', 'roles.name'])
        .where('userRoles.userId', '=', session.user.id)
        .execute();
      return context.json({
        data: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          roles: roles.map((row) => ({
            key: String(row.key),
            name: String(row.name),
          })),
        },
      });
    });

    // ---------------------------------------------------------------- dashboard

    router.get('/sales/dashboard', async (context) => {
      const authzScope = context.get('salesAuthz');
      const opportunityConditions = await authorizeDatabase(
        authzScope,
        OPPORTUNITY_RESOURCE,
        'read',
        {
          fields: {
            output: [
              'id',
              'stage',
              'expectedAmount',
              'weightedAmount',
              'ownerId',
              'isArchived',
            ],
          },
        },
      );
      const followUpConditions = await authorizeDatabase(
        authzScope,
        FOLLOW_UP_RESOURCE,
        'read',
        {
          fields: {
            output: ['id', 'nextFollowUpAt', 'opportunityId', 'ownerId'],
          },
        },
      );
      return context.json({
        data: await sales.getDashboard(
          opportunityConditions,
          followUpConditions,
        ),
      });
    });

    // ---------------------------------------------------------------- customers

    router.get('/sales/customers', async (context) => {
      const authzScope = context.get('salesAuthz');
      const conditions = await authorizeDatabase(
        authzScope,
        CUSTOMER_RESOURCE,
        'read',
        {
          fields: { output: [...CUSTOMER_FIELDS] },
        },
      );
      const query = context.req.query();
      return context.json({
        data: await sales.listCustomers(conditions, {
          q: query.q,
          status: query.status as never,
          isPublic:
            query.isPublic === 'true'
              ? true
              : query.isPublic === 'false'
                ? false
                : undefined,
        }),
      });
    });

    // Public customer directory. Requests only the fields the visitor grant
    // allows, so the same endpoint serves every role; the record filter keeps
    // it to public customers only.
    router.get('/sales/directory', async (context) => {
      const authzScope = context.get('salesAuthz');
      const conditions = await authorizeDatabase(
        authzScope,
        CUSTOMER_RESOURCE,
        'read',
        {
          fields: { output: [...PUBLIC_CUSTOMER_FIELDS] },
        },
      );
      const query = context.req.query();
      return context.json({
        data: await sales.listCustomers(conditions, {
          q: query.q,
          isPublic: true,
        }),
      });
    });

    router.get('/sales/customers/:id', async (context) => {
      const authzScope = context.get('salesAuthz');
      const conditions = await authorizeDatabase(
        authzScope,
        CUSTOMER_RESOURCE,
        'read',
        {
          fields: { output: [...CUSTOMER_FIELDS] },
        },
      );
      const customer = await sales.getCustomer(
        Number(context.req.param('id')),
        conditions,
      );
      return customer
        ? context.json({ data: customer })
        : context.json({ error: 'Customer not found.' }, 404);
    });

    router.post('/sales/customers', async (context) => {
      const authzScope = context.get('salesAuthz');
      const input = await context.req.json<Record<string, unknown>>();
      const conditions = await authorizeDatabase(
        authzScope,
        CUSTOMER_RESOURCE,
        'create',
        {
          fields: { input: Object.keys(input), output: ['id'] },
        },
      );
      const created = await sales.createCustomer(
        input,
        authzScope.identity.principal.id,
        conditions,
      );
      return context.json({ data: created }, 201);
    });

    router.patch('/sales/customers/:id', async (context) => {
      const authzScope = context.get('salesAuthz');
      const input = await context.req.json<Record<string, unknown>>();
      const conditions = await authorizeDatabase(
        authzScope,
        CUSTOMER_RESOURCE,
        'update',
        {
          fields: { input: Object.keys(input) },
        },
      );
      const updated = await sales.updateCustomer(
        Number(context.req.param('id')),
        input,
        conditions,
      );
      return updated
        ? context.json({ data: { updated: true } })
        : context.json({ error: 'Customer not found.' }, 404);
    });

    router.post('/sales/customers/:id/owner', async (context) => {
      const authzScope = context.get('salesAuthz');
      const body = await context.req.json<{ ownerId?: unknown }>();
      const ownerId = body.ownerId;
      if (typeof ownerId !== 'string' || ownerId.length === 0) {
        return context.json({ error: 'ownerId is required.' }, 400);
      }
      const conditions = await authorizeDatabase(
        authzScope,
        CUSTOMER_RESOURCE,
        'changeOwner',
        {
          fields: {},
        },
      );
      const changed = await sales.changeCustomerOwner(
        Number(context.req.param('id')),
        ownerId,
        conditions,
      );
      return changed
        ? context.json({ data: { changed: true } })
        : context.json({ error: 'Customer not found.' }, 404);
    });

    router.delete('/sales/customers/:id', async (context) => {
      const authzScope = context.get('salesAuthz');
      const conditions = await authorizeDatabase(
        authzScope,
        CUSTOMER_RESOURCE,
        'delete',
        {
          fields: {},
        },
      );
      const deleted = await sales.deleteCustomer(
        Number(context.req.param('id')),
        conditions,
      );
      return deleted
        ? context.json({ data: { deleted: true } })
        : context.json({ error: 'Customer not found.' }, 404);
    });

    // ---------------------------------------------------------------- contacts

    router.get('/sales/contacts', async (context) => {
      const authzScope = context.get('salesAuthz');
      const conditions = await authorizeDatabase(
        authzScope,
        CONTACT_RESOURCE,
        'read',
        {
          fields: { output: [...CONTACT_FIELDS] },
        },
      );
      const query = context.req.query();
      return context.json({
        data: await sales.listContacts(conditions, {
          q: query.q,
          customerId: query.customerId ? Number(query.customerId) : undefined,
        }),
      });
    });

    router.post('/sales/contacts', async (context) => {
      const authzScope = context.get('salesAuthz');
      const input = await context.req.json<Record<string, unknown>>();
      const conditions = await authorizeDatabase(
        authzScope,
        CONTACT_RESOURCE,
        'create',
        {
          fields: { input: Object.keys(input), output: ['id'] },
        },
      );
      const created = await sales.createContact(
        input,
        authzScope.identity.principal.id,
        conditions,
      );
      return context.json({ data: created }, 201);
    });

    router.patch('/sales/contacts/:id', async (context) => {
      const authzScope = context.get('salesAuthz');
      const input = await context.req.json<Record<string, unknown>>();
      const conditions = await authorizeDatabase(
        authzScope,
        CONTACT_RESOURCE,
        'update',
        {
          fields: { input: Object.keys(input) },
        },
      );
      const updated = await sales.updateContact(
        Number(context.req.param('id')),
        input,
        conditions,
      );
      return updated
        ? context.json({ data: { updated: true } })
        : context.json({ error: 'Contact not found.' }, 404);
    });

    // ---------------------------------------------------------------- leads

    router.get('/sales/leads', async (context) => {
      const authzScope = context.get('salesAuthz');
      const conditions = await authorizeDatabase(
        authzScope,
        LEAD_RESOURCE,
        'read',
        {
          fields: { output: [...LEAD_FIELDS] },
        },
      );
      const query = context.req.query();
      return context.json({
        data: await sales.listLeads(conditions, {
          q: query.q,
          status: query.status as never,
        }),
      });
    });

    router.post('/sales/leads', async (context) => {
      const authzScope = context.get('salesAuthz');
      const input = await context.req.json<Record<string, unknown>>();
      const conditions = await authorizeDatabase(
        authzScope,
        LEAD_RESOURCE,
        'create',
        {
          fields: { input: Object.keys(input), output: ['id'] },
        },
      );
      const created = await sales.createLead(
        input,
        authzScope.identity.principal.id,
        conditions,
      );
      return context.json({ data: created }, 201);
    });

    router.patch('/sales/leads/:id', async (context) => {
      const authzScope = context.get('salesAuthz');
      const input = await context.req.json<Record<string, unknown>>();
      const conditions = await authorizeDatabase(
        authzScope,
        LEAD_RESOURCE,
        'update',
        {
          fields: { input: Object.keys(input) },
        },
      );
      const updated = await sales.updateLead(
        Number(context.req.param('id')),
        input,
        conditions,
      );
      return updated
        ? context.json({ data: { updated: true } })
        : context.json({ error: 'Lead not found.' }, 404);
    });

    router.post('/sales/leads/:id/assign', async (context) => {
      const authzScope = context.get('salesAuthz');
      const body = await context.req.json<{ ownerId?: unknown }>();
      const ownerId = body.ownerId;
      if (typeof ownerId !== 'string' || ownerId.length === 0) {
        return context.json({ error: 'ownerId is required.' }, 400);
      }
      const conditions = await authorizeDatabase(
        authzScope,
        LEAD_RESOURCE,
        'assign',
        {
          fields: {},
        },
      );
      const leadId = Number(context.req.param('id'));
      const assigned = await sales.assignLead(leadId, ownerId, conditions);
      if (!assigned) return context.json({ error: 'Lead not found.' }, 404);
      await workflow.trigger(
        'lead-assignment-notification',
        { leadId, ownerId },
        { eventKey: `lead-assigned:${leadId}:${ownerId}` },
      );
      return context.json({ data: { assigned: true } });
    });

    router.post('/sales/leads/:id/convert', async (context) => {
      const authzScope = context.get('salesAuthz');
      const conditions = await authorizeDatabase(
        authzScope,
        LEAD_RESOURCE,
        'convert',
        {
          fields: {},
        },
      );
      const result = await sales.convertLead(
        Number(context.req.param('id')),
        authzScope.identity.principal.id,
        conditions,
      );
      return context.json(
        { data: result },
        result.alreadyConverted ? 200 : 201,
      );
    });

    router.delete('/sales/leads/:id', async (context) => {
      const authzScope = context.get('salesAuthz');
      const conditions = await authorizeDatabase(
        authzScope,
        LEAD_RESOURCE,
        'delete',
        {
          fields: {},
        },
      );
      const deleted = await sales.deleteLead(
        Number(context.req.param('id')),
        conditions,
      );
      return deleted
        ? context.json({ data: { deleted: true } })
        : context.json({ error: 'Lead not found.' }, 404);
    });

    // ---------------------------------------------------------------- opportunities

    router.get('/sales/opportunities', async (context) => {
      const authzScope = context.get('salesAuthz');
      const conditions = await authorizeDatabase(
        authzScope,
        OPPORTUNITY_RESOURCE,
        'read',
        {
          fields: { output: [...OPPORTUNITY_FIELDS] },
        },
      );
      const query = context.req.query();
      return context.json({
        data: await sales.listOpportunities(conditions, {
          q: query.q,
          stage: query.stage as never,
          customerId: query.customerId ? Number(query.customerId) : undefined,
          includeArchived: query.includeArchived === 'true',
        }),
      });
    });

    router.get('/sales/opportunities/:id', async (context) => {
      const authzScope = context.get('salesAuthz');
      const conditions = await authorizeDatabase(
        authzScope,
        OPPORTUNITY_RESOURCE,
        'read',
        {
          fields: { output: [...OPPORTUNITY_FIELDS] },
        },
      );
      const opportunity = await sales.getOpportunity(
        Number(context.req.param('id')),
        conditions,
      );
      return opportunity
        ? context.json({ data: opportunity })
        : context.json({ error: 'Opportunity not found.' }, 404);
    });

    router.post('/sales/opportunities', async (context) => {
      const authzScope = context.get('salesAuthz');
      const body = await context.req.json<Record<string, unknown>>();
      const { contactIds, ...input } = body;
      const conditions = await authorizeDatabase(
        authzScope,
        OPPORTUNITY_RESOURCE,
        'create',
        {
          fields: { input: Object.keys(input), output: ['id'] },
        },
      );
      const created = await sales.createOpportunity(
        input,
        authzScope.identity.principal.id,
        conditions,
      );
      if (Array.isArray(contactIds) && contactIds.length > 0) {
        await sales.updateOpportunity(
          created.id,
          {},
          contactIds.map(Number),
          conditions,
        );
      }
      return context.json({ data: created }, 201);
    });

    router.patch('/sales/opportunities/:id', async (context) => {
      const authzScope = context.get('salesAuthz');
      const body = await context.req.json<Record<string, unknown>>();
      const { contactIds, ...input } = body;
      const conditions = await authorizeDatabase(
        authzScope,
        OPPORTUNITY_RESOURCE,
        'update',
        {
          fields: { input: Object.keys(input) },
        },
      );
      const updated = await sales.updateOpportunity(
        Number(context.req.param('id')),
        input,
        Array.isArray(contactIds) ? contactIds.map(Number) : undefined,
        conditions,
      );
      return updated
        ? context.json({ data: { updated: true } })
        : context.json({ error: 'Opportunity not found.' }, 404);
    });

    router.post('/sales/opportunities/:id/advance', async (context) => {
      const authzScope = context.get('salesAuthz');
      const conditions = await authorizeDatabase(
        authzScope,
        OPPORTUNITY_RESOURCE,
        'advance',
        {
          fields: {},
        },
      );
      const opportunity = await sales.advanceOpportunity(
        Number(context.req.param('id')),
        conditions,
      );
      return context.json({ data: opportunity });
    });

    router.post('/sales/opportunities/:id/win', async (context) => {
      const authzScope = context.get('salesAuthz');
      const body = await context.req.json<{
        actualAmount?: unknown;
        resultReason?: unknown;
      }>();
      const conditions = await authorizeDatabase(
        authzScope,
        OPPORTUNITY_RESOURCE,
        'win',
        {
          fields: {},
        },
      );
      const opportunityId = Number(context.req.param('id'));
      const opportunity = await sales.winOpportunity(
        opportunityId,
        Number(body.actualAmount),
        typeof body.resultReason === 'string' ? body.resultReason : undefined,
        conditions,
      );
      await workflow.trigger(
        'opportunity-win-notification',
        { opportunityId },
        { eventKey: `opportunity-won:${opportunityId}` },
      );
      return context.json({ data: opportunity });
    });

    router.post('/sales/opportunities/:id/lose', async (context) => {
      const authzScope = context.get('salesAuthz');
      const body = await context.req.json<{ resultReason?: unknown }>();
      const conditions = await authorizeDatabase(
        authzScope,
        OPPORTUNITY_RESOURCE,
        'lose',
        {
          fields: {},
        },
      );
      const opportunity = await sales.loseOpportunity(
        Number(context.req.param('id')),
        typeof body.resultReason === 'string' ? body.resultReason : '',
        conditions,
      );
      return context.json({ data: opportunity });
    });

    router.post('/sales/opportunities/:id/archive', async (context) => {
      const authzScope = context.get('salesAuthz');
      const conditions = await authorizeDatabase(
        authzScope,
        OPPORTUNITY_RESOURCE,
        'archive',
        {
          fields: {},
        },
      );
      const archived = await sales.archiveOpportunity(
        Number(context.req.param('id')),
        conditions,
      );
      return archived
        ? context.json({ data: { archived: true } })
        : context.json(
            { error: 'Opportunity not found or not finished.' },
            404,
          );
    });

    // ---------------------------------------------------------------- follow-ups

    router.get('/sales/follow-ups', async (context) => {
      const authzScope = context.get('salesAuthz');
      const conditions = await authorizeDatabase(
        authzScope,
        FOLLOW_UP_RESOURCE,
        'read',
        {
          fields: { output: [...FOLLOW_UP_FIELDS] },
        },
      );
      const query = context.req.query();
      return context.json({
        data: await sales.listFollowUps(conditions, {
          q: query.q,
          opportunityId: query.opportunityId
            ? Number(query.opportunityId)
            : undefined,
          customerId: query.customerId ? Number(query.customerId) : undefined,
        }),
      });
    });

    router.post('/sales/follow-ups', async (context) => {
      const authzScope = context.get('salesAuthz');
      const input = await context.req.json<Record<string, unknown>>();
      const conditions = await authorizeDatabase(
        authzScope,
        FOLLOW_UP_RESOURCE,
        'create',
        {
          fields: { input: Object.keys(input), output: ['id'] },
        },
      );
      const created = await sales.createFollowUp(
        input,
        authzScope.identity.principal.id,
        conditions,
      );
      return context.json({ data: created }, 201);
    });

    router.patch('/sales/follow-ups/:id', async (context) => {
      const authzScope = context.get('salesAuthz');
      const input = await context.req.json<Record<string, unknown>>();
      const conditions = await authorizeDatabase(
        authzScope,
        FOLLOW_UP_RESOURCE,
        'update',
        {
          fields: { input: Object.keys(input) },
        },
      );
      const updated = await sales.updateFollowUp(
        Number(context.req.param('id')),
        input,
        conditions,
      );
      return updated
        ? context.json({ data: { updated: true } })
        : context.json({ error: 'Follow-up not found.' }, 404);
    });

    return router as unknown as Hono;
  },
);

/**
 * Authorizes a database operation and returns the database conditions (filter
 * + fields) the service layer must apply. Throws a 403 when the decision is
 * not a conditional database grant.
 */
export async function authorizeDatabase(
  scope: SalesAuthzScope,
  resource: { type: string; id: string },
  action: string,
  params: DatabaseAuthorizationParams,
): Promise<DatabaseAuthorizationConditions> {
  const decision = await scope.authorize<DatabaseAuthorizationParams>({
    resource,
    action,
    params,
  });
  return requireDatabaseConditions(decision);
}

export function requireDatabaseConditions(
  decision: AuthorizationDecision,
): DatabaseAuthorizationConditions {
  if (
    decision.effect !== 'conditional' ||
    decision.conditions?.type !== 'database'
  ) {
    throw new SalesBusinessError('FORBIDDEN', '无权访问该资源。', 403);
  }
  return decision.conditions as DatabaseAuthorizationConditions;
}

export type SalesAuthzScope = AuthorizationScope;
