import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { selection } from '@nocobase/authorization/core';
import {
  defineSharingRule,
  type SharingRulesAuthorizationApi,
} from '@nocobase/authorization/sharing-rules';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { serviceTickets } from '../service-resources.js';
import {
  serviceAcceptanceServiceToken,
  serviceTicketServiceToken,
} from '../providers/tokens.js';
import type {
  CreateTicketInput,
  TicketAction,
  TicketPriority,
  TicketTransitionInput,
} from '../providers/ticket-service.js';
import {
  TICKET_PRIORITIES,
  TRANSITION_FROM,
  TicketTransitionError,
} from '../providers/ticket-service.js';
import { asText } from '../providers/text.js';
import {
  actorOf,
  authorizeAction,
  canAuthorizeAction,
  errorCode,
  jsonBody,
  numericParam,
  queryBoolean,
  queryInteger,
  queryValue,
  requirePolicy,
  type ServiceEnv,
} from './service-shared.js';
import type { ServiceTicketRecord } from '../providers/records.js';

const TRANSITIONS: readonly TicketAction[] = [
  'accept',
  'process',
  'submit',
  'return',
  'close',
];

function isTransition(value: string): value is TicketAction {
  return (TRANSITIONS as readonly string[]).includes(value);
}

/**
 * Separation of duties: only the person the ticket is assigned to starts work
 * or submits it for confirmation, and the supervisory actions (accept, return,
 * close) are never taken by that assignee. The check is enforced in code rather
 * than by the permission set alone, so an installation whose stored grants are
 * older than this rule still cannot cross the boundary.
 */
function actorMayAct(
  action: TicketAction,
  ticket: ServiceTicketRecord | Record<string, unknown>,
  actorId: string,
): boolean {
  const assignee = asText(ticket.assigneeId) || null;
  if (action === 'process' || action === 'submit') {
    return Boolean(assignee) && assignee === String(actorId);
  }
  return !assignee || assignee !== String(actorId);
}

/**
 * The transitions this session may actually perform on this ticket: the
 * database grant for the action, the separation-of-duties rule, and the state
 * the action starts from. The client draws exactly these buttons.
 */
