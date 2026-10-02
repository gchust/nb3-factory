import { anyScope, condition } from '@nocobase/app-plugin-authorization/server';
import { defineRecordAccess } from '@nocobase/authorization/core';
import type { DatabaseConnection } from '@nocobase/db';

import { SERVICE_NS } from './constants.js';

/**
 * Membership expands to one `$eq` per identifier because the scope operator set has no `$in`. Only `condition` and
 * `anyScope` are public, so the expansion the built-in helper performs is written here from the same two primitives.
 */
function idsScope(field: string, ids: readonly (string | number)[]) {
  return anyScope(ids.map((id) => condition(field, '$eq', id)));
}

/**
 * Record access resolvers are evaluated per request and receive no database objects, so the connection they
 * need for team membership is bound once by the service authorization provider before any request is served.
 *
 * The connection is application-owned runtime state, not a second authorization mechanism: every resolver
 * still returns a plain row condition on the collection's own columns, which the database adapter validates.
 */
let serviceConnection: DatabaseConnection | undefined;

export function bindServiceRecordAccessConnection(
  connection: DatabaseConnection,
): void {
  serviceConnection = connection;
}

function requireConnection(): DatabaseConnection {
  if (!serviceConnection) {
    throw new Error(
      'Service authorization is not initialized: no database connection was bound.',
    );
  }
  return serviceConnection;
}

interface EngineerProfileRow {
  userId: string;
  groupId: number | null;
}

interface EquipmentRow {
  id: number | string;
  customerId: number | string;
  engineerId: string | null;
}

interface ShareRow {
  workOrderId: number | string;
}

interface ConfidentialRow {
  id: number | string;
}

/** The signed-in engineer and every engineer in the same group, starting with the engineer themself. */
async function sameGroupUserIds(userId: string): Promise<string[]> {
  const connection = requireConnection();
  const profiles = connection.repository<EngineerProfileRow>(
    'serviceEngineerProfiles',
  );
  const mine = await profiles.findOne({
    filter: (filter) => filter.string('userId').eq(userId),
    select: (select) => select.fields('userId', 'groupId'),
  });
  const userIds = new Set<string>([userId]);
  const groupId = mine?.groupId;
  if (groupId === undefined || groupId === null) return [...userIds];
  const peers = await profiles.findMany({
    filter: (filter) => filter.number('groupId').eq(groupId),
    select: (select) => select.fields('userId'),
  });
  for (const peer of peers) {
    if (typeof peer.userId === 'string' && peer.userId)
      userIds.add(peer.userId);
  }
  return [...userIds];
}

async function equipmentOfEngineers(
  userIds: readonly string[],
): Promise<EquipmentRow[]> {
  if (userIds.length === 0) return [];
  const connection = requireConnection();
  return connection.repository<EquipmentRow>('serviceEquipment').findMany({
    filter: (filter) =>
      filter.or(userIds.map((id) => filter.string('engineerId').eq(id))),
    select: (select) => select.fields('id', 'customerId', 'engineerId'),
  });
}

async function sharedWorkOrderIds(userId: string): Promise<number[]> {
  const connection = requireConnection();
  const shares = await connection
    .repository<ShareRow>('serviceWorkOrderShares')
    .findMany({
      filter: (filter) =>
        filter.and([
          filter.string('engineerId').eq(userId),
          filter.date('revokedAt').empty(),
        ]),
      select: (select) => select.fields('workOrderId'),
    });
  // `id` is an integer column, so the scope value must be numeric; a string id is rejected by the repository.
  const ids = shares
    .map((share) => Number(share.workOrderId))
    .filter((id) => Number.isFinite(id));
  if (ids.length === 0) return [];
  // A share never grants access to a confidential work order. New shares of confidential orders are refused in
  // the service; filtering here keeps an already-stored share from opening one after the fact.
  const visible = await connection
    .repository<ConfidentialRow>('serviceWorkOrders')
    .findMany({
      filter: (filter) =>
        filter.and([
          filter.or(ids.map((id) => filter.number('id').eq(id))),
          filter.boolean('confidential').isFalse(),
        ]),
      select: (select) => select.fields('id'),
    });
  return visible.map((row) => Number(row.id));
}

