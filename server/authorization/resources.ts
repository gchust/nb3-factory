import { defineCompositeResource } from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';

import {
  orderAll,
  orderAssigned,
  orderAssignedOrShared,
  orderObserver,
  orderShared,
  knowledgePublished,
  shareGranted,
} from './record-access.ts';

/**
 * Portable declarations for the after-sales service permission model.
 *
 * Nothing here registers or grants anything: the builders are values the owning
 * provider registers at boot and the seed reuses through `.reference()`.
 */

const ORDER_READ_SUMMARY = [
  'id',
  'orderNo',
  'title',
  'status',
  'priority',
  'dueAt',
  'createdAt',
  'updatedAt',
  'customerId',
  'deviceId',
  'assigneeId',
  'groupId',
  'confidential',
  'observerVisible',
  'acceptedAt',
  'processingAt',
  'submittedAt',
  'closedAt',
  'source',
] as const;

const ORDER_CREATE_FIELDS = [
  'orderNo',
  'title',
  'customerId',
  'deviceId',
  'description',
  'priority',
  'dueAt',
  'assigneeId',
  'groupId',
  'confidential',
  'status',
  'source',
  'observerVisible',
  'createdById',
  'externalEventId',
  'createdAt',
  'updatedAt',
] as const;

const ORDER_PROCESS_FIELDS = [
  'status',
  'acceptanceNote',
  'resolution',
  'returnReason',
  'acceptedAt',
  'processingAt',
  'submittedAt',
  'closedAt',
  'updatedAt',
] as const;

const ORDER_ASSIGN_FIELDS = [
  'assigneeId',
  'groupId',
  'dueAt',
  'priority',
  'observerVisible',
  'updatedAt',
] as const;

// Closing and returning are the two outcomes of the customer-confirmation step,
// so the same `confirm` action writes either one: `closedAt` for a close and
// `returnReason` for a return. The list is what the permission store calls
// `allowedFields`, and a field missing here makes the return path a 403.
const ORDER_CONFIRM_FIELDS = [
  'status',
  'closedAt',
  'returnReason',
  'updatedAt',
] as const;

// --- Collection permissions -------------------------------------------------

const orderView = defineDatabasePermission((permission) =>
  permission
    .collection('service_orders')
    .read('*')
    .options(
      orderAll,
      orderAssigned,
      orderAssignedOrShared,
      orderShared,
      orderObserver,
    )
    .default(orderAll),
);

const orderViewSummary = defineDatabasePermission((permission) =>
  permission
    .collection('service_orders')
    .read(ORDER_READ_SUMMARY)
    .options(orderObserver, orderAssigned, orderAssignedOrShared, orderAll)
    .default(orderObserver),
);

const orderCreate = defineDatabasePermission((permission) =>
  permission
    .collection('service_orders')
    .read('*')
    .create(ORDER_CREATE_FIELDS)
    .options(orderAll, orderAssigned, orderShared, orderObserver)
    .default(orderAll),
);

const orderProcess = defineDatabasePermission((permission) =>
  permission
    .collection('service_orders')
    .read('*')
    .update(ORDER_PROCESS_FIELDS)
    .options(orderAll, orderAssigned, orderShared, orderObserver)
    .default(orderAll),
);

const orderConfirm = defineDatabasePermission((permission) =>
  permission
    .collection('service_orders')
    .read('*')
    .update(ORDER_CONFIRM_FIELDS)
    .options(orderAll, orderAssigned, orderShared, orderObserver)
    .default(orderAll),
);

const orderAssign = defineDatabasePermission((permission) =>
  permission
    .collection('service_orders')
    .read('*')
    .update(ORDER_ASSIGN_FIELDS)
    .options(orderAll, orderAssigned, orderShared, orderObserver)
    .default(orderAll),
);

const deviceRead = defineDatabasePermission((permission) =>
  permission
    .collection('devices')
    .read('*')
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords),
);

const deviceManage = defineDatabasePermission((permission) =>
  permission
    .collection('devices')
    .read('*')
    .create([
      'code',
      'name',
      'model',
      'customerId',
      'engineerId',
      'groupId',
      'enabled',
      'nextInspectionDate',
      'createdAt',
      'updatedAt',
    ])
    .update([
      'code',
      'name',
      'model',
      'customerId',
      'engineerId',
      'groupId',
      'enabled',
      'nextInspectionDate',
      'updatedAt',
    ])
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords),
);

const customerRead = defineDatabasePermission((permission) =>
  permission
    .collection('customers')
    .read('*')
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords),
);

