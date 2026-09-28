import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { defineApiRoutes } from '@nocobase/app-server/router';
import {
  AuthorizationDeniedError,
  type AuthorizationEnv,
} from '@nocobase/authorization/core';
import {
  databaseManagerToken,
  RepositoryError,
  type DatabaseManager,
  type FilterBuilder,
  type SortBuilder,
} from '@nocobase/db';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import {
  isItTicketCategory,
  IT_TICKET_STATUS,
  IT_TICKETS_ACTION,
  IT_TICKETS_COLLECTION,
} from './constants.js';
import {
  authorizeItTicket,
  itTicketCapabilities,
  type ItTicketCapabilities,
} from './authorize.js';
import type { ItTicketRecord } from './resources.js';
import { wallClock } from './time.js';

/** The bound Repository narrows its record to a partial, matching the policy. */
type TicketFilter = FilterBuilder<Partial<ItTicketRecord>>;
type TicketSort = SortBuilder<Partial<ItTicketRecord>>;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_TITLE_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_RESOLUTION_LENGTH = 5000;

/** This module's own request parsing; only this type answers 400. */
class ItTicketInputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ItTicketInputError';
  }
}

export interface ItTicketDto {
  id: number;
  title: string;
  category: string;
  description: string | null;
  status: string;
  submitterId: string;
  submitterName: string | null;
  handlerId: string | null;
  handlerName: string | null;
  resolution: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * A ticket, shaped for the wire.
 *
 * Temporal Fields come back from a Repository as wall-clock text already, so
 * this only normalizes the optional ones to a stable `null`.
 */
export function toItTicketDto(record: Partial<ItTicketRecord>): ItTicketDto {
  return {
    id: Number(record.id),
    title: typeof record.title === 'string' ? record.title : '',
    category: typeof record.category === 'string' ? record.category : '',
    description:
      typeof record.description === 'string' ? record.description : null,
    status: typeof record.status === 'string' ? record.status : '',
    submitterId:
      typeof record.submitterId === 'string' ? record.submitterId : '',
    submitterName:
      typeof record.submitterName === 'string' ? record.submitterName : null,
    handlerId: typeof record.handlerId === 'string' ? record.handlerId : null,
    handlerName:
      typeof record.handlerName === 'string' ? record.handlerName : null,
    resolution:
      typeof record.resolution === 'string' ? record.resolution : null,
    startedAt: typeof record.startedAt === 'string' ? record.startedAt : null,
    completedAt:
      typeof record.completedAt === 'string' ? record.completedAt : null,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
  };
}

function stringValue(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ItTicketInputError(`${label} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new ItTicketInputError(`${label} must be at most ${max} characters.`);
  }
  return trimmed;
}

function optionalText(
  value: unknown,
  label: string,
  max: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new ItTicketInputError(`${label} must be text.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > max) {
    throw new ItTicketInputError(`${label} must be at most ${max} characters.`);
  }
  return trimmed;
}

function bodyOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ItTicketInputError('Request body must be an object.');
  }
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new ItTicketInputError(`${label} must be a positive integer.`);
  }
  return number;
}

async function readBody(context: {
  req: { json: () => Promise<unknown> };
}): Promise<Record<string, unknown>> {
  try {
    return bodyOf(await context.req.json());
  } catch (error) {
    if (error instanceof ItTicketInputError) {
      throw error;
    }
    throw new ItTicketInputError('Request body must be valid JSON.');
  }
}

/** Reads the account's display name; a missing user yields `null`, not a failure. */
async function userNameOf(
  database: DatabaseManager,
  userId: string,
): Promise<string | null> {
  const row = await database
    .query()
    .selectFrom('user')
    .select('name')
    .where('id', '=', userId)
    .executeTakeFirst();
  const name = row?.name;
  return typeof name === 'string' && name.length > 0 ? name : null;
}

function denied(): never {
  throw new AuthorizationDeniedError({
    effect: 'deny',
    reasons: [{ code: 'FORBIDDEN', message: 'Permission denied.' }],
  });
}

function isStatus(value: string): boolean {
  return (Object.values(IT_TICKET_STATUS) as readonly string[]).includes(value);
}

