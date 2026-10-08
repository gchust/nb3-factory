import {
  definePermissionSet,
  type PermissionSet,
} from '@nocobase/authorization/permission-sets';
import {
  defineRecordAccess,
  type PermissionGrant,
} from '@nocobase/authorization/core';
import {
  anyScope,
  condition,
  type AppAuthorization,
  type DatabaseScope,
} from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager } from '@nocobase/db';

/**
 * The pages this application contributes. The id is stored in page grants, so
 * it is a stable identifier rather than a display string; the menu title comes
 * from the route's `navigation` declaration.
 */
export const SERVICE_PAGES = {
  dashboard: 'service.dashboard',
  customers: 'service.customers',
  devices: 'service.devices',
  tickets: 'service.tickets',
  inspections: 'service.inspections',
  knowledge: 'service.knowledge',
  manuals: 'service.manuals',
  assistant: 'service.assistant',
  operations: 'service.operations',
  messages: 'service.messages',
} as const;

/**
 * Record-access rules the application adds to the authorization registry. The
 * keys are referenced by name from permission-set grants, so an administrator
 * can re-point a grant at another rule without a code change.
 */
export const SERVICE_RECORD_ACCESS = {
  ticketsOwn: 'service.ticketsOwn',
  ticketsVisible: 'service.ticketsVisible',
  ticketsObserver: 'service.ticketsObserver',
  ticketsSubmitted: 'service.ticketsSubmitted',
  devicesRelated: 'service.devicesRelated',
  customersRelated: 'service.customersRelated',
  inspectionsOwn: 'service.inspectionsOwn',
  knowledgePublished: 'service.knowledgePublished',
} as const;

/** Collections this application opts into the permission model. */
export const serviceCollections = [
  { name: 'customers', title: 'Customers' },
  { name: 'devices', title: 'Devices' },
  { name: 'tickets', title: 'Service tickets' },
  { name: 'inspections', title: 'Inspections' },
  { name: 'knowledge_articles', title: 'Knowledge articles' },
  { name: 'manuals', title: 'Device manuals' },
  { name: 'ticket_shares', title: 'Ticket shares' },
  { name: 'acceptance_logs', title: 'Acceptance logs' },
] as const;

function equals(field: string, value: string): DatabaseScope {
  return condition(field, '$eq', value);
}

/**
 * A collection grant for the database permission type. The library's own
 * `databaseGrant` helper is not part of its public server entry point, so the
 * equally small public shape it builds is written here.
 */
function databaseGrant(
  collection: string,
  definition: Readonly<Record<string, Record<string, unknown>>>,
): PermissionGrant {
  return {
    resource: { type: 'database.collection', id: collection },
    actions: Object.entries(definition).map(([action, config]) => ({
      action,
      policy: { type: 'database', ...config },
    })),
  };
}

function anyOf(field: string, values: readonly unknown[]): DatabaseScope {
  return anyScope(
    values.map((value) => condition(field, '$eq', value as never)),
  );
}

/**
 * Every given condition has to hold. The public server entry point exports
 * `anyScope` (an OR of scopes) and `condition`, but not the library's own
 * `allScopes`, so the `and` group it would build is written here for the one
 * rule that needs two conditions to hold together. Note that an observer
 * scope built with `anyScope` would be `observerVisible OR not confidential`,
 * which lets a confidential ticket through as soon as it is observer-visible.
 */
function allOf(...scopes: readonly DatabaseScope[]): DatabaseScope {
  return { kind: 'group', logic: 'and', items: [...scopes] } as DatabaseScope;
}

/**
 * A read, update or delete grant must name a Record Access rule: without one
 * the authorization adapter resolves no positive scope and denies the action.
 * `allRecords` is the library's built-in "every row" rule.
 */
const allRecords = ['allRecords'] as const;

/**
 * Register the application's collections and record-access rules. Called once
 * during provider boot, before the first permission check.
 */