const customerManage = defineDatabasePermission((permission) =>
  permission
    .collection('customers')
    .read('*')
    .create([
      'name',
      'contactName',
      'contactPhone',
      'address',
      'remark',
      'createdAt',
      'updatedAt',
    ])
    .update([
      'name',
      'contactName',
      'contactPhone',
      'address',
      'remark',
      'updatedAt',
    ])
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords),
);

const groupRead = defineDatabasePermission((permission) =>
  permission
    .collection('service_groups')
    .read('*')
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords),
);

const groupManage = defineDatabasePermission((permission) =>
  permission
    .collection('service_groups')
    .read('*')
    .create(['code', 'name', 'description', 'createdAt', 'updatedAt'])
    .update(['name', 'description', 'updatedAt'])
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords),
);

const shareList = defineDatabasePermission((permission) =>
  permission
    .collection('service_order_shares')
    .read('*')
    .options(recordAccess.allRecords, shareGranted)
    .default(recordAccess.allRecords),
);

const shareManage = defineDatabasePermission((permission) =>
  permission
    .collection('service_order_shares')
    .read('*')
    .create([
      'orderId',
      'engineerId',
      'grantedById',
      'note',
      'expiresAt',
      'revokedAt',
      'createdAt',
      'updatedAt',
    ])
    .update(['note', 'expiresAt', 'revokedAt', 'updatedAt'])
    .delete()
    .options(recordAccess.allRecords, shareGranted)
    .default(recordAccess.allRecords),
);

const knowledgeView = defineDatabasePermission((permission) =>
  permission
    .collection('repair_knowledge')
    .read('*')
    .options(knowledgePublished, recordAccess.allRecords)
    .default(knowledgePublished),
);

const knowledgeManage = defineDatabasePermission((permission) =>
  permission
    .collection('repair_knowledge')
    .read('*')
    .create([
      'title',
      'content',
      'category',
      'status',
      'authorId',
      'publishedAt',
      'createdAt',
      'updatedAt',
    ])
    .update([
      'title',
      'content',
      'category',
      'status',
      'publishedAt',
      'updatedAt',
    ])
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords),
);

const inspectionView = defineDatabasePermission((permission) =>
  permission
    .collection('service_inspections')
    .read('*')
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords),
);

const inspectionComplete = defineDatabasePermission((permission) =>
  permission
    .collection('service_inspections')
    .read('*')
    .create([
      'deviceId',
      'assigneeId',
      'plannedDate',
      'status',
      'result',
      'resultCode',
      'completedAt',
      'source',
      'idempotencyKey',
      'createdAt',
      'updatedAt',
    ])
    .update([
      'status',
      'result',
      'resultCode',
      'completedAt',
      'assigneeId',
      'updatedAt',
    ])
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords),
);

const manualView = defineDatabasePermission((permission) =>
  permission
    .collection('device_manuals')
    .read('*')
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords),
);

const manualManage = defineDatabasePermission((permission) =>
  permission
    .collection('device_manuals')
    .read('*')
    .create([
      'title',
      'fileName',
      'content',
      'deviceId',
      'status',
      'failureReason',
      'aiDocumentId',
      'uploadedById',
      'createdAt',
      'updatedAt',
    ])
    .update([
      'title',
      'fileName',
      'content',
      'deviceId',
      'status',
      'failureReason',
      'aiDocumentId',
      'updatedAt',
    ])
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords),
);

// --- Composites -------------------------------------------------------------

export const serviceOrdersResource = defineCompositeResource(
  'service.orders',
  (resource) =>
    resource
      .title('Service orders')
      .action('view', (action) =>
        action
          .title('View service orders')
          .grant('orders', orderView, { title: 'Orders' })
          .grant('devices', deviceRead, { title: 'Devices' })
          .grant('customers', customerRead, { title: 'Customers' })
          .grant('groups', groupRead, { title: 'Groups' }),
      )
      .action('viewSummary', (action) =>
        action
          .title('View order summaries')
          .grant('orders', orderViewSummary, { title: 'Order summaries' })
          .grant('devices', deviceRead, { title: 'Devices' })
          .grant('customers', customerRead, { title: 'Customers' }),
      )
      .action('create', (action) =>
        action
          .title('Create service orders')
          .grant('orders', orderCreate, { title: 'Orders' })
          .grant('devices', deviceRead, { title: 'Devices' })
          .grant('customers', customerRead, { title: 'Customers' }),
      )
      .action('process', (action) =>
        action
          .title('Process service orders')
          .grant('orders', orderProcess, { title: 'Orders' })
          .grant('devices', deviceRead, { title: 'Devices' }),
      )
      .action('assign', (action) =>
        action
          .title('Assign service orders')
          .grant('orders', orderAssign, { title: 'Orders' })
          .grant('devices', deviceRead, { title: 'Devices' })
          .grant('customers', customerRead, { title: 'Customers' })
          .grant('groups', groupRead, { title: 'Groups' }),
      )
      .action('confirm', (action) =>
        action
          .title('Confirm service orders')
          .grant('orders', orderConfirm, { title: 'Orders' }),
      )
      .action('share', (action) =>
        action
          .title('Share service orders')
          .grant('orders', orderView, { title: 'Orders' })
          .grant('shares', shareManage, { title: 'Shares' }),
      )
      .action('viewShares', (action) =>
        action
          .title('View order shares')
          .grant('shares', shareList, { title: 'Shares' }),
      ),
);