interface ErrorBody {
  readonly status: ContentfulStatusCode;
  readonly body: Record<string, unknown>;
}

/** Maps a Repository failure onto the HTTP contract of this feature. */
function repositoryErrorBody(error: RepositoryError): ErrorBody {
  const code = error.code;
  if (
    code === 'WRITE_FORBIDDEN' ||
    code === 'FIELD_WRITE_FORBIDDEN' ||
    code === 'READ_FORBIDDEN' ||
    code === 'FIELD_READ_FORBIDDEN' ||
    code === 'SCOPE_VIOLATION' ||
    code === 'RECORD_OUTSIDE_SCOPE'
  ) {
    return {
      status: 403,
      body: { code: 'FORBIDDEN', message: 'Permission denied.' },
    };
  }
  if (code === 'RECORD_NOT_FOUND' || code === 'MULTIPLE_RECORDS_MATCHED') {
    return {
      status: 409,
      body: {
        code: 'INVALID_STATE',
        message: 'The ticket is no longer in that state.',
      },
    };
  }
  if (code === 'INVALID_MUTATION' || code === 'INVALID_FILTER') {
    return {
      status: 400,
      body: { code: 'INVALID_INPUT', message: error.message },
    };
  }
  return { status: 500, body: { code, message: error.message } };
}