export function registerServiceAuthorization(
  authz: AppAuthorization,
  database: DatabaseManager,
): void {
  for (const collection of serviceCollections) {
    authz.database.collections.add({
      name: collection.name,
      title: collection.title,
    });
  }

  const query = () => database.query('main');
  const devicesOf = async (engineerId: string): Promise<number[]> => {
    const [ticketRows, inspectionRows] = await Promise.all([
      query()
        .selectFrom('tickets')
        .select('device_id')
        .where('owner_id', '=', engineerId)
        .execute<{ device_id: number }>(),
      query()
        .selectFrom('inspections')
        .select('device_id')
        .where('owner_id', '=', engineerId)
        .execute<{ device_id: number }>(),
    ]);
    return [
      ...new Set([
        ...ticketRows.map((row) => row.device_id),
        ...inspectionRows.map((row) => row.device_id),
      ]),
    ];
  };

  authz.recordAccess.define(
    defineRecordAccess(SERVICE_RECORD_ACCESS.ticketsOwn, (access) =>
      access
        .title('Service tickets the signed-in engineer owns')
        .collections('tickets')
        .resolver(({ principal }) => equals('ownerId', principal.id)),
    ),
  );

  authz.recordAccess.define(
    defineRecordAccess(SERVICE_RECORD_ACCESS.ticketsVisible, (access) =>
      access
        .title('Own tickets plus tickets shared for read-only review')
        .collections('tickets')
        .resolver(async ({ principal }) => {
          const rows = await query()
            .selectFrom('ticket_shares')
            .select('ticket_id')
            .where('engineer_id', '=', principal.id)
            .where('active', '=', true)
            .execute<{ ticket_id: number }>();
          const scopes: DatabaseScope[] = [equals('ownerId', principal.id)];
          if (rows.length) {
            scopes.push(
              anyOf(
                'id',
                rows.map((row) => row.ticket_id),
              ),
            );
          }
          return anyScope(scopes);
        }),
    ),
  );

  authz.recordAccess.define(
    defineRecordAccess(SERVICE_RECORD_ACCESS.ticketsObserver, (access) =>
      access
        .title('Non-confidential tickets approved for read-only observers')
        .collections('tickets')
        .resolver(() =>
          allOf(
            condition('observerVisible', '$isTruly'),
            condition('confidential', '$isFalsy'),
          ),
        ),
    ),
  );

  authz.recordAccess.define(
    defineRecordAccess(SERVICE_RECORD_ACCESS.ticketsSubmitted, (access) =>
      access
        .title('Tickets this external account submitted')
        .collections('tickets')
        .resolver(({ principal }) => equals('createdById', principal.id)),
    ),
  );

  authz.recordAccess.define(
    defineRecordAccess(SERVICE_RECORD_ACCESS.devicesRelated, (access) =>
      access
        .title(
          'Devices referenced by the engineer’s own tickets and inspections',
        )
        .collections('devices')
        .resolver(async ({ principal }) => {
          const ids = await devicesOf(principal.id);
          if (!ids.length) {
            return false;
          }
          return anyOf('id', ids);
        }),
    ),
  );

  authz.recordAccess.define(
    defineRecordAccess(SERVICE_RECORD_ACCESS.customersRelated, (access) =>
      access
        .title('Customers the engineer’s own devices belong to')
        .collections('customers')
        .resolver(async ({ principal }) => {
          const ids = await devicesOf(principal.id);
          if (!ids.length) {
            return false;
          }
          const rows = await query()
            .selectFrom('devices')
            .select('customer_id')
            .where('id', 'in', ids)
            .execute<{ customer_id: number }>();
          const customerIds = [...new Set(rows.map((row) => row.customer_id))];
          if (!customerIds.length) {
            return false;
          }
          return anyOf('id', customerIds);
        }),
    ),
  );

  authz.recordAccess.define(
    defineRecordAccess(SERVICE_RECORD_ACCESS.inspectionsOwn, (access) =>
      access
        .title('Inspections assigned to the signed-in engineer')
        .collections('inspections')
        .resolver(({ principal }) => equals('ownerId', principal.id)),
    ),
  );

  authz.recordAccess.define(
    defineRecordAccess(SERVICE_RECORD_ACCESS.knowledgePublished, (access) =>
      access
        .title('Published knowledge articles')
        .collections('knowledge_articles')
        .resolver(() => condition('published', '$isTruly')),
    ),
  );
}