export const serviceLedgerResource = defineCompositeResource(
  'service.ledger',
  (resource) =>
    resource
      .title('Customers and devices')
      .action('view', (action) =>
        action
          .title('View customers and devices')
          .grant('devices', deviceRead, { title: 'Devices' })
          .grant('customers', customerRead, { title: 'Customers' })
          .grant('groups', groupRead, { title: 'Groups' }),
      )
      .action('manage', (action) =>
        action
          .title('Manage customers and devices')
          .grant('devices', deviceManage, { title: 'Devices' })
          .grant('customers', customerManage, { title: 'Customers' })
          .grant('groups', groupManage, { title: 'Groups' }),
      ),
);

export const serviceKnowledgeResource = defineCompositeResource(
  'service.knowledge',
  (resource) =>
    resource
      .title('Repair knowledge')
      .action('view', (action) =>
        action
          .title('View repair knowledge')
          .grant('knowledge', knowledgeView, { title: 'Knowledge' }),
      )
      .action('manage', (action) =>
        action
          .title('Manage repair knowledge')
          .grant('knowledge', knowledgeManage, { title: 'Knowledge' }),
      ),
);

export const serviceInspectionsResource = defineCompositeResource(
  'service.inspections',
  (resource) =>
    resource
      .title('Inspections')
      .action('view', (action) =>
        action
          .title('View inspections')
          .grant('inspections', inspectionView, { title: 'Inspections' })
          .grant('devices', deviceRead, { title: 'Devices' }),
      )
      .action('complete', (action) =>
        action
          .title('Complete inspections')
          .grant('inspections', inspectionComplete, { title: 'Inspections' })
          .grant('devices', deviceRead, { title: 'Devices' }),
      ),
);

export const serviceManualsResource = defineCompositeResource(
  'service.manuals',
  (resource) =>
    resource
      .title('Device manuals')
      .action('view', (action) =>
        action
          .title('View device manuals')
          .grant('manuals', manualView, { title: 'Manuals' }),
      )
      .action('manage', (action) =>
        action
          .title('Manage device manuals')
          .grant('manuals', manualManage, { title: 'Manuals' })
          .grant('devices', deviceRead, { title: 'Devices' }),
      ),
);

export const serviceDashboardResource = defineCompositeResource(
  'service.dashboard',
  (resource) =>
    resource
      .title('Service dashboard')
      .action('view', (action) =>
        action
          .title('View the service dashboard')
          .grant('orders', orderViewSummary, { title: 'Orders' })
          .grant('devices', deviceRead, { title: 'Devices' })
          .grant('inspections', inspectionView, { title: 'Inspections' }),
      ),
);

export const serviceIntegrationResource = defineCompositeResource(
  'service.integration',
  (resource) =>
    resource
      .title('Device platform integration')
      .action('submit', (action) =>
        action
          .title('Submit a platform event')
          .grant('orders', orderCreate, { title: 'Orders' })
          .grant('devices', deviceRead, { title: 'Devices' })
          .grant('customers', customerRead, { title: 'Customers' }),
      ),
);

export const serviceResources = [
  serviceOrdersResource,
  serviceLedgerResource,
  serviceKnowledgeResource,
  serviceInspectionsResource,
  serviceManualsResource,
  serviceDashboardResource,
  serviceIntegrationResource,
] as const;

export const serviceResourceReferences = {
  orders: serviceOrdersResource.reference(),
  ledger: serviceLedgerResource.reference(),
  knowledge: serviceKnowledgeResource.reference(),
  inspections: serviceInspectionsResource.reference(),
  manuals: serviceManualsResource.reference(),
  dashboard: serviceDashboardResource.reference(),
  integration: serviceIntegrationResource.reference(),
} as const;

/** Page ids used by the client route `authz` declarations. */
export const servicePageIds = [
  'service.dashboard',
  'service.orders',
  'service.customers',
  'service.devices',
  'service.knowledge',
  'service.inspections',
  'service.manuals',
  'service.integrationKeys',
] as const;
