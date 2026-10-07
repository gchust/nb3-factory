import {
  defineCompositeResource,
  defineRecordAccess,
  type PermissionGrant,
  type RecordAccessReference,
} from '@nocobase/authorization/core';
import {
  anyScope,
  condition,
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager, FilterNode } from '@nocobase/db';
import { definePermissionSet } from '@nocobase/authorization/permission-sets';

import { PERMISSION_SET_KEYS } from './constants.js';

/**
 * The application's namespace, as `@nocobase/i18n` names it. Server-produced
 * titles point here so the client renders them in the viewer's language from
 * `client/locales/`, which is registered under the application namespace.
 */
export const APP_NS = '@nocobase/i18n/application';

/**
 * The data model as the authorization layer sees it. These row shapes describe
 * the columns the migrations created; they are not runtime models, only what the
 * typed fields of a database permission are checked against.
 */
export interface Customer {
  id: string;
  name: string;
  code: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  level: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  id: string;
  code: string;
  name: string;
  model: string | null;
  serialNumber: string | null;
  customerId: string;
  serviceEngineerId: string | null;
  groupId: string | null;
  location: string | null;
  installDate: string | null;
  warrantyUntil: string | null;
  nextInspectionDate: string | null;
  inspectionCycleDays: number;
  enabled: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrder {
  id: string;
  orderNo: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  confidential: boolean;
  source: string;
  externalEventNo: string | null;
  customerId: string | null;
  deviceId: string | null;
  groupId: string | null;
  assigneeId: string | null;
  createdById: string | null;
  faultCategory: string | null;
  acceptedAt: string | null;
  processingAt: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  closedAt: string | null;
  closeSummary: string | null;
  failureReason: string | null;
  reopenCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderExecution {
  id: string;
  workOrderId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string;
  operatorId: string | null;
  idempotencyKey: string | null;
  result: string;
  failureReason: string | null;
  detail: string | null;
  attempt: number;
  createdAt: string;
}

export interface WorkOrderShare {
  id: string;
  workOrderId: string;
  sharedWithId: string;
  sharedById: string | null;
  note: string | null;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RepairNote {
  id: string;
  title: string;
  body: string;
  deviceModel: string | null;
  faultCategory: string | null;
  authorId: string | null;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceManual {
  id: string;
  title: string;
  modelName: string | null;
  version: string | null;
  docNo: string | null;
  summary: string | null;
  fileKey: string | null;
  fileName: string | null;
  status: string;
  indexMessage: string | null;
  /** The uploaded source document itself, for the manuals this application stores. */
  content?: string | null;
  contentType?: string | null;
  contentSize?: number | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionTask {
  id: string;
  deviceId: string;
  assigneeId: string | null;
  planDate: string;
  status: string;
  result: string | null;
  remark: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderFileRow {
  id: string;
  workOrderId: string;
  fileId: string;
  category: string;
  uploadedById: string | null;
  createdAt: string;
}

export interface ServiceGroup {
  id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceGroupMember {
  id: string;
  groupId: string;
  userId: string;
  memberRole: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One firing of a scheduled task, unique per `(taskKey, runDate)`. */
export interface ScheduledRun {
  id: string;
  taskKey: string;
  runDate: string;
  status: string;
  summary: string | null;
  failureReason: string | null;
  finishedAt: string | null;
  createdAt: string;
}

/** The at-most-once record that an overdue reminder left for one order on one day. */
export interface OverdueReminder {
  id: string;
  workOrderId: string;
  recipientId: string | null;
  sentDate: string;
  channel: string;
  createdAt: string;
}

/**
 * The subject type a service team is addressed by. A rule or a grant can name
 * `{ type: SERVICE_TEAM_SUBJECT_TYPE, id: <groupId> }`; membership is resolved for
 * the principal, so a person belongs to whoever is on their active teams.
 */
export const SERVICE_TEAM_SUBJECT_TYPE = 'service.team';

export const serviceTeam = (id: string): { type: string; id: string } => ({
  type: SERVICE_TEAM_SUBJECT_TYPE,
  id,
});

export const appUser = (id: string): { type: string; id: string } => ({
  type: 'user',
  id,
});

export type AppTitle = string | { key: string; ns: string };

function title(key: string): AppTitle {
  return { key, ns: APP_NS };
}

/** The subject a permission set assigns the application-owned role scopes to. */
export function serviceRole(value: string): { type: string; id: string } {
  return { type: SERVICE_ROLE_SUBJECT_TYPE, id: value };
}

/**
 * The subject type an application-owned business role is addressed by. The
 * permission set a user holds *is* the role, so the scope is resolved from the
 * user's assignments rather than stored a second time.
 */
export const SERVICE_ROLE_SUBJECT_TYPE = 'service.role';

export const workOrderReadFields = [
  'id',
  'orderNo',
  'title',
  'description',
  'status',
  'priority',
  'confidential',
  'source',
  'externalEventNo',
  'customerId',
  'deviceId',
  'groupId',
  'assigneeId',
  'createdById',
  'faultCategory',
  'acceptedAt',
  'processingAt',
  'submittedAt',
  'confirmedAt',
  'closedAt',
  'closeSummary',
  'failureReason',
  'reopenCount',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof WorkOrder)[];

export const deviceReadFields = [
  'id',
  'code',
  'name',
  'model',
  'serialNumber',
  'customerId',
  'serviceEngineerId',
  'groupId',
  'location',
  'installDate',
  'warrantyUntil',
  'nextInspectionDate',
  'inspectionCycleDays',
  'enabled',
  'note',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof Device)[];

// ---------------------------------------------------------------------------
// Trusted lookups backing the record-access selections
//
// These read the application's own rows to answer "which records does this
// person reach". They are not a second permission system: they only ever
// produce a scope, which authorization then intersects with the person's
// grants.
// ---------------------------------------------------------------------------

/**
 * The database the record selections below read the application's own rows
 * through. `authorization` calls them with a principal only, so the connection is
 * bound once at registration time beside the definitions.
 */
let serviceDatabase: DatabaseManager;

export async function activeTeamIds(
  database: DatabaseManager,
  userId: string,
): Promise<readonly string[]> {
  const rows = await database
    .repository<ServiceGroupMember>('serviceGroupMembers')
    .findMany({
      filter: { userId, active: true },
      select: (select) => select.fields('groupId'),
    });
  return rows.map((row) => String(row.groupId));
}

async function deviceIdsOfTeams(
  database: DatabaseManager,
  groupIds: readonly string[],
): Promise<readonly string[]> {
  if (!groupIds.length) return [];
  const rows = await database.repository<Device>('devices').findMany({
    filter: (filter) =>
      filter.or(groupIds.map((id) => filter.string('groupId').eq(id))),
    select: (select) => select.fields('id'),
  });
  return rows.map((row) => String(row.id));
}

/** Shared, still valid, non-confidential orders others handed to this person. */
export async function sharedOrderIds(
  database: DatabaseManager,
  userId: string,
): Promise<readonly string[]> {
  const rows = await database
    .repository<WorkOrderShare>('workOrderShares')
    .findMany({
      filter: { sharedWithId: userId, active: true },
      select: (select) => select.fields('workOrderId', 'expiresAt'),
    });
  const now = Date.now();
  const candidates = rows
    .filter((row) => {
      if (row.expiresAt === null || row.expiresAt === undefined) return true;
      const at = new Date(row.expiresAt).getTime();
      return Number.isNaN(at) || at > now;
    })
    .map((row) => String(row.workOrderId));
  if (!candidates.length) return [];
  // A confidential order is deliberately not shareable, and a share row that
  // predates that rule must not open it either: the flag is re-checked here so
  // the scope stays the last word.
  const orders = await database.repository<WorkOrder>('workOrders').findMany({
    filter: (filter) =>
      filter.and([
        filter.boolean('confidential').isFalse(),
        filter.or(candidates.map((id) => filter.string('id').eq(id))),
      ]),
    select: (select) => select.fields('id'),
  });
  return orders.map((row) => String(row.id));
}

/** Orders this person may reach through their team, their assignment or a share. */
export async function reachableOrderIds(
  database: DatabaseManager,
  userId: string,
  includeShared = true,
): Promise<readonly string[]> {
  const teams = await activeTeamIds(database, userId);
  const rows = await database.repository<WorkOrder>('workOrders').findMany({
    filter: (filter) =>
      filter.or([
        filter.string('assigneeId').eq(userId),
        filter.string('createdById').eq(userId),
        ...teams.map((id) => filter.string('groupId').eq(id)),
      ]),
    select: (select) => select.fields('id'),
  });
  const ids = new Set(rows.map((row) => String(row.id)));
  if (includeShared) {
    for (const id of await sharedOrderIds(database, userId)) ids.add(id);
  }
  return [...ids];
}

function idScope(
  field: string,
  ids: readonly string[],
  primaryKey: string,
): FilterNode | boolean {
  if (!ids.length) return noRowsScope(primaryKey);
  return idsScope(field, ids);
}

/**
 * A scope that matches no row. The authorization package keeps these two
 * helpers private to its database adapter, so the application reproduces them
 * here; a value cannot be both empty and not empty in any dialect.
 */
function noRowsScope(primaryKey: string): FilterNode {
  return {
    kind: 'group',
    logic: 'and',
    items: [
      condition(primaryKey, '$empty'),
      condition(primaryKey, '$notEmpty'),
    ],
  };
}

/** Membership expands to one `$eq` per identifier; there is no `$in` operator. */
function idsScope(field: string, ids: readonly string[]): FilterNode {
  const scope = anyScope(ids.map((id) => condition(field, '$eq', id)));
  return typeof scope === 'boolean' ? noRowsScope(field) : scope;
}

/**
 * The intersection of scopes, as `anyScope` is their union.
 *
 * Two independent rules — who is a member of the order's team, and whether the
 * order's confidentiality lets them read it — must both hold. Combining them
 * with `or` would let either one through on its own, which is exactly how a
 * confidential order leaks to a teammate.
 */
function allOf(scopes: readonly (FilterNode | boolean)[]): FilterNode | boolean {
  if (scopes.includes(false)) return false;
  const items = scopes.filter((scope): scope is FilterNode => scope !== true);
  if (!items.length) return true;
  if (items.length === 1) return items[0];
  return { kind: 'group', logic: 'and', items };
}

// ---------------------------------------------------------------------------
// Record access
// ---------------------------------------------------------------------------

/**
 * Each selection resolves to `false` when it cannot decide for a person. A
 * denial is the safe answer; every row is not.
 */
export const orderAssignedToMe = defineRecordAccess(
  'service.assignedToMe',
  (access) =>
    access
      .title(title('service.recordAccess.assigned'))
      .collections('workOrders')
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? condition('assigneeId', '$eq', principal.id)
          : false,
      ),
);

export const orderCreatedByMe = defineRecordAccess(
  'service.createdByMe',
  (access) =>
    access
      .title(title('service.recordAccess.created'))
      .collections('workOrders')
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? condition('createdById', '$eq', principal.id)
          : false,
      ),
);

/** Orders nobody has taken yet. This is the queue an engineer accepts from. */
export const orderOpenQueue = defineRecordAccess(
  'service.acceptanceQueue',
  (access) =>
    access
      .title(title('service.recordAccess.acceptanceQueue'))
      .description(title('service.recordAccess.acceptanceQueueHint'))
      .collections('workOrders')
      .resolver(() => condition('status', '$eq', 'pending_acceptance')),
);

export const orderMyTeam = defineRecordAccess(
  'service.myTeamOrders',
  (access) =>
    access
      .title(title('service.recordAccess.myTeam'))
      .collections('workOrders')
      .resolver(async ({ principal }) => {
        if (principal.type !== 'user') return false;
        const teams = await activeTeamIds(serviceDatabase, principal.id);
        return anyScope([
          condition('assigneeId', '$eq', principal.id),
          condition('createdById', '$eq', principal.id),
          ...teams.map((id) => condition('groupId', '$eq', id)),
        ]);
      }),
);

export const orderSharedWithMe = defineRecordAccess(
  'service.sharedWithMe',
  (access) =>
    access
      .title(title('service.recordAccess.sharedWithMe'))
      .description(title('service.recordAccess.sharedWithMeHint'))
      .collections('workOrders')
      .resolver(async ({ principal }) => {
        if (principal.type !== 'user') return false;
        const ids = await sharedOrderIds(serviceDatabase, principal.id);
        return idScope('id', ids, 'id');
      }),
);

export const orderVisibleToMe = defineRecordAccess(
  'service.orderVisibleToMe',
  (access) =>
    access
      .title(title('service.recordAccess.orderVisibleToMe'))
      .collections('workOrders')
      .resolver(async ({ principal }) => {
        if (principal.type !== 'user') return false;
        const teams = await activeTeamIds(serviceDatabase, principal.id);
        const shared = await sharedOrderIds(serviceDatabase, principal.id);
        // Membership: an order this person is responsible for, an order of a
        // team they belong to, or one shared with them.
        const membership = anyScope([
          condition('assigneeId', '$eq', principal.id),
          condition('createdById', '$eq', principal.id),
          ...teams.map((id) => condition('groupId', '$eq', id)),
          ...(shared.length ? [idsScope('id', shared)] : []),
        ]);
        // Confidentiality: an ordinary order is visible across the team, a
        // confidential one only to the supervisor and the person responsible.
        const confidentiality = anyScope([
          condition('confidential', '$isFalsy'),
          condition('assigneeId', '$eq', principal.id),
          condition('createdById', '$eq', principal.id),
        ]);
        return allOf([membership, confidentiality]);
      }),
);

/**
 * The plain-looking orders a read-only observer may summarise.
 *
 * A confidential order is flagged, and the flag is the reason it stays out of a
 * reader's list: the observer job is to see the work the team agreed is public.
 */
export const nonConfidentialOrders = defineRecordAccess(
  'service.nonConfidentialOrders',
  (access) =>
    access
      .title(title('service.recordAccess.nonConfidential'))
      .description(title('service.recordAccess.nonConfidentialHint'))
      .collections('workOrders')
      .resolver(() => condition('confidential', '$isFalsy')),
);

export const myDevices = defineRecordAccess('service.myDevices', (access) =>
  access
    .title(title('service.recordAccess.myDevices'))
    .collections('devices')
    .resolver(async ({ principal }) => {
      if (principal.type !== 'user') return false;
      const teams = await activeTeamIds(serviceDatabase, principal.id);
      return anyScope([
        condition('serviceEngineerId', '$eq', principal.id),
        ...teams.map((id) => condition('groupId', '$eq', id)),
      ]);
    }),
);

export const myInspectionTasks = defineRecordAccess(
  'service.myInspectionTasks',
  (access) =>
    access
      .title(title('service.recordAccess.myInspections'))
      .collections('inspectionTasks')
      .resolver(async ({ principal }) => {
        if (principal.type !== 'user') return false;
        const teams = await activeTeamIds(serviceDatabase, principal.id);
        const deviceIds = await deviceIdsOfTeams(serviceDatabase, teams);
        return anyScope([
          condition('assigneeId', '$eq', principal.id),
          ...deviceIds.map((id) => condition('deviceId', '$eq', id)),
        ]);
      }),
);

export const orderAttachments = defineRecordAccess(
  'service.orderAttachments',
  (access) =>
    access
      .title(title('service.recordAccess.orderAttachments'))
      .collections('workOrderFiles')
      .resolver(async ({ principal }) => {
        if (principal.type !== 'user') return false;
        // A temporary share is read-only: it lets the recipient open the order
        // and its files, never add or remove one, so the ids a share adds are
        // deliberately left out here.
        const ids = await reachableOrderIds(
          serviceDatabase,
          principal.id,
          false,
        );
        return idScope('workOrderId', ids, 'id');
      }),
);

/**
 * Repair knowledge the whole team may read: published notes only.
 *
 * A draft stays with the supervisor who maintains it; granting read access to
 * knowledge is not a grant to unfinished work.
 */
export const publishedNotes = defineRecordAccess(
  'service.publishedNotes',
  (access) =>
    access
      .title(title('service.recordAccess.publishedNotes'))
      .description(title('service.recordAccess.publishedNotesHint'))
      .collections('repairNotes')
      .resolver(() => condition('status', '$eq', 'published')),
);

/**
 * Device manuals an engineer may read: the ones processing finished for.
 *
 * `draft` is not yet published and `failed` never became usable, so neither is
 * offered to someone who only reads.
 */
export const availableManuals = defineRecordAccess(
  'service.availableManuals',
  (access) =>
    access
      .title(title('service.recordAccess.availableManuals'))
      .description(title('service.recordAccess.availableManualsHint'))
      .collections('deviceManuals')
      .resolver(() =>
        anyScope([
          condition('status', '$eq', 'published'),
          condition('status', '$eq', 'indexed'),
        ]),
      ),
);

export const everyRecord = recordAccess.allRecords;
export const recordsICreated = recordAccess.recordsICreated;
export const recordsIOwn = recordAccess.recordsIOwn;

const READ_CHOICES = [
  everyRecord,
  orderMyTeam.reference(),
  orderAssignedToMe.reference(),
  orderCreatedByMe.reference(),
  orderSharedWithMe.reference(),
  orderVisibleToMe.reference(),
  orderOpenQueue.reference(),
  nonConfidentialOrders.reference(),
] as const;

const ORDER_WRITE_CHOICES = [
  orderMyTeam.reference(),
  orderAssignedToMe.reference(),
  orderCreatedByMe.reference(),
  orderVisibleToMe.reference(),
] as const;

const DEVICE_CHOICES = [everyRecord, myDevices.reference()] as const;

const INSPECTION_CHOICES = [
  everyRecord,
  myInspectionTasks.reference(),
] as const;

const ATTACHMENT_CHOICES = [everyRecord, orderAttachments.reference()] as const;

type Ref = RecordAccessReference<string>;

// ---------------------------------------------------------------------------
// Collection permissions
//
// A read-shaped permission defaults to every record, so a permission set created
// in the interface starts permissive and an administrator narrows it. A
// write-shaped permission carries no default: until a selection is made the
// action reaches nothing.
// ---------------------------------------------------------------------------

export const customerRead = defineDatabasePermission<Customer, string>((p) =>
  p
    .collection<Customer>('customers')
    .title(title('service.scope.customers'))
    .read([
      'id',
      'name',
      'code',
      'contactName',
      'contactPhone',
      'contactEmail',
      'address',
      'level',
      'note',
      'createdAt',
      'updatedAt',
    ]),
);

export const customerWrite = defineDatabasePermission<Customer, string>((p) =>
  p
    .collection<Customer>('customers')
    .title(title('service.scope.customers'))
    .read([
      'id',
      'name',
      'code',
      'contactName',
      'contactPhone',
      'contactEmail',
      'address',
      'level',
      'note',
      'createdAt',
      'updatedAt',
    ])
    .create([
      'id',
      'name',
      'code',
      'contactName',
      'contactPhone',
      'contactEmail',
      'address',
      'level',
      'note',
      'createdAt',
      'updatedAt',
    ])
    .update([
      'name',
      'contactName',
      'contactPhone',
      'contactEmail',
      'address',
      'level',
      'note',
      'updatedAt',
    ]),
);

export const deviceRead = defineDatabasePermission<Device, string>((p) =>
  p
    .collection<Device>('devices')
    .title(title('service.scope.devices'))
    .options(...DEVICE_CHOICES)
    .default(everyRecord)
    .read([...deviceReadFields]),
);

export const deviceWrite = defineDatabasePermission<Device, string>((p) =>
  p
    .collection<Device>('devices')
    .title(title('service.scope.devices'))
    .options(...DEVICE_CHOICES)
    .read([...deviceReadFields])
    .create([
      'id',
      'code',
      'name',
      'model',
      'serialNumber',
      'customerId',
      'serviceEngineerId',
      'groupId',
      'location',
      'installDate',
      'warrantyUntil',
      'nextInspectionDate',
      'inspectionCycleDays',
      'enabled',
      'note',
      'createdAt',
      'updatedAt',
    ])
    .update([
      'name',
      'model',
      'serialNumber',
      'customerId',
      'serviceEngineerId',
      'groupId',
      'location',
      'installDate',
      'warrantyUntil',
      'nextInspectionDate',
      'inspectionCycleDays',
      'enabled',
      'note',
      'updatedAt',
    ]),
);

export const workOrderRead = defineDatabasePermission<WorkOrder, string>((p) =>
  p
    .collection<WorkOrder>('workOrders')
    .title(title('service.scope.workOrders'))
    .options(...READ_CHOICES)
    .default(everyRecord)
    .read([...workOrderReadFields]),
);

export const workOrderCreate = defineDatabasePermission<WorkOrder, string>(
  (p) =>
    p
      .collection<WorkOrder>('workOrders')
      .title(title('service.scope.workOrders'))
      .options(...READ_CHOICES)
      .default(everyRecord)
      .read([...workOrderReadFields])
      .create([
        'id',
        'orderNo',
        'title',
        'description',
        'status',
        'priority',
        'confidential',
        'source',
        'externalEventNo',
        'customerId',
        'deviceId',
        'groupId',
        'assigneeId',
        'createdById',
        'faultCategory',
        'createdAt',
        'updatedAt',
      ]),
);

export const workOrderTransition = defineDatabasePermission<WorkOrder, string>(
  (p) =>
    p
      .collection<WorkOrder>('workOrders')
      .title(title('service.scope.workOrders'))
      .options(...ORDER_WRITE_CHOICES)
      .read([...workOrderReadFields])
      .update([
        'status',
        'assigneeId',
        'groupId',
        'priority',
        'faultCategory',
        'acceptedAt',
        'processingAt',
        'submittedAt',
        'confirmedAt',
        'closedAt',
        'closeSummary',
        'failureReason',
        'reopenCount',
        'updatedAt',
      ]),
);

/** Reading a work order in order to hand it out, without writing it. */
export const workOrderShareTarget = defineDatabasePermission<WorkOrder, string>(
  (p) =>
    p
      .collection<WorkOrder>('workOrders')
      .title(title('service.scope.workOrders'))
      .options(...ORDER_WRITE_CHOICES)
      .read([...workOrderReadFields]),
);

export const shareRead = defineDatabasePermission<WorkOrderShare, string>((p) =>
  p
    .collection<WorkOrderShare>('workOrderShares')
    .title(title('service.scope.shares'))
    .options(everyRecord)
    .default(everyRecord)
    .read([
      'id',
      'workOrderId',
      'sharedWithId',
      'sharedById',
      'note',
      'expiresAt',
      'active',
      'createdAt',
      'updatedAt',
    ]),
);

export const shareWrite = defineDatabasePermission<WorkOrderShare, string>(
  (p) =>
    p
      .collection<WorkOrderShare>('workOrderShares')
      .title(title('service.scope.shares'))
      .options(everyRecord)
      .default(everyRecord)
      .read(['id', 'workOrderId', 'sharedWithId', 'active'])
      .create([
        'id',
        'workOrderId',
        'sharedWithId',
        'sharedById',
        'note',
        'expiresAt',
        'active',
        'createdAt',
        'updatedAt',
      ])
      .update(['active', 'expiresAt', 'note', 'updatedAt']),
);

export const attachmentRead = defineDatabasePermission<
  WorkOrderFileRow,
  string
>((p) =>
  p
    .collection<WorkOrderFileRow>('workOrderFiles')
    .title(title('service.scope.attachments'))
    .options(...ATTACHMENT_CHOICES)
    .default(everyRecord)
    .read([
      'id',
      'workOrderId',
      'fileId',
      'category',
      'uploadedById',
      'createdAt',
    ]),
);

export const attachmentManage = defineDatabasePermission<
  WorkOrderFileRow,
  string
>((p) =>
  p
    .collection<WorkOrderFileRow>('workOrderFiles')
    .title(title('service.scope.attachments'))
    .options(...ATTACHMENT_CHOICES)
    .read([
      'id',
      'workOrderId',
      'fileId',
      'category',
      'uploadedById',
      'createdAt',
    ])
    .create([
      'id',
      'workOrderId',
      'fileId',
      'category',
      'uploadedById',
      'createdAt',
    ])
    .delete(),
);

export const repairNoteRead = defineDatabasePermission<RepairNote, string>(
  (p) =>
    p
      .collection<RepairNote>('repairNotes')
      .title(title('service.scope.repairNotes'))
      .options(everyRecord, publishedNotes.reference())
      .default(everyRecord)
      .read([
        'id',
        'title',
        'body',
        'deviceModel',
        'faultCategory',
        'authorId',
        'status',
        'publishedAt',
        'createdAt',
        'updatedAt',
      ]),
);

export const repairNoteWrite = defineDatabasePermission<RepairNote, string>(
  (p) =>
    p
      .collection<RepairNote>('repairNotes')
      .title(title('service.scope.repairNotes'))
      .options(everyRecord, recordsICreated)
      .read(['id', 'title', 'body', 'deviceModel', 'faultCategory', 'status'])
      .create([
        'id',
        'title',
        'body',
        'deviceModel',
        'faultCategory',
        'authorId',
        'status',
        'publishedAt',
        'createdAt',
        'updatedAt',
      ])
      .update([
        'title',
        'body',
        'deviceModel',
        'faultCategory',
        'status',
        'publishedAt',
        'updatedAt',
      ]),
);

export const manualRead = defineDatabasePermission<DeviceManual, string>((p) =>
  p
    .collection<DeviceManual>('deviceManuals')
    .title(title('service.scope.manuals'))
    .options(everyRecord, availableManuals.reference())
    .default(everyRecord)
    .read([
      'id',
      'title',
      'modelName',
      'version',
      'docNo',
      'summary',
      'fileName',
      'status',
      'indexMessage',
      'publishedAt',
      'createdAt',
      'updatedAt',
    ]),
);

export const manualWrite = defineDatabasePermission<DeviceManual, string>((p) =>
  p
    .collection<DeviceManual>('deviceManuals')
    .title(title('service.scope.manuals'))
    .options(everyRecord)
    .read(['id', 'title', 'modelName', 'version', 'status'])
    .create([
      'id',
      'title',
      'modelName',
      'version',
      'docNo',
      'summary',
      'fileKey',
      'fileName',
      'status',
      'indexMessage',
      'publishedAt',
      'createdAt',
      'updatedAt',
    ])
    .update([
      'title',
      'modelName',
      'version',
      'docNo',
      'summary',
      'fileKey',
      'fileName',
      'status',
      'indexMessage',
      'publishedAt',
      'updatedAt',
    ]),
);

export const inspectionRead = defineDatabasePermission<InspectionTask, string>(
  (p) =>
    p
      .collection<InspectionTask>('inspectionTasks')
      .title(title('service.scope.inspections'))
      .options(...INSPECTION_CHOICES)
      .default(everyRecord)
      .read([
        'id',
        'deviceId',
        'assigneeId',
        'planDate',
        'status',
        'result',
        'remark',
        'completedAt',
        'createdAt',
        'updatedAt',
      ]),
);

export const inspectionWrite = defineDatabasePermission<InspectionTask, string>(
  (p) =>
    p
      .collection<InspectionTask>('inspectionTasks')
      .title(title('service.scope.inspections'))
      .options(...INSPECTION_CHOICES)
      .read(['id', 'deviceId', 'assigneeId', 'planDate', 'status'])
      .update(['status', 'result', 'remark', 'completedAt', 'updatedAt']),
);

/**
 * The scheduled-run ledger: the row a manual or scheduled task run writes.
 *
 * Running a task is authorized through the record it leaves behind, so an
 * administrator grants the operation here rather than on every collection a
 * task happens to touch.
 */
export const scheduledRunManage = defineDatabasePermission<
  ScheduledRun,
  string
>((p) =>
  p
    .collection<ScheduledRun>('scheduledRuns')
    .title(title('service.scope.scheduledRuns'))
    .options(everyRecord)
    .default(everyRecord)
    .read([
      'id',
      'taskKey',
      'runDate',
      'status',
      'summary',
      'failureReason',
      'finishedAt',
      'createdAt',
    ])
    .create([
      'id',
      'taskKey',
      'runDate',
      'status',
      'summary',
      'failureReason',
      'finishedAt',
      'createdAt',
    ])
    .update(['status', 'summary', 'failureReason', 'finishedAt']),
);

// ---------------------------------------------------------------------------
// Composite resources: the business operations a permission set grants
//
// Every action that reaches rows carries a data scope. `workOrderData` decides
// which orders the action works on, so "which orders may I see" and "which
// orders may I accept" are configured in one place.
// ---------------------------------------------------------------------------

export const customerResource = defineCompositeResource(
  'service.customers',
  (r) =>
    r
      .title(title('service.resource.customers'))
      .action('view', (a) =>
        a
          .title(title('service.action.view'))
          .grant('customerData', customerRead, {
            title: title('service.scope.customers'),
          }),
      )
      .action('maintain', (a) =>
        a
          .title(title('service.action.maintain'))
          .grant('customerData', customerWrite, {
            title: title('service.scope.customers'),
          }),
      ),
);

export const deviceResource = defineCompositeResource('service.devices', (r) =>
  r
    .title(title('service.resource.devices'))
    .action('view', (a) =>
      a.title(title('service.action.view')).grant('deviceData', deviceRead, {
        title: title('service.scope.devices'),
      }),
    )
    .action('maintain', (a) =>
      a
        .title(title('service.action.maintain'))
        .grant('deviceData', deviceWrite, {
          title: title('service.scope.devices'),
        }),
    ),
);

export const workOrderResource = defineCompositeResource(
  'service.workOrders',
  (r) =>
    r
      .title(title('service.resource.workOrders'))
      .action('view', (a) =>
        a
          .title(title('service.action.view'))
          .grant('workOrderData', workOrderRead, {
            title: title('service.scope.workOrders'),
          }),
      )
      .action('create', (a) =>
        a
          .title(title('service.action.create'))
          .grant('workOrderData', workOrderCreate, {
            title: title('service.scope.workOrders'),
          }),
      )
      .action('accept', (a) =>
        a
          .title(title('service.action.accept'))
          .grant('workOrderData', workOrderTransition, {
            title: title('service.scope.workOrders'),
          }),
      )
      .action('process', (a) =>
        a
          .title(title('service.action.process'))
          .grant('workOrderData', workOrderTransition, {
            title: title('service.scope.workOrders'),
          }),
      )
      .action('submit', (a) =>
        a
          .title(title('service.action.submit'))
          .grant('workOrderData', workOrderTransition, {
            title: title('service.scope.workOrders'),
          }),
      )
      .action('confirm', (a) =>
        a
          .title(title('service.action.confirm'))
          .grant('workOrderData', workOrderTransition, {
            title: title('service.scope.workOrders'),
          }),
      )
      .action('close', (a) =>
        a
          .title(title('service.action.close'))
          .grant('workOrderData', workOrderTransition, {
            title: title('service.scope.workOrders'),
          }),
      )
      .action('reopen', (a) =>
        a
          .title(title('service.action.reopen'))
          .grant('workOrderData', workOrderTransition, {
            title: title('service.scope.workOrders'),
          }),
      )
      .action('share', (a) =>
        a
          .title(title('service.action.share'))
          .grant('workOrderData', workOrderShareTarget, {
            title: title('service.scope.workOrders'),
          })
          .grant('shareData', shareWrite, {
            title: title('service.scope.shares'),
          }),
      )
      .action('attach', (a) =>
        a
          .title(title('service.action.attach'))
          .grant('attachmentData', attachmentManage, {
            title: title('service.scope.attachments'),
          }),
      ),
);

export const repairNoteResource = defineCompositeResource(
  'service.repairNotes',
  (r) =>
    r
      .title(title('service.resource.repairNotes'))
      .action('view', (a) =>
        a
          .title(title('service.action.view'))
          .grant('repairNoteData', repairNoteRead, {
            title: title('service.scope.repairNotes'),
          }),
      )
      .action('publish', (a) =>
        a
          .title(title('service.action.publish'))
          .grant('repairNoteData', repairNoteWrite, {
            title: title('service.scope.repairNotes'),
          }),
      ),
);

export const manualResource = defineCompositeResource('service.manuals', (r) =>
  r
    .title(title('service.resource.manuals'))
    .action('view', (a) =>
      a.title(title('service.action.view')).grant('manualData', manualRead, {
        title: title('service.scope.manuals'),
      }),
    )
    .action('maintain', (a) =>
      a
        .title(title('service.action.maintain'))
        .grant('manualData', manualWrite, {
          title: title('service.scope.manuals'),
        }),
    ),
);

export const inspectionResource = defineCompositeResource(
  'service.inspections',
  (r) =>
    r
      .title(title('service.resource.inspections'))
      .action('view', (a) =>
        a
          .title(title('service.action.view'))
          .grant('inspectionData', inspectionRead, {
            title: title('service.scope.inspections'),
          }),
      )
      .action('complete', (a) =>
        a
          .title(title('service.action.complete'))
          .grant('inspectionData', inspectionWrite, {
            title: title('service.scope.inspections'),
          }),
      ),
);

/** The supervisor dashboards read orders; they never write them. */
export const reportResource = defineCompositeResource('service.reports', (r) =>
  r.title(title('service.resource.reports')).action('view', (a) =>
    a
      .title(title('service.action.view'))
      .grant('workOrderData', workOrderRead, {
        title: title('service.scope.workOrders'),
      }),
  ),
);

/** The device platform's own surface: a machine submits and reads back. */
export const devicePlatformResource = defineCompositeResource(
  'service.devicePlatform',
  (r) =>
    r
      .title(title('service.resource.devicePlatform'))
      .action('submit', (a) =>
        a
          .title(title('service.action.submitRepair'))
          .grant('workOrderData', workOrderCreate, {
            title: title('service.scope.workOrders'),
          }),
      )
      .action('read', (a) =>
        a
          .title(title('service.action.readOwn'))
          .grant('workOrderData', workOrderRead, {
            title: title('service.scope.workOrders'),
          }),
      ),
);

/** Running a scheduled job by hand, and reading its history. */
export const systemResource = defineCompositeResource('service.system', (r) =>
  r.title(title('service.resource.system')).action('runTask', (a) =>
    a
      .title(title('service.action.runTask'))
      .grant('scheduledRunData', scheduledRunManage, {
        title: title('service.scope.scheduledRuns'),
      }),
  ),
);

export const allResources = [
  customerResource,
  deviceResource,
  workOrderResource,
  repairNoteResource,
  manualResource,
  inspectionResource,
  reportResource,
  devicePlatformResource,
] as const;

/**
 * The composite resource ids this application registers, by domain name.
 *
 * A route names the resource and action it performs through this map, and the
 * permission sets grant the same ids, so a renamed resource is one edit rather
 * than a string search.
 */
export const SERVICE_RESOURCES = {
  customers: 'service.customers',
  devices: 'service.devices',
  workOrders: 'service.workOrders',
  repairNotes: 'service.repairNotes',
  manuals: 'service.manuals',
  inspections: 'service.inspections',
  reports: 'service.reports',
  devicePlatform: 'service.devicePlatform',
  system: 'service.system',
} as const;

const collectionDefinitions = [
  { name: 'customers', title: title('service.collection.customers') },
  { name: 'serviceGroups', title: title('service.collection.serviceGroups') },
  {
    name: 'serviceGroupMembers',
    title: title('service.collection.serviceGroupMembers'),
    actions: ['read'],
  },
  { name: 'devices', title: title('service.collection.devices') },
  { name: 'workOrders', title: title('service.collection.workOrders') },
  {
    name: 'workOrderExecutions',
    title: title('service.collection.workOrderExecutions'),
    actions: ['read'],
  },
  {
    name: 'workOrderShares',
    title: title('service.collection.workOrderShares'),
  },
  { name: 'repairNotes', title: title('service.collection.repairNotes') },
  { name: 'deviceManuals', title: title('service.collection.deviceManuals') },
  {
    name: 'inspectionTasks',
    title: title('service.collection.inspectionTasks'),
  },
  { name: 'workOrderFiles', title: title('service.collection.workOrderFiles') },
  {
    name: 'serviceFiles',
    title: title('service.collection.serviceFiles'),
    actions: ['read'],
  },
  {
    name: 'scheduledRuns',
    title: title('service.collection.scheduledRuns'),
  },
] as const;

/**
 * Teaches authorization about this application: the collections it guards, the
 * record selections its rules and grants choose from, the operations a permission
 * set grants, and where each appears in the permission workspace.
 *
 * It registers definitions only. Who holds which permission is a Permission Set
 * assignment, which the seed creates and an administrator can change.
 */
export function registerServiceAuthorization(
  authz: AppAuthorization,
  database: DatabaseManager,
): void {
  serviceDatabase = database;

  for (const definition of collectionDefinitions) {
    authz.database.collections.add(definition);
  }

  for (const access of [
    orderAssignedToMe,
    orderCreatedByMe,
    orderOpenQueue,
    orderMyTeam,
    orderSharedWithMe,
    orderVisibleToMe,
    nonConfidentialOrders,
    myDevices,
    myInspectionTasks,
    orderAttachments,
    publishedNotes,
    availableManuals,
  ]) {
    authz.recordAccess.define(access);
  }

  const references = {
    customers: authz.compositeResources.define(customerResource),
    devices: authz.compositeResources.define(deviceResource),
    workOrders: authz.compositeResources.define(workOrderResource),
    repairNotes: authz.compositeResources.define(repairNoteResource),
    manuals: authz.compositeResources.define(manualResource),
    inspections: authz.compositeResources.define(inspectionResource),
    reports: authz.compositeResources.define(reportResource),
    devicePlatform: authz.compositeResources.define(devicePlatformResource),
    system: authz.compositeResources.define(systemResource),
  };

  authz.subjects.add(SERVICE_TEAM_SUBJECT_TYPE, {
    resolveFor: async (principal) =>
      principal.type === 'user'
        ? await activeTeamIds(database, principal.id)
        : [],
    filterActive: async (ids) => {
      if (!ids.length) return [];
      const groups = await database
        .repository<ServiceGroup>('serviceGroups')
        .findMany({
          filter: (filter) =>
            filter.and([
              filter.boolean('active').isTrue(),
              filter.or(ids.map((id) => filter.string('id').eq(id))),
            ]),
          select: (select) => select.fields('id'),
        });
      return groups.map((group) => String(group.id));
    },
  });

  authz.ui.sections.add({
    name: 'service',
    title: title('service.workspace'),
    order: 20,
  });
  authz.ui.sections.add({
    name: 'service.dispatch',
    title: title('service.workspace.dispatch'),
    parent: 'service',
    order: 1,
  });
  authz.ui.sections.add({
    name: 'service.parts',
    title: title('service.workspace.knowledge'),
    parent: 'service',
    order: 2,
  });
  authz.ui.sections.add({
    name: 'service.insight',
    title: title('service.workspace.insight'),
    parent: 'service',
    order: 3,
  });
  authz.ui.sections.add({
    name: 'service.system',
    title: title('service.workspace.system'),
    parent: 'service',
    order: 4,
  });

  authz.ui.place(references.workOrders, {
    section: 'service.dispatch',
    order: 1,
  });
  authz.ui.place(references.inspections, {
    section: 'service.dispatch',
    order: 2,
  });
  authz.ui.place(references.devices, { section: 'service.dispatch', order: 3 });
  authz.ui.place(references.customers, {
    section: 'service.dispatch',
    order: 4,
  });
  authz.ui.place(references.repairNotes, {
    section: 'service.parts',
    order: 1,
  });
  authz.ui.place(references.manuals, { section: 'service.parts', order: 2 });
  authz.ui.place(references.reports, { section: 'service.insight', order: 1 });
  authz.ui.place(references.devicePlatform, {
    section: 'service.system',
    order: 1,
  });
  authz.ui.place(references.system, { section: 'service.system', order: 2 });
}

export type { Ref };

// ---------------------------------------------------------------------------
// Permission sets: the jobs this application ships
//
// These are declarations, not writes. The application's provisioning step
// persists each set once on a fresh installation and an administrator edits it
// afterwards, so this module stays the statement of what the jobs mean.
//
// A `grant` may only name a record selection its permission offers: the
// transition actions accept the write scopes, read actions accept every scope.
// `service.myTeamOrders` therefore carries the supervisor's dispatch right, and
// the seed puts the supervisor in both service teams.
// ---------------------------------------------------------------------------

/** One page grant per client page declared in `client/routes.ts`. */
function pageGrant(id: string): PermissionGrant {
  return { resource: { type: 'page', id }, actions: [{ action: 'access' }] };
}

const ALL_PAGE_IDS = [
  'service.overview',
  'service.customers',
  'service.devices',
  'service.workOrders',
  'service.repairNotes',
  'service.manuals',
  'service.inspections',
] as const;

const READ_ONLY_PAGE_IDS = [
  'service.customers',
  'service.devices',
  'service.workOrders',
  'service.repairNotes',
  'service.manuals',
  'service.inspections',
] as const;

/**
 * The service operations page: the scheduler's immediate-run surface.
 *
 * It is deliberately not part of `ALL_PAGE_IDS`: running a scheduled job is a
 * dispatch responsibility, so the page and the `runTask` permission that backs
 * it are granted to the supervisor alone.
 */
const OPERATIONS_PAGE_ID = 'service.operations' as const;

/**
 * Settings pages the supervisor's own duties need.
 *
 * These are plugin-owned settings pages, so their ids are fixed by those
 * plugins: the AI settings shell (`page:ai.settings`) is where a knowledge base
 * is maintained, and API keys (`page:api-keys`) is where the integration
 * account's credential is created and revoked. The Scheduler page declares its
 * own resource as `settings:scheduler.schedules` for navigation while its API
 * checks `page:scheduler.schedules`, so both are granted together.
 */
const supervisorSettingsGrants = [
  pageGrant('ai.settings'),
  pageGrant('api-keys'),
  pageGrant('scheduler.schedules'),
  {
    resource: { type: 'settings', id: 'scheduler.schedules' },
    actions: [{ action: 'access' as const }],
  },
] as const;

/** 主管: the whole board, dispatch rights, and the catalogue. */
export const supervisorPermissionSet = definePermissionSet(
  PERMISSION_SET_KEYS.supervisor,
)
  .title(title('service.permissionSet.supervisor'))
  .grant(
    ...ALL_PAGE_IDS.map(pageGrant),
    customerResource.reference().grant({
      view: { customerData: 'allRecords' },
      maintain: { customerData: 'allRecords' },
    }),
    deviceResource.reference().grant({
      view: { deviceData: 'allRecords' },
      maintain: { deviceData: 'allRecords' },
    }),
    workOrderResource.reference().grant({
      view: { workOrderData: 'allRecords' },
      create: { workOrderData: 'allRecords' },
      accept: { workOrderData: 'service.myTeamOrders' },
      process: { workOrderData: 'service.myTeamOrders' },
      submit: { workOrderData: 'service.myTeamOrders' },
      confirm: { workOrderData: 'service.myTeamOrders' },
      close: { workOrderData: 'service.myTeamOrders' },
      reopen: { workOrderData: 'service.myTeamOrders' },
      share: {
        workOrderData: 'service.myTeamOrders',
        shareData: 'allRecords',
      },
      attach: { attachmentData: 'allRecords' },
    }),
    repairNoteResource.reference().grant({
      view: { repairNoteData: 'allRecords' },
      publish: { repairNoteData: 'allRecords' },
    }),
    manualResource.reference().grant({
      view: { manualData: 'allRecords' },
      maintain: { manualData: 'allRecords' },
    }),
    inspectionResource.reference().grant({
      view: { inspectionData: 'allRecords' },
      complete: { inspectionData: 'allRecords' },
    }),
    reportResource.reference().grant({ view: { workOrderData: 'allRecords' } }),
    pageGrant(OPERATIONS_PAGE_ID),
    ...supervisorSettingsGrants,
    systemResource.reference().grant({
      runTask: { scheduledRunData: 'allRecords' },
    }),
  )
  .build();

/** 工程师: works the orders visible to them, and the devices assigned to them. */
export const engineerPermissionSet = definePermissionSet(
  PERMISSION_SET_KEYS.engineer,
)
  .title(title('service.permissionSet.engineer'))
  .grant(
    pageGrant('service.overview'),
    pageGrant('service.customers'),
    pageGrant('service.devices'),
    pageGrant('service.workOrders'),
    pageGrant('service.repairNotes'),
    pageGrant('service.manuals'),
    pageGrant('service.inspections'),
    customerResource.reference().grant({
      view: { customerData: 'allRecords' },
    }),
    deviceResource.reference().grant({
      view: { deviceData: 'service.myDevices' },
    }),
    workOrderResource.reference().grant({
      view: { workOrderData: 'service.orderVisibleToMe' },
      create: { workOrderData: 'allRecords' },
      accept: { workOrderData: 'service.orderVisibleToMe' },
      process: { workOrderData: 'service.assignedToMe' },
      submit: { workOrderData: 'service.assignedToMe' },
      share: {
        workOrderData: 'service.assignedToMe',
        shareData: 'allRecords',
      },
      attach: { attachmentData: 'service.orderAttachments' },
    }),
    repairNoteResource.reference().grant({
      view: { repairNoteData: 'service.publishedNotes' },
    }),
    manualResource.reference().grant({
      view: { manualData: 'service.availableManuals' },
    }),
    inspectionResource.reference().grant({
      view: { inspectionData: 'service.myInspectionTasks' },
      complete: { inspectionData: 'service.myInspectionTasks' },
    }),
    reportResource.reference().grant({
      view: { workOrderData: 'service.orderVisibleToMe' },
    }),
  )
  .build();

/** 只读观察员: everything readable, nothing writable. */
export const observerPermissionSet = definePermissionSet(
  PERMISSION_SET_KEYS.observer,
)
  .title(title('service.permissionSet.observer'))
  .grant(
    pageGrant('service.overview'),
    ...READ_ONLY_PAGE_IDS.map(pageGrant),
    customerResource.reference().grant({
      view: { customerData: 'allRecords' },
    }),
    deviceResource.reference().grant({
      view: { deviceData: 'allRecords' },
    }),
    workOrderResource.reference().grant({
      view: { workOrderData: 'service.nonConfidentialOrders' },
    }),
    repairNoteResource.reference().grant({
      view: { repairNoteData: 'service.publishedNotes' },
    }),
    manualResource.reference().grant({
      view: { manualData: 'service.availableManuals' },
    }),
    inspectionResource.reference().grant({
      view: { inspectionData: 'allRecords' },
    }),
    reportResource.reference().grant({ view: { workOrderData: 'allRecords' } }),
  )
  .build();

/**
 * 外部集成账号: no client page. It may report a machine fault and read back the
 * submissions it made, which is what the device platform needs and nothing more.
 */
export const integrationPermissionSet = definePermissionSet(
  PERMISSION_SET_KEYS.integration,
)
  .title(title('service.permissionSet.integration'))
  .grant(
    // The dedicated integration account signs in to create and revoke its own
    // key; that page is its only client surface, and it grants no business data.
    pageGrant('api-keys'),
    devicePlatformResource.reference().grant({
      submit: { workOrderData: 'allRecords' },
      read: { workOrderData: 'service.createdByMe' },
    }),
  )
  .build();

export const servicePermissionSets = [
  supervisorPermissionSet,
  engineerPermissionSet,
  observerPermissionSet,
  integrationPermissionSet,
] as const;