async function capabilitiesFor(
  context: Parameters<typeof authorizeAction>[0],
  ticket: ServiceTicketRecord | Record<string, unknown>,
  actorId: string,
): Promise<Record<TicketAction, boolean>> {
  const entries = await Promise.all(
    TRANSITIONS.map(async (action) => {
      const granted = await canAuthorizeAction(
        context,
        'service.tickets',
        action,
      );
      return [
        action,
        granted &&
          actorMayAct(action, ticket, actorId) &&
          TRANSITION_FROM[action] === ticket.status,
      ] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<TicketAction, boolean>;
}

function notFound(): HTTPException {
  return new HTTPException(404, { message: 'Not found' });
}

function priorityOf(value: unknown): TicketPriority | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (
    typeof value === 'string' &&
    (TICKET_PRIORITIES as readonly string[]).includes(value)
  ) {
    return value as TicketPriority;
  }
  throw new HTTPException(400, { message: 'Invalid priority' });
}

/**
 * Service-ticket routes: the list and detail, creation (which triggers the
 * acceptance workflow), the five lifecycle transitions, and temporary read-only
 * sharing through the sharing-rules plugin.
 */
export function createTicketRoutes(
  app: AppPluginApplication,
): Hono<ServiceEnv> {
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const tickets = app.container.resolve(serviceTicketServiceToken);
  const acceptance = app.container.resolve(serviceAcceptanceServiceToken);
  const routes = new Hono<ServiceEnv>();

  routes.use('*', auth.required(), authz.middleware());

  routes.get('/', async (context) => {
    const policies = await authorizeAction(context, 'service.tickets', 'view');
    const status = queryValue(context, 'status');
    const statuses = (queryValue(context, 'statuses') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    const data = await tickets.list(
      {
        tickets: requirePolicy(policies, 'serviceTickets'),
        events: policies.serviceTicketEvents,
      },
      {
        status,
        statuses: statuses.length > 0 ? statuses : undefined,
        priority: queryValue(context, 'priority'),
        query: queryValue(context, 'query'),
        assigneeId: queryValue(context, 'assigneeId'),
        customerId: queryInteger(context, 'customerId'),
        deviceId: queryInteger(context, 'deviceId'),
        confidential: queryBoolean(context, 'confidential'),
        overdue: queryBoolean(context, 'overdue'),
        limit: queryInteger(context, 'limit'),
        offset: queryInteger(context, 'offset'),
      },
    );
    return context.json({ data });
  });

  routes.post('/', async (context) => {
    const policies = await authorizeAction(
      context,
      'service.tickets',
      'create',
    );
    const body = await jsonBody(context);
    const actor = actorOf(context);
    const title = body.title;
    if (typeof title !== 'string' || title.trim().length === 0) {
      throw new HTTPException(400, { message: 'title is required' });
    }
    if (title.length > 255) {
      throw new HTTPException(400, { message: 'title is too long' });
    }
    const input: CreateTicketInput = {
      title,
      customerId: requireInteger(body, 'customerId'),
      deviceId: requireInteger(body, 'deviceId'),
    };
    if (typeof body.description === 'string')
      input.description = body.description;
    if (typeof body.reporterName === 'string')
      input.reporterName = body.reporterName;
    if (typeof body.assigneeId === 'string') input.assigneeId = body.assigneeId;
    if (typeof body.source === 'string') input.source = body.source;
    if (typeof body.dueAt === 'string') input.dueAt = body.dueAt;
    const priority = priorityOf(body.priority);
    if (priority) input.priority = priority;
    if (typeof body.confidential === 'boolean')
      input.confidential = body.confidential;

    let ticket: Record<string, unknown>;
    try {
      ticket = await tickets.create(
        {
          tickets: requirePolicy(policies, 'serviceTickets'),
          events: policies.serviceTicketEvents,
        },
        input,
        actor,
      );
    } catch (error) {
      if (errorCode(error) === 'uniqueViolation') {
        throw new HTTPException(409, {
          message:
            'The ticket could not be created because a value is not unique',
        });
      }
      throw error;
    }

    const dispatch = await acceptance.dispatch(Number(ticket.id));
    const stored = await tickets.get(
      {
        tickets: requirePolicy(policies, 'serviceTickets'),
        events: policies.serviceTicketEvents,
      },
      Number(ticket.id),
    );
    return context.json({ data: stored ?? ticket, acceptance: dispatch }, 201);
  });

  routes.get('/:id', async (context) => {
    const policies = await authorizeAction(context, 'service.tickets', 'view');
    const ticket = await tickets.get(
      {
        tickets: requirePolicy(policies, 'serviceTickets'),
        events: policies.serviceTicketEvents,
      },
      numericParam(context),
    );
    if (!ticket) throw notFound();
    const capabilities = await capabilitiesFor(
      context,
      ticket,
      actorOf(context).id,
    );
    return context.json({ data: { ...ticket, capabilities } });
  });

  routes.post('/:id/transitions/:action', async (context) => {
    const action = context.req.param('action');
    if (!isTransition(action)) {
      throw new HTTPException(400, { message: 'Unknown transition' });
    }
    const id = numericParam(context);
    const actor = actorOf(context);
    // Read the ticket through the view scope first: a caller who cannot see the
    // ticket gets a clean 404, and one who may see it but not act on it gets a
    // clean 403, instead of a write that fails somewhere inside the repository.
    const viewPolicies = await authorizeAction(
      context,
      'service.tickets',
      'view',
    ).catch(() => undefined);
    const visible = viewPolicies
      ? await tickets.get(
          { tickets: requirePolicy(viewPolicies, 'serviceTickets') },
          id,
        )
      : undefined;
    if (!visible) throw notFound();
    if (!actorMayAct(action, visible, actor.id)) {
      throw new HTTPException(403, {
        message:
          action === 'process' || action === 'submit'
            ? 'Only the assigned engineer may perform this action'
            : 'Only a supervisor may perform this action',
      });
    }
    const policies = await authorizeAction(context, 'service.tickets', action);
    const body = await jsonBody(context);
    const input: TicketTransitionInput = {};
    if (typeof body.resolution === 'string') input.resolution = body.resolution;
    if (typeof body.message === 'string') input.message = body.message;
    if (typeof body.assigneeId === 'string') input.assigneeId = body.assigneeId;
    try {
      const ticket = await tickets.transition(
        {
          tickets: requirePolicy(policies, 'serviceTickets'),
          events: policies.serviceTicketEvents,
        },
        id,
        action,
        input,
        actor,
      );
      return context.json({ data: ticket });
    } catch (error) {
      if (error instanceof TicketTransitionError) {
        throw new HTTPException(400, { message: error.message });
      }
      if (errorCode(error) === 'recordNotFound') {
        throw new HTTPException(409, {
          message: 'The ticket is not in the state this action requires',
        });
      }
      throw error;
    }
  });

  routes.post('/:id/share', async (context) => {
    const policies = await authorizeAction(context, 'service.tickets', 'share');
    const id = numericParam(context);
    const ticket = await tickets.get(
      { tickets: requirePolicy(policies, 'serviceTickets') },
      id,
    );
    if (!ticket) throw notFound();
    if (ticket.confidential === true) {
      throw new HTTPException(422, {
        message: 'A confidential ticket cannot be shared',
      });
    }
    if (!('sharingRules' in authz)) {
      throw new HTTPException(503, {
        message: 'Sharing rules are not configured',
      });
    }
    const rules = (authz as typeof authz & SharingRulesAuthorizationApi)
      .sharingRules;
    const body = await jsonBody(context);
    const subjectType =
      typeof body.subjectType === 'string' ? body.subjectType : 'user';
    const subjectId =
      typeof body.subjectId === 'string' || typeof body.subjectId === 'number'
        ? String(body.subjectId)
        : '';
    if (!subjectId) {
      throw new HTTPException(400, { message: 'subjectId is required' });
    }
    const key = `ticket-share:${id}:${subjectType}:${subjectId}`;
    const rule = defineSharingRule(key, serviceTickets.reference())
      .title(`Ticket ${asText(ticket.code) || String(id)} shared`)
      .subjects({ type: subjectType, id: subjectId })
      .scope(
        'view',
        'tickets',
        selection.recordAccess('service.sharedTicket', { ticketId: id }),
      )
      .reason('Temporary access to one service ticket')
      .build();
    const existing = await rules.get(key);
    if (existing) {
      await rules.update(key, rule);
    } else {
      await rules.create(rule);
    }
    return context.json(
      { data: { key, ticketId: id, subjectType, subjectId } },
      201,
    );
  });

  routes.delete('/:id/share', async (context) => {
    const policies = await authorizeAction(context, 'service.tickets', 'share');
    const id = numericParam(context);
    const ticket = await tickets.get(
      { tickets: requirePolicy(policies, 'serviceTickets') },
      id,
    );
    if (!ticket) throw notFound();
    const subjectType = queryValue(context, 'subjectType') ?? 'user';
    const subjectId = queryValue(context, 'subjectId');
    if (!subjectId) {
      throw new HTTPException(400, { message: 'subjectId is required' });
    }
    const key = `ticket-share:${id}:${subjectType}:${subjectId}`;
    const rules = (authz as typeof authz & SharingRulesAuthorizationApi)
      .sharingRules;
    await rules.delete(key);
    return context.json({ data: { key, removed: true } });
  });

  return routes;
}

function requireInteger(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  if (!Number.isInteger(parsed)) {
    throw new HTTPException(400, { message: `${key} is required` });
  }
  return parsed;
}
