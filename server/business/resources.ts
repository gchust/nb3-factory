import { defineCompositeResource } from '@nocobase/authorization/core';
import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';

// Portable declarations of what the after-sales service domain supports. This module must stay free of database
// queries and application services so a seed or a provisioning routine can import it. Nothing here registers or
// grants anything: `registerServiceResources` in ./register.ts performs registration at application boot.

export interface CustomerRow {
  id: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceRow {
  id: string;
  code: string;
  name: string;
  customerId: string;
  serviceEngineerId: string | null;
  enabled: boolean;
  nextInspectionAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkOrderRow {
  id: string;
  code: string;
  title: string;
  customerId: string;
  deviceId: string;
  problem: string;
  priority: string;
  status: string;
  dueAt: Date | null;
  assigneeId: string | null;
  confidential: boolean;
  acceptanceNote: string | null;
  resolution: string | null;
  rejectionReason: string | null;
  acceptedAt: Date | null;
  startedAt: Date | null;
  submittedAt: Date | null;
  closedAt: Date | null;
  submitCount: number;
  createdById: string | null;
  source: string;
  externalEventNo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkOrderEventRow {
  id: string;
  workOrderId: string;
  type: string;
  actorId: string | null;
  note: string | null;
  data: unknown;
  createdAt: Date;
}

export interface WorkOrderAttachmentRow {
  id: string;
  workOrderId: string;
  fileId: string;
  category: string;
  createdAt: Date;
}

export interface WorkOrderFileRow {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkOrderShareRow {
  id: string;
  workOrderId: string;
  engineerId: string;
  sharedById: string;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InspectionRow {
  id: string;
  deviceId: string;
  plannedDate: string;
  assigneeId: string | null;
  status: string;
  result: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeArticleRow {
  id: string;
  title: string;
  body: string;
  published: boolean;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceManualRow {
  id: string;
  title: string;
  filename: string | null;
  content: string | null;
  status: string;
  failureReason: string | null;
  knowledgeBaseKey: string | null;
  documentId: string | null;
  uploadedById: string | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceIntegrationEventRow {
  id: string;
  eventNo: string;
  payload: unknown;
  workOrderId: string | null;
  createdAt: Date;
}

const TIMESTAMPS = ['createdAt', 'updatedAt'] as const;

const workOrderRead = defineDatabasePermission((permission) =>
  permission
    .collection<WorkOrderRow>('workOrders')
    .read([
      'id',
      'code',
      'title',
      'customerId',
      'deviceId',
      'problem',
      'priority',
      'status',
      'dueAt',
      'assigneeId',
      'confidential',
      'acceptanceNote',
      'resolution',
      'rejectionReason',
      'acceptedAt',
      'startedAt',
      'submittedAt',
      'closedAt',
      'submitCount',
      'createdById',
      'source',
      'externalEventNo',
      ...TIMESTAMPS,
    ]),
);

const workOrderCreate = workOrderRead.create([
  'id',
  'code',
  'title',
  'customerId',
  'deviceId',
  'problem',
  'priority',
  'status',
  'dueAt',
  'assigneeId',
  'confidential',
  'createdById',
  'source',
  ...TIMESTAMPS,
]);

const workOrderEdit = workOrderRead.update([
  'title',
  'problem',
  'priority',
  'dueAt',
  'assigneeId',
  'confidential',
  'updatedAt',
]);

const workOrderAccept = workOrderRead.update([
  'status',
  'assigneeId',
  'acceptanceNote',
  'acceptedAt',
  'updatedAt',
]);

const workOrderStart = workOrderRead.update([
  'status',
  'startedAt',
  'updatedAt',
]);

const workOrderSubmit = workOrderRead.update([
  'status',
  'resolution',
  'submittedAt',
  'submitCount',
  'updatedAt',
]);

const workOrderReject = workOrderRead.update([
  'status',
  'rejectionReason',
  'updatedAt',
]);

const workOrderClose = workOrderRead.update([
  'status',
  'closedAt',
  'updatedAt',
]);

const workOrderEventRead = defineDatabasePermission((permission) =>
  permission
    .collection<WorkOrderEventRow>('workOrderEvents')
    .read([
      'id',
      'workOrderId',
      'type',
      'actorId',
      'note',
      'data',
      'createdAt',
    ]),
);

const workOrderEventCreate = workOrderEventRead.create([
  'id',
  'workOrderId',
  'type',
  'actorId',
  'note',
  'data',
  'createdAt',
]);

const workOrderAttachmentRead = defineDatabasePermission((permission) =>
  permission
    .collection<WorkOrderAttachmentRow>('workOrderAttachments')
    .read(['id', 'workOrderId', 'fileId', 'category', 'createdAt']),
);

const workOrderAttachmentWrite = workOrderAttachmentRead
  .create(['id', 'workOrderId', 'fileId', 'category', 'createdAt'])
  .delete();

const workOrderFileRead = defineDatabasePermission((permission) =>
  permission
    .collection<WorkOrderFileRow>('workOrderFiles')
    .read(['id', 'filename', 'ext', 'mimeType', 'size', ...TIMESTAMPS]),
);

const workOrderFileWrite = workOrderFileRead
  .create([
    'id',
    'disk',
    'key',
    'filename',
    'ext',
    'mimeType',
    'size',
    ...TIMESTAMPS,
  ])
  .delete();

const workOrderShareRead = defineDatabasePermission((permission) =>
  permission
    .collection<WorkOrderShareRow>('workOrderShares')
    .read([
      'id',
      'workOrderId',
      'engineerId',
      'sharedById',
      'revokedAt',
      ...TIMESTAMPS,
    ]),
);

const workOrderShareWrite = workOrderShareRead
  .create(['id', 'workOrderId', 'engineerId', 'sharedById', ...TIMESTAMPS])
  .update(['revokedAt', 'updatedAt'])
  .delete();

const customerRead = defineDatabasePermission((permission) =>
  permission
    .collection<CustomerRow>('customers')
    .read([
      'id',
      'name',
      'contactName',
      'contactPhone',
      'notes',
      ...TIMESTAMPS,
    ]),
);

const customerWrite = customerRead
  .create(['id', 'name', 'contactName', 'contactPhone', 'notes', ...TIMESTAMPS])
  .update(['name', 'contactName', 'contactPhone', 'notes', 'updatedAt'])
  .delete();

const deviceRead = defineDatabasePermission((permission) =>
  permission
    .collection<DeviceRow>('devices')
    .read([
      'id',
      'code',
      'name',
      'customerId',
      'serviceEngineerId',
      'enabled',
      'nextInspectionAt',
      'notes',
      ...TIMESTAMPS,
    ]),
);

const deviceWrite = deviceRead
  .create([
    'id',
    'code',
    'name',
    'customerId',
    'serviceEngineerId',
    'enabled',
    'nextInspectionAt',
    'notes',
    ...TIMESTAMPS,
  ])
  .update([
    'code',
    'name',
    'customerId',
    'serviceEngineerId',
    'enabled',
    'nextInspectionAt',
    'notes',
    'updatedAt',
  ])
  .delete();

const inspectionRead = defineDatabasePermission((permission) =>
  permission
    .collection<InspectionRow>('inspections')
    .read([
      'id',
      'deviceId',
      'plannedDate',
      'assigneeId',
      'status',
      'result',
      'completedAt',
      ...TIMESTAMPS,
    ]),
);

const inspectionWrite = inspectionRead
  .create([
    'id',
    'deviceId',
    'plannedDate',
    'assigneeId',
    'status',
    'result',
    'completedAt',
    ...TIMESTAMPS,
  ])
  .update(['assigneeId', 'status', 'result', 'completedAt', 'updatedAt'])
  .delete();

const knowledgeRead = defineDatabasePermission((permission) =>
  permission
    .collection<KnowledgeArticleRow>('knowledgeArticles')
    .read(['id', 'title', 'body', 'published', 'createdById', ...TIMESTAMPS]),
);

const knowledgeWrite = knowledgeRead
  .create(['id', 'title', 'body', 'published', 'createdById', ...TIMESTAMPS])
  .update(['title', 'body', 'published', 'updatedAt'])
  .delete();

const manualRead = defineDatabasePermission((permission) =>
  permission
    .collection<DeviceManualRow>('deviceManuals')
    .read([
      'id',
      'title',
      'filename',
      'content',
      'status',
      'failureReason',
      'knowledgeBaseKey',
      'documentId',
      'uploadedById',
      'processedAt',
      ...TIMESTAMPS,
    ]),
);

const manualWrite = manualRead
  .create([
    'id',
    'title',
    'filename',
    'content',
    'status',
    'failureReason',
    'knowledgeBaseKey',
    'documentId',
    'uploadedById',
    'processedAt',
    ...TIMESTAMPS,
  ])
  .update([
    'title',
    'filename',
    'content',
    'status',
    'failureReason',
    'knowledgeBaseKey',
    'documentId',
    'processedAt',
    'updatedAt',
  ])
  .delete();

const integrationEventRead = defineDatabasePermission((permission) =>
  permission
    .collection<DeviceIntegrationEventRow>('deviceIntegrationEvents')
    .read(['id', 'eventNo', 'payload', 'workOrderId', 'createdAt']),
);

const integrationEventWrite = integrationEventRead.create([
  'id',
  'eventNo',
  'payload',
  'workOrderId',
  'createdAt',
]);

// The record access keys are declared in ./record-access.ts. They appear here only as allowed choices, and a grant
// stores the key rather than a resolver.
const ALL = 'service.all';
const ASSIGNED = 'service.assigned';
const VISIBLE = 'service.visible';
const SHARED = 'service.sharedToMe';

export const workOrders = defineCompositeResource(
  'service.workOrders',
  (resource) =>
    resource
      .title({ key: 'service.resources.workOrders', ns: 'service' })
      .action('view', (action) =>
        action
          .title({ key: 'service.actions.view', ns: 'service' })
          .grant('workOrders', workOrderRead)
          .grant('events', workOrderEventRead)
          .grant('attachments', workOrderAttachmentRead)
          .grant('files', workOrderFileRead)
          .grant('customers', customerRead)
          .grant('devices', deviceRead)
          .grant('shares', workOrderShareRead),
      )
      .action('create', (action) =>
        action
          .title({ key: 'service.actions.create', ns: 'service' })
          .grant('workOrders', workOrderCreate)
          .grant('events', workOrderEventCreate)
          .grant('customers', customerRead)
          .grant('devices', deviceRead),
      )
      .action('edit', (action) =>
        action
          .title({ key: 'service.actions.edit', ns: 'service' })
          .grant('workOrders', workOrderEdit)
          .grant('events', workOrderEventCreate),
      )
      .action('accept', (action) =>
        action
          .title({ key: 'service.actions.accept', ns: 'service' })
          .grant('workOrders', workOrderAccept)
          .grant('events', workOrderEventCreate),
      )
      .action('start', (action) =>
        action
          .title({ key: 'service.actions.start', ns: 'service' })
          .grant('workOrders', workOrderStart)
          .grant('events', workOrderEventCreate),
      )
      .action('submit', (action) =>
        action
          .title({ key: 'service.actions.submit', ns: 'service' })
          .grant('workOrders', workOrderSubmit)
          .grant('events', workOrderEventCreate),
      )
      .action('reject', (action) =>
        action
          .title({ key: 'service.actions.reject', ns: 'service' })
          .grant('workOrders', workOrderReject)
          .grant('events', workOrderEventCreate),
      )
      .action('close', (action) =>
        action
          .title({ key: 'service.actions.close', ns: 'service' })
          .grant('workOrders', workOrderClose)
          .grant('events', workOrderEventCreate),
      )
      .action('attach', (action) =>
        action
          .title({ key: 'service.actions.attach', ns: 'service' })
          .grant('workOrders', workOrderRead)
          .grant('attachments', workOrderAttachmentWrite)
          .grant('files', workOrderFileWrite),
      )
      .action('share', (action) =>
        action
          .title({ key: 'service.actions.share', ns: 'service' })
          .grant('workOrders', workOrderRead)
          .grant('shares', workOrderShareWrite),
      ),
);

export const customers = defineCompositeResource(
  'service.customers',
  (resource) =>
    resource
      .title({ key: 'service.resources.customers', ns: 'service' })
      .action('view', (action) => action.grant('customers', customerRead))
      .action('manage', (action) => action.grant('customers', customerWrite)),
);

export const devices = defineCompositeResource('service.devices', (resource) =>
  resource
    .title({ key: 'service.resources.devices', ns: 'service' })
    .action('view', (action) => action.grant('devices', deviceRead))
    .action('manage', (action) => action.grant('devices', deviceWrite)),
);

export const inspections = defineCompositeResource(
  'service.inspections',
  (resource) =>
    resource
      .title({ key: 'service.resources.inspections', ns: 'service' })
      .action('view', (action) => action.grant('inspections', inspectionRead))
      .action('complete', (action) =>
        action.grant('inspections', inspectionWrite),
      )
      .action('manage', (action) =>
        action.grant('inspections', inspectionWrite),
      ),
);

export const knowledge = defineCompositeResource(
  'service.knowledge',
  (resource) =>
    resource
      .title({ key: 'service.resources.knowledge', ns: 'service' })
      .action('view', (action) => action.grant('articles', knowledgeRead))
      .action('manage', (action) => action.grant('articles', knowledgeWrite)),
);

export const manuals = defineCompositeResource('service.manuals', (resource) =>
  resource
    .title({ key: 'service.resources.manuals', ns: 'service' })
    .action('view', (action) => action.grant('manuals', manualRead))
    .action('manage', (action) => action.grant('manuals', manualWrite)),
);

export const external = defineCompositeResource(
  'service.external',
  (resource) =>
    resource
      .title({ key: 'service.resources.external', ns: 'service' })
      .action('submitFault', (action) =>
        action
          .grant('workOrders', workOrderCreate)
          .grant('events', workOrderEventCreate)
          .grant('integrationEvents', integrationEventWrite)
          .grant('customers', customerRead)
          .grant('devices', deviceRead),
      )
      .action('queryOrder', (action) =>
        action
          .grant('workOrders', workOrderRead)
          .grant('events', workOrderEventRead)
          .grant('integrationEvents', integrationEventRead),
      ),
);

export const SERVICE_RECORD_ACCESS = {
  all: ALL,
  assigned: ASSIGNED,
  visible: VISIBLE,
  sharedToMe: SHARED,
} as const;
