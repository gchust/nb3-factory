import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';
import {
  condition,
  defineDatabasePermission,
  recordAccess,
  type DatabaseScope,
} from '@nocobase/app-plugin-authorization/server';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager } from '@nocobase/db';

/**
 * Authorization model for the device after-sales service domain. This module is
 * a portable declaration only: it never queries a database or registers
 * anything. `registerServiceAuthorization()` (same directory, provider) both
 * registers the record access here and the composites, and the installation
 * seed reuses `servicePermissionSets` to persist the initial job configuration.
 */

export interface CustomerRow {
  id: number;
  code: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  address: string | null;
  serviceLevel: string;
  notes: string | null;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceRow {
  id: number;
  serialNumber: string;
  name: string;
  model: string | null;
  category: string | null;
  location: string | null;
  status: string;
  warrantyUntil: string | null;
  notes: string | null;
  customerId: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketRow {
  id: number;
  code: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  source: string;
  confidential: boolean;
  reporterName: string | null;
  resolution: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  closedAt: string | null;
  dueAt: string | null;
  acceptanceStatus: string;
  acceptanceError: string | null;
  acceptanceHandledAt: string | null;
  externalEventId: string | null;
  externalPlatform: string | null;
  createdById: string | null;
  assigneeId: string | null;
  customerId: number;
  deviceId: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketEventRow {
  id: number;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  message: string | null;
  actorId: string | null;
  data: Record<string, unknown> | null;
  ticketId: number;
  createdAt: string;
}

export interface KnowledgeRow {
  id: number;
  title: string;
  slug: string;
  category: string | null;
  deviceCategory: string | null;
  summary: string | null;
  content: string;
  status: string;
  tags: readonly string[] | null;
  viewCount: number;
  authorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ManualRow {
  id: number;
  title: string;
  code: string;
  deviceCategory: string | null;
  model: string | null;
  version: string | null;
  summary: string | null;
  status: string;
  fileId: string | null;
  knowledgeBaseKey: string | null;
  indexStatus: string;
  indexError: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionRow {
  id: number;
  code: string;
  title: string;
  scheduledDate: string;
  status: string;
  result: string | null;
  findings: string | null;
  completedAt: string | null;
  remindedAt: string | null;
  createdById: string | null;
  assigneeId: string | null;
  customerId: number;
  deviceId: number;
  createdAt: string;
  updatedAt: string;
}

/* --------------------------------------------------------------------------
 * Record access: named ways to select records, registered by the provider and
 * chosen by permission sets through a data-scope value.
 * ----------------------------------------------------------------------- */

/** Authorization subject type backing the engineer groups. */
export const SERVICE_TEAM_SUBJECT = 'service.team';

/** Tickets currently assigned to the signed-in engineer. */
export const serviceAssignedTickets = defineRecordAccess(
  'service.assignedTickets',
  (access) =>
    access
      .title('Assigned to me')
      .collections('serviceTickets')
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? condition('assigneeId', '$eq', principal.id)
          : false,
      ),
);

/** Tickets the signed-in user created (usually the reporter/observer view). */
export const serviceCreatedTickets = defineRecordAccess(
  'service.createdTickets',
  (access) =>
    access
      .title('Created by me')
      .collections('serviceTickets')
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? condition('createdById', '$eq', principal.id)
          : false,
      ),
);

/** Every non-confidential ticket, for read-only observers. */
export const serviceNonConfidentialTickets = defineRecordAccess(
  'service.nonConfidentialTickets',
  (access) =>
    access
      .title('Non-confidential tickets')
      .collections('serviceTickets')
      .resolver(() => condition('confidential', '$isFalsy')),
);

/** Tickets an engineer may work: assigned to them. Sharing widens this. */
export const serviceReadableTickets = defineRecordAccess(
  'service.readableTickets',
  (access) =>
    access
      .title('Tickets assigned to me')
      .collections('serviceTickets')
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? condition('assigneeId', '$eq', principal.id)
          : false,
      ),
);

/**
 * Published knowledge articles, for every reader.
 */
export const servicePublishedKnowledge = defineRecordAccess(
  'service.publishedKnowledge',
  (access) =>
    access
      .title('Published articles')
      .collections('serviceKnowledgeArticles')
      .resolver(() => condition('status', '$eq', 'published')),
);

/** Published manuals, for every reader. */
export const servicePublishedManuals = defineRecordAccess(
  'service.publishedManuals',
  (access) =>
    access
      .title('Published manuals')
      .collections('serviceManuals')
      .resolver(() => condition('status', '$eq', 'published')),
);

/** Inspections assigned to the signed-in engineer. */
export const serviceMyInspections = defineRecordAccess(
  'service.myInspections',
  (access) =>
    access
      .title('Inspections assigned to me')
      .collections('serviceInspections')
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? condition('assigneeId', '$eq', principal.id)
          : false,
      ),
);

/**
 * One ticket named by a parameter, for the temporary sharing rule. Sharing a
 * single record needs a numeric `id` comparison; the built-in `records`
 * selection compares the primary key as strings, which an integer primary key
 * cannot accept. The parameter is resolved at request time, so a rule shared
 * for one ticket keeps pointing at that ticket.
 */
export const serviceSharedTicket = defineRecordAccess(
  'service.sharedTicket',
  (access) =>
    access
      .title('A specifically shared ticket')
      .collections('serviceTickets')
      .params<{ ticketId?: unknown }>()
      .resolver(({ principal, params }) => {
        const ticketId = Number(params.ticketId);
        if (principal.type !== 'user' || !Number.isInteger(ticketId)) {
          return false;
        }
        return condition('id', '$eq', ticketId);
      }),
);

/* --------------------------------------------------------------------------
 * Collection permissions: requested fields per operation, bound to a data
 * scope key when used inside a composite action.
 * ----------------------------------------------------------------------- */

const ticketRead = defineDatabasePermission((p) =>
  p.collection<TicketRow>('serviceTickets').title('Service tickets').read('*'),
);
const ticketCreate = defineDatabasePermission((p) =>
  p
    .collection<TicketRow>('serviceTickets')
    .title('Service tickets')
    // Reading back the row a Repository created is part of the create itself,
    // so a create grant must allow the read; the scope stays the create scope.
    .read('*')
    .create([
      'code',
      'title',
      'description',
      'status',
      'priority',
      'source',
      'confidential',
      'reporterName',
      'acceptanceStatus',
      'acceptanceError',
      'acceptanceHandledAt',
      'externalEventId',
      'externalPlatform',
      'dueAt',
      'createdById',
      'assigneeId',
      'customerId',
      'deviceId',
      'createdAt',
      'updatedAt',
    ]),
);
const ticketAccept = defineDatabasePermission((p) =>
  p
    .collection<TicketRow>('serviceTickets')
    .title('Accept a ticket')
    .read('*')
    .update([
      'status',
      'acceptanceStatus',
      'acceptanceError',
      'acceptanceHandledAt',
      'acceptedAt',
      'assigneeId',
      'updatedAt',
    ]),
);
const ticketProcess = defineDatabasePermission((p) =>
  p
    .collection<TicketRow>('serviceTickets')
    .title('Process a ticket')
    .read('*')
    .update(['status', 'startedAt', 'updatedAt']),
);
const ticketSubmit = defineDatabasePermission((p) =>
  p
    .collection<TicketRow>('serviceTickets')
    .title('Submit a ticket for confirmation')
    .read('*')
    .update(['status', 'resolution', 'submittedAt', 'updatedAt']),
);
const ticketReturn = defineDatabasePermission((p) =>
  p
    .collection<TicketRow>('serviceTickets')
    .title('Return a ticket to processing')
    .read('*')
    .update(['status', 'resolution', 'updatedAt']),
);
const ticketClose = defineDatabasePermission((p) =>
  p
    .collection<TicketRow>('serviceTickets')
    .title('Close a ticket')
    .read('*')
    .update(['status', 'closedAt', 'updatedAt']),
);
const ticketShareRead = defineDatabasePermission((p) =>
  p
    .collection<TicketRow>('serviceTickets')
    .title('Share a ticket')
    .read([
      'id',
      'code',
      'title',
      'status',
      'priority',
      'confidential',
      'assigneeId',
    ]),
);
const ticketManage = defineDatabasePermission((p) =>
  p
    .collection<TicketRow>('serviceTickets')
    .title('Manage tickets')
    .read('*')
    .create([
      'code',
      'title',
      'description',
      'status',
      'priority',
      'source',
      'confidential',
      'reporterName',
      'resolution',
      'assigneeId',
      'createdById',
      'customerId',
      'deviceId',
      'dueAt',
      'createdAt',
      'updatedAt',
    ])
    .update('*')
    .delete(),
);

const eventRead = defineDatabasePermission((p) =>
  p
    .collection<TicketEventRow>('serviceTicketEvents')
    .title('Ticket events')
    .read('*'),
);
const eventCreate = defineDatabasePermission((p) =>
  p
    .collection<TicketEventRow>('serviceTicketEvents')
    .title('Ticket events')
    .read('*')
    .create([
      'type',
      'fromStatus',
      'toStatus',
      'message',
      'actorId',
      'data',
      'ticketId',
      'createdAt',
    ]),
);

const customerRead = defineDatabasePermission((p) =>
  p.collection<CustomerRow>('serviceCustomers').title('Customers').read('*'),
);
const customerManage = defineDatabasePermission((p) =>
  p
    .collection<CustomerRow>('serviceCustomers')
    .title('Customers')
    .read('*')
    .create([
      'code',
      'name',
      'contactName',
      'contactPhone',
      'address',
      'serviceLevel',
      'notes',
      'ownerId',
      'createdAt',
      'updatedAt',
    ])
    .update('*')
    .delete(),
);

const deviceRead = defineDatabasePermission((p) =>
  p.collection<DeviceRow>('serviceDevices').title('Devices').read('*'),
);
const deviceManage = defineDatabasePermission((p) =>
  p
    .collection<DeviceRow>('serviceDevices')
    .title('Devices')
    .read('*')
    .create([
      'serialNumber',
      'name',
      'model',
      'category',
      'location',
      'status',
      'warrantyUntil',
      'notes',
      'customerId',
      'createdAt',
      'updatedAt',
    ])
    .update('*')
    .delete(),
);

const knowledgeRead = defineDatabasePermission((p) =>
  p
    .collection<KnowledgeRow>('serviceKnowledgeArticles')
    .title('Knowledge articles')
    .read('*'),
);
const knowledgeManage = defineDatabasePermission((p) =>
  p
    .collection<KnowledgeRow>('serviceKnowledgeArticles')
    .title('Knowledge articles')
    .read('*')
    .create([
      'title',
      'slug',
      'category',
      'deviceCategory',
      'summary',
      'content',
      'status',
      'tags',
      'authorId',
      'createdAt',
      'updatedAt',
    ])
    .update('*')
    .delete(),
);

const manualRead = defineDatabasePermission((p) =>
  p.collection<ManualRow>('serviceManuals').title('Manuals').read('*'),
);
const manualManage = defineDatabasePermission((p) =>
  p
    .collection<ManualRow>('serviceManuals')
    .title('Manuals')
    .read('*')
    .create([
      'title',
      'code',
      'deviceCategory',
      'model',
      'version',
      'summary',
      'status',
      'fileId',
      'knowledgeBaseKey',
      'indexStatus',
      'indexError',
      'createdAt',
      'updatedAt',
    ])
    .update('*')
    .delete(),
);

const inspectionRead = defineDatabasePermission((p) =>
  p
    .collection<InspectionRow>('serviceInspections')
    .title('Inspections')
    .read('*'),
);
const inspectionComplete = defineDatabasePermission((p) =>
  p
    .collection<InspectionRow>('serviceInspections')
    .title('Complete an inspection')
    .read('*')
    .update(['status', 'result', 'findings', 'completedAt', 'updatedAt']),
);
const inspectionManage = defineDatabasePermission((p) =>
  p
    .collection<InspectionRow>('serviceInspections')
    .title('Inspections')
    .read('*')
    .create([
      'code',
      'title',
      'scheduledDate',
      'status',
      'result',
      'findings',
      'assigneeId',
      'createdById',
      'customerId',
      'deviceId',
      'createdAt',
      'updatedAt',
    ])
    .update('*')
    .delete(),
);

/* --------------------------------------------------------------------------
 * Composite resources: the business operations routes authorize against.
 * ----------------------------------------------------------------------- */

const assignedDefault = serviceAssignedTickets.reference();
const createdDefault = serviceCreatedTickets.reference();
const inspectionsDefault = serviceMyInspections.reference();
const allTickets = recordAccess.allRecords;
const allRecords = recordAccess.allRecords;

export const serviceCustomers = defineCompositeResource(
  'service.customers',
  (resource) =>
    resource
      .title('Customers')
      .action('view', (action) =>
        action
          .title('View customers')
          .grant('customers', customerRead.default(allRecords)),
      )
      .action('manage', (action) =>
        action
          .title('Manage customers')
          .grant('customers', customerManage.default(allRecords)),
      ),
);

export const serviceDevices = defineCompositeResource(
  'service.devices',
  (resource) =>
    resource
      .title('Devices')
      .action('view', (action) =>
        action
          .title('View devices')
          .grant('devices', deviceRead.default(allRecords)),
      )
      .action('manage', (action) =>
        action
          .title('Manage devices')
          .grant('devices', deviceManage.default(allRecords)),
      ),
);

export const serviceTickets = defineCompositeResource(
  'service.tickets',
  (resource) =>
    resource
      .title('Service tickets')
      .action('view', (action) =>
        action
          .title('View tickets')
          .grant('tickets', ticketRead.default(assignedDefault))
          .grant('events', eventRead.default(allRecords)),
      )
      .action('create', (action) =>
        action
          .title('Create tickets')
          .grant('tickets', ticketCreate.default(createdDefault))
          .grant('events', eventCreate.default(allRecords)),
      )
      .action('accept', (action) =>
        action
          .title('Accept tickets')
          .grant('tickets', ticketAccept.default(assignedDefault))
          .grant('events', eventCreate.default(allRecords)),
      )
      .action('process', (action) =>
        action
          .title('Process tickets')
          .grant('tickets', ticketProcess.default(assignedDefault))
          .grant('events', eventCreate.default(allRecords)),
      )
      .action('submit', (action) =>
        action
          .title('Submit tickets for confirmation')
          .grant('tickets', ticketSubmit.default(assignedDefault))
          .grant('events', eventCreate.default(allRecords)),
      )
      .action('return', (action) =>
        action
          .title('Return tickets to processing')
          .grant('tickets', ticketReturn.default(assignedDefault))
          .grant('events', eventCreate.default(allRecords)),
      )
      .action('close', (action) =>
        action
          .title('Close tickets')
          .grant('tickets', ticketClose.default(assignedDefault))
          .grant('events', eventCreate.default(allRecords)),
      )
      .action('share', (action) =>
        action
          .title('Share tickets')
          .grant('tickets', ticketShareRead.default(allTickets)),
      )
      .action('manage', (action) =>
        action
          .title('Manage tickets')
          .grant('tickets', ticketManage.default(allTickets))
          .grant('events', eventCreate.default(allRecords)),
      ),
);

export const serviceKnowledge = defineCompositeResource(
  'service.knowledge',
  (resource) =>
    resource
      .title('Knowledge base')
      .action('view', (action) =>
        action
          .title('View knowledge')
          .grant(
            'articles',
            knowledgeRead.default(servicePublishedKnowledge.reference()),
          ),
      )
      .action('manage', (action) =>
        action
          .title('Manage knowledge')
          .grant('articles', knowledgeManage.default(allRecords)),
      ),
);

export const serviceManuals = defineCompositeResource(
  'service.manuals',
  (resource) =>
    resource
      .title('Manuals')
      .action('view', (action) =>
        action
          .title('View manuals')
          .grant(
            'manuals',
            manualRead.default(servicePublishedManuals.reference()),
          ),
      )
      .action('manage', (action) =>
        action
          .title('Manage manuals')
          .grant('manuals', manualManage.default(allRecords)),
      ),
);

export const serviceInspections = defineCompositeResource(
  'service.inspections',
  (resource) =>
    resource
      .title('Inspections')
      .action('view', (action) =>
        action
          .title('View inspections')
          .grant('inspections', inspectionRead.default(allRecords)),
      )
      .action('complete', (action) =>
        action
          .title('Complete inspections')
          .grant('inspections', inspectionComplete.default(inspectionsDefault)),
      )
      .action('manage', (action) =>
        action
          .title('Manage inspections')
          .grant('inspections', inspectionManage.default(allRecords)),
      ),
);

export const serviceDashboard = defineCompositeResource(
  'service.dashboard',
  (resource) =>
    resource
      .title('Service dashboard')
      .action('view', (action) =>
        action
          .title('View the dashboard')
          .grant('tickets', ticketRead.default(assignedDefault))
          .grant('inspections', inspectionRead.default(allRecords))
          .grant('customers', customerRead.default(allRecords))
          .grant('devices', deviceRead.default(allRecords)),
      ),
);

export const serviceCompositeResources = [
  serviceCustomers,
  serviceDevices,
  serviceTickets,
  serviceKnowledge,
  serviceManuals,
  serviceInspections,
  serviceDashboard,
] as const;

/** All service collections that participate in authorization. */
export const serviceCollections = [
  { name: 'serviceCustomers', title: 'Customers' },
  { name: 'serviceDevices', title: 'Devices' },
  { name: 'serviceTickets', title: 'Service tickets' },
  { name: 'serviceTicketEvents', title: 'Ticket events' },
  { name: 'serviceKnowledgeArticles', title: 'Knowledge articles' },
  { name: 'serviceManuals', title: 'Manuals' },
  { name: 'serviceInspections', title: 'Inspections' },
  { name: 'serviceAttachments', title: 'Attachments' },
] as const;

/** The composite resources that are placeable in the authorization workspace. */
export const serviceWorkspaceResources = [
  serviceCustomers,
  serviceDevices,
  serviceTickets,
  serviceKnowledge,
  serviceManuals,
  serviceInspections,
  serviceDashboard,
] as const;

function customerScopeForUser(ids: readonly number[]): DatabaseScope {
  if (ids.length === 0) return false;
  const scopes = ids.map((id) => condition('id', '$eq', id));
  return scopes.length === 1
    ? scopes[0]
    : { kind: 'group', logic: 'or', items: scopes };
}

/**
 * Binds database-backed resolvers for the record access that need one. Called
 * from the authorization provider's boot, where a DatabaseManager is available.
 */
export function registerServiceRecordAccess(
  authz: AppAuthorization,
  database: DatabaseManager,
): void {
  authz.recordAccess.define(serviceAssignedTickets);
  authz.recordAccess.define(serviceCreatedTickets);
  authz.recordAccess.define(serviceNonConfidentialTickets);
  authz.recordAccess.define(servicePublishedKnowledge);
  authz.recordAccess.define(servicePublishedManuals);
  authz.recordAccess.define(serviceReadableTickets);
  authz.recordAccess.define(serviceMyInspections);
  authz.recordAccess.define(serviceSharedTicket);
  authz.recordAccess.define(
    defineRecordAccess('service.myCustomers', (access) =>
      access
        .title('Customers I am responsible for')
        .collections('serviceCustomers')
        .resolver(async ({ principal }) => {
          if (principal.type !== 'user') return false;
          return customerScopeForUser([
            ...(await responsibleCustomerIds(database, principal.id)),
          ]);
        }),
    ),
  );
  authz.recordAccess.define(
    defineRecordAccess('service.myDevices', (access) =>
      access
        .title('Devices of my customers')
        .collections('serviceDevices')
        .resolver(async ({ principal }) => {
          if (principal.type !== 'user') return false;
          return customerScopeForDevice(
            await responsibleCustomerIds(database, principal.id),
          );
        }),
    ),
  );
}

/** Customer ids the user owns or has an assigned ticket for. */
async function responsibleCustomerIds(
  database: DatabaseManager,
  userId: string,
): Promise<Set<number>> {
  const owned = await database.repository('serviceCustomers').findMany({
    filter: { ownerId: userId },
    select: (select) => select.fields('id'),
  });
  const assigned = await database.repository('serviceTickets').findMany({
    filter: { assigneeId: userId },
    select: (select) => select.fields('customerId'),
  });
  const ids = new Set<number>();
  for (const row of owned) ids.add(Number(row.id));
  for (const row of assigned) {
    if (row.customerId !== null && row.customerId !== undefined)
      ids.add(Number(row.customerId));
  }
  return ids;
}

function customerScopeForDevice(ids: Set<number>): DatabaseScope {
  if (ids.size === 0) return false;
  const scopes = [...ids].map((id) => condition('customerId', '$eq', id));
  return scopes.length === 1
    ? scopes[0]
    : { kind: 'group', logic: 'or', items: scopes };
}
