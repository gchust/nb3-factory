import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';
import { defineCompositeResource } from '@nocobase/authorization/core';
import type { AuthorizationTitle } from '@nocobase/authorization/core';

/** The Collection backing an IT repair ticket. */
export const IT_TICKETS_COLLECTION = 'itTickets';
/** The composite resource name every IT ticket endpoint authorizes against. */
export const IT_TICKETS_RESOURCE = 'it.tickets';
/** The client page id stored in page grants. */
export const IT_TICKETS_PAGE = 'it.requests';

/** Translations owned by this application resolve in its own i18n namespace. */
export const IT_LOCALE_NAMESPACE = 'nb3-factory';

export function itTitle(key: string): AuthorizationTitle {
  return { key, ns: IT_LOCALE_NAMESPACE };
}

/**
 * The row shape the permission builders type against. Runtime field metadata
 * still comes from the database; this only makes the fluent declarations
 * type-safe.
 */
export interface ItTicket {
  id: number;
  title: string;
  category: string;
  description: string | null;
  status: string;
  resolution: string | null;
  submitterId: string;
  handlerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  submitter?: { id: string; name: string } | null;
  handler?: { id: string; name: string } | null;
}

/** Every readable column, shared by the read branch of each builder. */
const READ_FIELDS = [
  'id',
  'title',
  'category',
  'description',
  'status',
  'resolution',
  'submitterId',
  'handlerId',
  'createdAt',
  'updatedAt',
  'startedAt',
  'completedAt',
] as const satisfies readonly (keyof ItTicket)[];

/**
 * Read capability: the columns a ticket exposes plus the two people relations,
 * restricted to the columns the list and detail views render.
 */
export const ticketView = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicket>(IT_TICKETS_COLLECTION)
    .title(itTitle('it.resource.tickets'))
    .read((read) =>
      read
        .fields(...READ_FIELDS)
        .relation('submitter', (person) => person.fields('id', 'name'))
        .relation('handler', (person) => person.fields('id', 'name')),
    ),
);

/**
 * Create capability. The input allowlist contains the server-written columns
 * as well, because the route composes them; a client never supplies them.
 * `submitterId` must be writable for the `it.submittedByMe` create scope to be
 * satisfiable.
 */
export const ticketCreate = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicket>(IT_TICKETS_COLLECTION)
    .title(itTitle('it.resource.tickets'))
    .read((read) =>
      read
        .fields(...READ_FIELDS)
        .relation('submitter', (person) => person.fields('id', 'name'))
        .relation('handler', (person) => person.fields('id', 'name')),
    )
    .create([
      'title',
      'category',
      'description',
      'status',
      'submitterId',
      'createdAt',
      'updatedAt',
    ]),
);

/**
 * Handle capability: start and complete a ticket. The writable set is exactly
 * the transition columns; the business rules for when they may change live in
 * the service, not here.
 */
export const ticketHandle = defineDatabasePermission((permission) =>
  permission
    .collection<ItTicket>(IT_TICKETS_COLLECTION)
    .title(itTitle('it.resource.tickets'))
    .read((read) =>
      read
        .fields(...READ_FIELDS)
        .relation('submitter', (person) => person.fields('id', 'name'))
        .relation('handler', (person) => person.fields('id', 'name')),
    )
    .update([
      'status',
      'handlerId',
      'resolution',
      'startedAt',
      'completedAt',
      'updatedAt',
    ]),
);

/**
 * The IT ticket business operation. `view` and `create` are the employee
 * responsibilities; `handle` is handler-only and is what makes an employee
 * unable to start or complete a ticket.
 */
export const itTickets = defineCompositeResource(
  IT_TICKETS_RESOURCE,
  (resource) =>
    resource
      .title(itTitle('it.resource.title'))
      .action('view', (action) =>
        action.title(itTitle('it.action.view')).grant('tickets', ticketView),
      )
      .action('create', (action) =>
        action
          .title(itTitle('it.action.create'))
          .grant('tickets', ticketCreate),
      )
      .action('handle', (action) =>
        action
          .title(itTitle('it.action.handle'))
          .grant('tickets', ticketHandle),
      ),
);