/** Unrestricted rows. Held by the supervisor; the record-access baseline the other scopes narrow. */
const allRecordsAccess = defineRecordAccess('service.allRecords', (access) =>
  access
    .title({ key: 'service.recordAccess.allRecords', ns: SERVICE_NS })
    .collections('*')
    .resolver(() => true),
);

/** Rows whose assignee column names the signed-in user. */
const assignedToMeAccess = defineRecordAccess(
  'service.assignedToMe',
  (access) =>
    access
      .title({ key: 'service.recordAccess.assignedToMe', ns: SERVICE_NS })
      .collections('serviceWorkOrders', 'serviceInspections')
      .resolver(({ principal }) =>
        condition('assigneeId', '$eq', principal.id),
      ),
);

/** Rows the signed-in user created. */
const createdByMeAccess = defineRecordAccess('service.createdByMe', (access) =>
  access
    .title({ key: 'service.recordAccess.createdByMe', ns: SERVICE_NS })
    .collections(
      'serviceWorkOrders',
      'serviceRepairKnowledge',
      'serviceManuals',
      'serviceInspections',
    )
    .resolver(({ principal }) => condition('createdById', '$eq', principal.id)),
);

/** Equipment whose responsible engineer is in the signed-in engineer's group. */
const equipmentSameGroupAccess = defineRecordAccess(
  'service.equipmentSameGroup',
  (access) =>
    access
      .title({ key: 'service.recordAccess.sameGroupEquipment', ns: SERVICE_NS })
      .collections('serviceEquipment')
      .resolver(async ({ principal }) =>
        idsScope('engineerId', await sameGroupUserIds(principal.id)),
      ),
);

/** Inspections assigned to an engineer in the signed-in engineer's group. */
const inspectionsSameGroupAccess = defineRecordAccess(
  'service.inspectionsSameGroup',
  (access) =>
    access
      .title({
        key: 'service.recordAccess.sameGroupInspections',
        ns: SERVICE_NS,
      })
      .collections('serviceInspections')
      .resolver(async ({ principal }) => {
        const group = await sameGroupUserIds(principal.id);
        return idsScope(
          'assigneeId',
          group.filter((id) => id !== principal.id),
        );
      }),
);

/** Work orders an engineer is collaborating on through a still-open share. */
const sharedWithMeAccess = defineRecordAccess(
  'service.sharedWithMe',
  (access) =>
    access
      .title({ key: 'service.recordAccess.sharedWithMe', ns: SERVICE_NS })
      .collections('serviceWorkOrders')
      .resolver(async ({ principal }) =>
        idsScope('id', await sharedWorkOrderIds(principal.id)),
      ),
);

/** Everything an engineer may reach on the work-order board. */
const workOrdersForEngineerAccess = defineRecordAccess(
  'service.workOrdersForEngineer',
  (access) =>
    access
      .title({
        key: 'service.recordAccess.workOrdersForEngineer',
        ns: SERVICE_NS,
      })
      .collections('serviceWorkOrders')
      .resolver(async ({ principal }) => {
        // Group membership is for dispatch and workload view only: an engineer reads the work orders assigned
        // to them, ones they created, and the ordinary orders shared with them — never a peer's, and never a
        // confidential order through a share.
        const sharedIds = await sharedWorkOrderIds(principal.id);
        return anyScope([
          condition('assigneeId', '$eq', principal.id),
          condition('createdById', '$eq', principal.id),
          ...(sharedIds.length > 0 ? [idsScope('id', sharedIds)] : []),
        ]);
      }),
);

/** Customers that own equipment the signed-in engineer is responsible for. */
const customersForEngineerAccess = defineRecordAccess(
  'service.customersForEngineer',
  (access) =>
    access
      .title({
        key: 'service.recordAccess.customersForEngineer',
        ns: SERVICE_NS,
      })
      .collections('serviceCustomers')
      .resolver(async ({ principal }) => {
        const equipment = await equipmentOfEngineers(
          await sameGroupUserIds(principal.id),
        );
        // `id` is an integer column; the scope values must be numeric for the repository to accept them.
        return idsScope(
          'id',
          equipment.map((row) => Number(row.customerId)),
        );
      }),
);