export const itSupportApiRoutes = defineApiRoutes<Application>(
  ({ container }) => {
    // The parent stays untyped so it satisfies the route factory's return type;
    // the mounted sub-router declares the variables the middlewares provide.
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    const database: DatabaseManager = container.resolve(databaseManagerToken);
    const tickets = database.repository<ItTicketRecord>(IT_TICKETS_COLLECTION);

    routes.onError((error, context) => {
      if (error instanceof AuthorizationDeniedError) {
        return context.json(
          { code: 'FORBIDDEN', message: error.message },
          error.status,
        );
      }
      if (error instanceof ItTicketInputError) {
        return context.json(
          { code: 'INVALID_INPUT', message: error.message },
          400,
        );
      }
      if (error instanceof RepositoryError) {
        const mapped = repositoryErrorBody(error);
        return context.json(mapped.body, mapped.status);
      }
      throw error;
    });

    routes.use('*', authentication.required(), authorization.middleware());

    routes.get('/', async (context) => {
      const decision = await authorizeItTicket(
        context.get('authz'),
        IT_TICKETS_ACTION.view,
      );
      if (!decision.permitted) {
        denied();
      }

      const rawStatus = context.req.query('status');
      if (
        rawStatus !== undefined &&
        rawStatus.length > 0 &&
        !isStatus(rawStatus)
      ) {
        throw new ItTicketInputError('Unknown ticket status.');
      }

      const page = context.req.query('page')
        ? positiveInteger(context.req.query('page'), 'page')
        : 1;
      const requestedSize = context.req.query('pageSize')
        ? positiveInteger(context.req.query('pageSize'), 'pageSize')
        : DEFAULT_PAGE_SIZE;
      const pageSize = Math.min(requestedSize, MAX_PAGE_SIZE);
      const status = rawStatus;

      const scoped = tickets.withPolicy(decision.policy);
      const items = await scoped.findMany({
        ...(status !== undefined && status.length > 0
          ? { filter: (f: TicketFilter) => f.string('status').eq(status) }
          : {}),
        sort: (sort: TicketSort) => sort.field('createdAt').desc(),
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      const total = await scoped.count(
        status !== undefined && status.length > 0
          ? { filter: (f: TicketFilter) => f.string('status').eq(status) }
          : {},
      );
      const capabilities: ItTicketCapabilities = await itTicketCapabilities(
        context.get('authz'),
      );

      return context.json({
        data: items.map((item) => toItTicketDto(item)),
        total,
        page,
        pageSize,
        capabilities,
      });
    });

    routes.get('/:id', async (context) => {
      const id = positiveInteger(context.req.param('id'), 'Ticket id');
      const decision = await authorizeItTicket(
        context.get('authz'),
        IT_TICKETS_ACTION.view,
      );
      if (!decision.permitted) {
        denied();
      }

      const record = await tickets
        .withPolicy(decision.policy)
        .findOne({ filter: (f: TicketFilter) => f.number('id').eq(id) });
      if (!record) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Ticket not found.' },
          404,
        );
      }

      return context.json({
        data: toItTicketDto(record),
        capabilities: await itTicketCapabilities(context.get('authz')),
      });
    });

    routes.post('/', async (context) => {
      const input = await readBody(context);
      const decision = await authorizeItTicket(
        context.get('authz'),
        IT_TICKETS_ACTION.create,
      );
      if (!decision.permitted) {
        denied();
      }

      const title = stringValue(input.title, 'Title', MAX_TITLE_LENGTH);
      const category = input.category;
      if (!isItTicketCategory(category)) {
        throw new ItTicketInputError(
          'Category must be computer, account or other.',
        );
      }
      const description = optionalText(
        input.description,
        'Problem description',
        MAX_DESCRIPTION_LENGTH,
      );

      const principal = context.get('authz').identity.principal;
      const submitterId = principal.id;
      const submitterName = await userNameOf(database, submitterId);
      const now = wallClock(new Date());

      const result = await tickets.withPolicy(decision.policy).createOne({
        values: {
          title,
          category,
          description,
          status: IT_TICKET_STATUS.pending,
          submitterId,
          submitterName,
          createdAt: now,
          updatedAt: now,
        },
      });

      return context.json({ data: toItTicketDto(result.record) }, 201);
    });

    routes.post('/:id/start', async (context) => {
      const id = positiveInteger(context.req.param('id'), 'Ticket id');
      const decision = await authorizeItTicket(
        context.get('authz'),
        IT_TICKETS_ACTION.start,
      );
      if (!decision.permitted) {
        denied();
      }

      const existing = await tickets
        .withPolicy(decision.policy)
        .findOne({ filter: (f: TicketFilter) => f.number('id').eq(id) });
      if (!existing) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Ticket not found.' },
          404,
        );
      }
      if (existing.status !== IT_TICKET_STATUS.pending) {
        return context.json(
          {
            code: 'INVALID_STATE',
            message: 'Only a submitted ticket can be started.',
          },
          409,
        );
      }

      const principal = context.get('authz').identity.principal;
      const handlerName = await userNameOf(database, principal.id);
      const now = wallClock(new Date());

      const result = await tickets.withPolicy(decision.policy).updateOne({
        filter: (f: TicketFilter) =>
          f.and([
            f.number('id').eq(id),
            f.string('status').eq(IT_TICKET_STATUS.pending),
          ]),
        values: {
          status: IT_TICKET_STATUS.processing,
          handlerId: principal.id,
          handlerName,
          startedAt: now,
          updatedAt: now,
        },
      });

      return context.json({ data: toItTicketDto(result.record) });
    });

    routes.post('/:id/complete', async (context) => {
      const id = positiveInteger(context.req.param('id'), 'Ticket id');
      const input = await readBody(context);
      const decision = await authorizeItTicket(
        context.get('authz'),
        IT_TICKETS_ACTION.complete,
      );
      if (!decision.permitted) {
        denied();
      }

      const resolution = stringValue(
        input.resolution,
        'Processing note',
        MAX_RESOLUTION_LENGTH,
      );

      const existing = await tickets
        .withPolicy(decision.policy)
        .findOne({ filter: (f: TicketFilter) => f.number('id').eq(id) });
      if (!existing) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Ticket not found.' },
          404,
        );
      }
      if (existing.status !== IT_TICKET_STATUS.processing) {
        return context.json(
          {
            code: 'INVALID_STATE',
            message: 'Only a processing ticket can be completed.',
          },
          409,
        );
      }

      const now = wallClock(new Date());
      const result = await tickets.withPolicy(decision.policy).updateOne({
        filter: (f: TicketFilter) =>
          f.and([
            f.number('id').eq(id),
            f.string('status').eq(IT_TICKET_STATUS.processing),
          ]),
        values: {
          status: IT_TICKET_STATUS.completed,
          resolution,
          completedAt: now,
          updatedAt: now,
        },
      });

      return context.json({ data: toItTicketDto(result.record) });
    });

    router.route('/it-tickets', routes);
    return router;
  },
);