function pageGrant(id: string): PermissionGrant {
  return {
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  };
}

const ticketReadFields = [
  'id',
  'ticketNo',
  'title',
  'customerId',
  'deviceId',
  'problem',
  'priority',
  'dueAt',
  'ownerId',
  'confidential',
  'status',
  'result',
  'resolutionNote',
  'rejectReason',
  'acceptedAt',
  'closedAt',
  'source',
  'createdById',
  'observerVisible',
  'createdAt',
  'updatedAt',
];

const ticketCreateFields = [
  'ticketNo',
  'title',
  'customerId',
  'deviceId',
  'problem',
  'priority',
  'dueAt',
  'ownerId',
  'confidential',
  'status',
  'source',
  'externalEventNo',
  'createdById',
];

const ticketUpdateFields = [
  'title',
  'problem',
  'priority',
  'dueAt',
  'ownerId',
  'confidential',
  'status',
  'result',
  'resolutionNote',
  'rejectReason',
  'acceptedAt',
  'closedAt',
  'observerVisible',
];

/**
 * The four business permission sets. They are seed data: an administrator can
 * edit or re-assign them at runtime through the authorization settings.
 */
export function createServicePermissionSets(): readonly PermissionSet[] {
  const supervisor = definePermissionSet('service-supervisor')
    .title('Service supervisor')
    .grant(
      ...Object.values(SERVICE_PAGES).map(pageGrant),
      databaseGrant('customers', {
        read: { fields: '*', recordAccess: allRecords },
        create: { fields: '*' },
        update: { fields: '*', recordAccess: allRecords },
        delete: { recordAccess: allRecords },
      }),
      databaseGrant('devices', {
        read: { fields: '*', recordAccess: allRecords },
        create: { fields: '*' },
        update: { fields: '*', recordAccess: allRecords },
        delete: { recordAccess: allRecords },
      }),
      databaseGrant('tickets', {
        read: { fields: '*', recordAccess: allRecords },
        create: { fields: ticketCreateFields },
        update: { fields: ticketUpdateFields, recordAccess: allRecords },
        delete: { recordAccess: allRecords },
      }),
      databaseGrant('inspections', {
        read: { fields: '*', recordAccess: allRecords },
        create: { fields: '*' },
        update: { fields: '*', recordAccess: allRecords },
        delete: { recordAccess: allRecords },
      }),
      databaseGrant('knowledge_articles', {
        read: { fields: '*', recordAccess: allRecords },
        create: { fields: '*' },
        update: { fields: '*', recordAccess: allRecords },
        delete: { recordAccess: allRecords },
      }),
      databaseGrant('manuals', {
        read: { fields: '*', recordAccess: allRecords },
        create: { fields: '*' },
        update: { fields: '*', recordAccess: allRecords },
        delete: { recordAccess: allRecords },
      }),
      databaseGrant('ticket_shares', {
        read: { fields: '*', recordAccess: allRecords },
        create: { fields: '*' },
        update: { fields: '*', recordAccess: allRecords },
        delete: { recordAccess: allRecords },
      }),
      databaseGrant('acceptance_logs', {
        read: { fields: '*', recordAccess: allRecords },
      }),
    )
    .build();

  const engineer = definePermissionSet('service-engineer')
    .title('Service engineer')
    .grant(
      pageGrant(SERVICE_PAGES.dashboard),
      pageGrant(SERVICE_PAGES.devices),
      pageGrant(SERVICE_PAGES.tickets),
      pageGrant(SERVICE_PAGES.inspections),
      pageGrant(SERVICE_PAGES.knowledge),
      pageGrant(SERVICE_PAGES.manuals),
      pageGrant(SERVICE_PAGES.assistant),
      pageGrant(SERVICE_PAGES.messages),
      databaseGrant('tickets', {
        read: {
          fields: ticketReadFields,
          recordAccess: [SERVICE_RECORD_ACCESS.ticketsVisible],
        },
        update: {
          fields: ['status', 'result', 'resolutionNote'],
          recordAccess: [SERVICE_RECORD_ACCESS.ticketsOwn],
        },
      }),
      databaseGrant('devices', {
        read: {
          fields: [
            'id',
            'serial',
            'name',
            'model',
            'customerId',
            'engineerId',
            'enabled',
            'nextInspectionAt',
          ],
          recordAccess: [SERVICE_RECORD_ACCESS.devicesRelated],
        },
      }),
      databaseGrant('customers', {
        read: {
          fields: ['id', 'name', 'contactName', 'phone', 'address'],
          recordAccess: [SERVICE_RECORD_ACCESS.customersRelated],
        },
      }),
      databaseGrant('inspections', {
        read: {
          fields: [
            'id',
            'deviceId',
            'plannedDate',
            'ownerId',
            'status',
            'result',
            'completedAt',
            'createdAt',
            'updatedAt',
          ],
          recordAccess: [SERVICE_RECORD_ACCESS.inspectionsOwn],
        },
        update: {
          fields: ['status', 'result', 'completedAt'],
          recordAccess: [SERVICE_RECORD_ACCESS.inspectionsOwn],
        },
      }),
      databaseGrant('knowledge_articles', {
        read: {
          fields: ['id', 'title', 'summary', 'body', 'published', 'updatedAt'],
          recordAccess: [SERVICE_RECORD_ACCESS.knowledgePublished],
        },
      }),
      databaseGrant('manuals', {
        read: {
          fields: [
            'id',
            'title',
            'model',
            'summary',
            'body',
            'status',
            'statusMessage',
            'updatedAt',
          ],
          recordAccess: allRecords,
        },
      }),
      databaseGrant('ticket_shares', {
        read: { fields: '*', recordAccess: allRecords },
      }),
    )
    .build();

  const observer = definePermissionSet('service-observer')
    .title('Read-only observer')
    .grant(
      pageGrant(SERVICE_PAGES.dashboard),
      pageGrant(SERVICE_PAGES.tickets),
      pageGrant(SERVICE_PAGES.messages),
      databaseGrant('tickets', {
        read: {
          fields: [
            'id',
            'ticketNo',
            'title',
            'customerId',
            'deviceId',
            'priority',
            'status',
            'createdAt',
            'updatedAt',
            'closedAt',
          ],
          recordAccess: [SERVICE_RECORD_ACCESS.ticketsObserver],
        },
      }),
    )
    .build();

  const integration = definePermissionSet('service-integration')
    .title('External integration account')
    .grant(
      databaseGrant('tickets', {
        read: {
          fields: [
            'id',
            'ticketNo',
            'title',
            'deviceId',
            'priority',
            'status',
            // The external lookup filters on `eventNo`; a filter on a field the
            // caller may not read is denied with FIELD_READ_FORBIDDEN, so the
            // dedup field has to be readable to this policy.
            'externalEventNo',
            'createdAt',
            'updatedAt',
          ],
          recordAccess: [SERVICE_RECORD_ACCESS.ticketsSubmitted],
        },
        create: {
          fields: [
            'ticketNo',
            'title',
            'customerId',
            'deviceId',
            'problem',
            'priority',
            'status',
            'source',
            'externalEventNo',
            'createdById',
          ],
        },
      }),
    )
    .build();

  return [supervisor, engineer, observer, integration];
}