/** Equipment the signed-in external contact owns, read from the principal's own attributes. */
const equipmentByCustomerAccess = defineRecordAccess(
  'service.equipmentByCustomer',
  (access) =>
    access
      .title({
        key: 'service.recordAccess.equipmentByCustomer',
        ns: SERVICE_NS,
      })
      .collections('serviceEquipment')
      .resolver(({ principal }) => {
        const customerId = principal.attributes?.customerId;
        const numeric =
          typeof customerId === 'number' ? customerId : Number(customerId);
        if (typeof customerId !== 'string' && typeof customerId !== 'number') {
          return false;
        }
        if (!Number.isFinite(numeric)) return false;
        // `customerId` is an integer column, so the scope value must be numeric.
        return condition('customerId', '$eq', numeric);
      }),
);

/** Work orders that carry no confidentiality flag. Narrowing rule for observers. */
const nonConfidentialWorkOrdersAccess = defineRecordAccess(
  'service.nonConfidentialWorkOrders',
  (access) =>
    access
      .title({ key: 'service.recordAccess.nonConfidential', ns: SERVICE_NS })
      .collections('serviceWorkOrders')
      .resolver(() => condition('confidential', '$isFalsy')),
);

/** Knowledge entries that have been published. */
const publishedKnowledgeAccess = defineRecordAccess(
  'service.publishedKnowledge',
  (access) =>
    access
      .title({ key: 'service.recordAccess.publishedKnowledge', ns: SERVICE_NS })
      .collections('serviceRepairKnowledge')
      .resolver(() => condition('published', '$isTruly')),
);

/** Manuals that have been published. */
const publishedManualsAccess = defineRecordAccess(
  'service.publishedManuals',
  (access) =>
    access
      .title({ key: 'service.recordAccess.publishedManuals', ns: SERVICE_NS })
      .collections('serviceManuals')
      .resolver(() => condition('published', '$isTruly')),
);

/** Manuals attached to equipment the signed-in engineer is responsible for. */
const manualsForEngineerAccess = defineRecordAccess(
  'service.manualsForEngineer',
  (access) =>
    access
      .title({ key: 'service.recordAccess.manualsForEngineer', ns: SERVICE_NS })
      .collections('serviceManuals')
      .resolver(async ({ principal }) => {
        const equipment = await equipmentOfEngineers(
          await sameGroupUserIds(principal.id),
        );
        return idsScope(
          'equipmentId',
          equipment.map((row) => Number(row.id)),
        );
      }),
);

/** Every record access the application owns, registered by the service authorization provider. */
export const serviceRecordAccessBuilders = [
  allRecordsAccess,
  assignedToMeAccess,
  createdByMeAccess,
  equipmentSameGroupAccess,
  inspectionsSameGroupAccess,
  sharedWithMeAccess,
  workOrdersForEngineerAccess,
  customersForEngineerAccess,
  equipmentByCustomerAccess,
  nonConfidentialWorkOrdersAccess,
  publishedKnowledgeAccess,
  publishedManualsAccess,
  manualsForEngineerAccess,
] as const;

/** The same definitions as references, keyed by name, for composite data-scope options and rules. */
export const serviceRecordAccess = {
  allRecords: allRecordsAccess.reference(),
  assignedToMe: assignedToMeAccess.reference(),
  createdByMe: createdByMeAccess.reference(),
  equipmentSameGroup: equipmentSameGroupAccess.reference(),
  inspectionsSameGroup: inspectionsSameGroupAccess.reference(),
  sharedWithMe: sharedWithMeAccess.reference(),
  workOrdersForEngineer: workOrdersForEngineerAccess.reference(),
  customersForEngineer: customersForEngineerAccess.reference(),
  equipmentByCustomer: equipmentByCustomerAccess.reference(),
  nonConfidentialWorkOrders: nonConfidentialWorkOrdersAccess.reference(),
  publishedKnowledge: publishedKnowledgeAccess.reference(),
  publishedManuals: publishedManualsAccess.reference(),
  manualsForEngineer: manualsForEngineerAccess.reference(),
} as const;
