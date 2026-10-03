import {
  defineCompositeResource,
  type CompositeResource,
} from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';

/**
 * Business row shapes used to type collection permissions. They mirror the
 * columns declared by the service migrations; the authorization layer only
 * needs the field names it may read or write.
 */
export interface CustomerRow {
  id: number;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  address: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceRow {
  id: number;
  deviceNo: string;
  name: string;
  customerId: number;
  engineerProfileId: number | null;
  serviceEngineerId: string | null;
  status: string;
  nextInspectionDate: string | null;
  model: string | null;
  location: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceOrderRow {
  id: number;
  orderNo: string;
  externalEventNo: string | null;
  title: string;
  customerId: number;
  deviceId: number;
  problemDescription: string | null;
  priority: string;
  status: string;
  source: string;
  confidential: boolean;
  deadline: Date | null;
  assigneeId: string | null;
  assigneeProfileId: number | null;
  groupId: number | null;
  createdById: string | null;
  reporterId: string | null;
  acceptedAt: Date | null;
  startedAt: Date | null;
  submittedAt: Date | null;
  closedAt: Date | null;
  acceptanceNote: string | null;
  resolution: string | null;
  returnReason: string | null;
  returnCount: number;
  lastWorkflowRunId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeArticleRow {
  id: number;
  title: string;
  body: string | null;
  status: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InspectionRow {
  id: number;
  deviceId: number;
  planDate: string;
  assigneeId: string | null;
  assigneeProfileId: number | null;
  status: string;
  result: string | null;
  completedAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceOrderShareRow {
  id: number;
  orderId: number;
  sharedWithId: string;
  sharedById: string | null;
  ruleKey: string;
  expiresAt: Date | null;
  revoked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceOrderFileRow {
  id: number;
  orderId: number;
  fileId: string;
  kind: string;
  originalName: string | null;
  uploadedById: string | null;
  createdAt: Date;
}

export interface ServiceFileRow {
  id: string;
  disk: string;
  key: string;
  filename: string | null;
  ext: string | null;
  mimeType: string | null;
  size: number | null;
  uploadedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Record access references are plain serializable values. The matching
 * resolvers are registered by the authorizing provider with the same keys.
 */
export const assignedToMeAccess = {
  key: 'service.assignedToMe',
  collections: ['serviceOrders', 'inspections'],
} as const;

export const publishedOnlyAccess = {
  key: 'service.publishedOnly',
  collections: ['knowledgeArticles'],
} as const;

/** Permitted but selects nothing; a share can still expand it per record. */
export const noRecordsAccess = {
  key: 'service.noRecords',
  collections: ['serviceOrders'],
} as const;

/** One order id, carried as params by a temporary collaboration rule. */
export const sharedOrderAccess = {
  key: 'service.sharedOrder',
  collections: ['serviceOrders'],
} as const;

const orderSummaryFields = [
  'id',
  'orderNo',
  'title',
  'status',
  'priority',
  'customerId',
  'deviceId',
  'deadline',
  'confidential',
  'source',
  'assigneeId',
  'assigneeProfileId',
  'groupId',
  'createdAt',
  'updatedAt',
] as const;

const orderWriteFields = [
  'orderNo',
  'externalEventNo',
  'title',
  'customerId',
  'deviceId',
  'problemDescription',
  'priority',
  'status',
  'source',
  'confidential',
  'deadline',
  'assigneeId',
  'assigneeProfileId',
  'groupId',
  'createdById',
  'reporterId',
  'acceptedAt',
  'startedAt',
  'submittedAt',
  'closedAt',
  'acceptanceNote',
  'resolution',
  'returnReason',
  'returnCount',
  'lastWorkflowRunId',
  'createdAt',
  'updatedAt',
] as const;

const customerFields = [
  'id',
  'name',
  'contactName',
  'contactPhone',
  'address',
  'note',
  'createdAt',
  'updatedAt',
] as const;

const deviceFields = [
  'id',
  'deviceNo',
  'name',
  'customerId',
  'engineerProfileId',
  'serviceEngineerId',
  'status',
  'nextInspectionDate',
  'model',
  'location',
  'createdAt',
  'updatedAt',
] as const;

/** Customer and device ledger: readable and maintainable by supervisors. */
export const ledgerResource = defineCompositeResource(
  'service.ledger',
  (resource) =>
    resource
      .title('Service ledger')
      .action('view', (action) =>
        action
          .title('View ledger')
          .grant(
            'customers',
            defineDatabasePermission((permission) =>
              permission
                .collection<CustomerRow>('customers')
                .title('Customers')
                .options(recordAccess.allRecords)
                .default(recordAccess.allRecords)
                .read(customerFields),
            ),
          )
          .grant(
            'devices',
            defineDatabasePermission((permission) =>
              permission
                .collection<DeviceRow>('devices')
                .title('Devices')
                .options(recordAccess.allRecords)
                .default(recordAccess.allRecords)
                .read(deviceFields),
            ),
          ),
      )
      .action('manage', (action) =>
        action
          .title('Manage ledger')
          .grant(
            'customers',
            defineDatabasePermission((permission) =>
              permission
                .collection<CustomerRow>('customers')
                .title('Customers')
                .options(recordAccess.allRecords)
                .default(recordAccess.allRecords)
                .read('*')
                .create('*')
                .update('*')
                .delete(),
            ),
          )
          .grant(
            'devices',
            defineDatabasePermission((permission) =>
              permission
                .collection<DeviceRow>('devices')
                .title('Devices')
                .options(recordAccess.allRecords)
                .default(recordAccess.allRecords)
                .read('*')
                .create('*')
                .update('*')
                .delete(),
            ),
          ),
      ),
);

/** Service orders: the full lifecycle plus the file attachments and shares. */
export const ordersResource = defineCompositeResource(
  'service.orders',
  (resource) =>
    resource
      .title('Service orders')
      .action('view', (action) =>
        action.title('View orders').grant(
          'orders',
          defineDatabasePermission((permission) =>
            permission
              .collection<ServiceOrderRow>('serviceOrders')
              .title('Service orders')
              .options(
                recordAccess.allRecords,
                assignedToMeAccess,
                sharedOrderAccess,
              )
              .default(assignedToMeAccess)
              .read('*'),
          ),
        ),
      )
      .action('viewSummary', (action) =>
        action.title('View order summaries').grant(
          'orders',
          defineDatabasePermission((permission) =>
            permission
              .collection<ServiceOrderRow>('serviceOrders')
              .title('Service orders')
              .options(
                recordAccess.allRecords,
                assignedToMeAccess,
                noRecordsAccess,
                sharedOrderAccess,
              )
              .default(assignedToMeAccess)
              .read(orderSummaryFields),
          ),
        ),
      )
      .action('create', (action) =>
        action.title('Register service orders').grant(
          'orders',
          defineDatabasePermission((permission) =>
            permission
              .collection<ServiceOrderRow>('serviceOrders')
              .title('Service orders')
              .options(recordAccess.allRecords)
              .default(recordAccess.allRecords)
              .read('*')
              .create(orderWriteFields),
          ),
        ),
      )
      .action('process', (action) =>
        action.title('Process service orders').grant(
          'orders',
          defineDatabasePermission((permission) =>
            permission
              .collection<ServiceOrderRow>('serviceOrders')
              .title('Service orders')
              .options(recordAccess.allRecords, assignedToMeAccess)
              .default(assignedToMeAccess)
              .read('*')
              .update([
                'status',
                'resolution',
                'startedAt',
                'submittedAt',
                'returnCount',
                'updatedAt',
              ]),
          ),
        ),
      )
      .action('supervise', (action) =>
        action
          .title('Supervise service orders')
          .grant(
            'orders',
            defineDatabasePermission((permission) =>
              permission
                .collection<ServiceOrderRow>('serviceOrders')
                .title('Service orders')
                .options(recordAccess.allRecords, assignedToMeAccess)
                .default(recordAccess.allRecords)
                .read('*')
                .update([
                  'status',
                  'assigneeId',
                  'assigneeProfileId',
                  'groupId',
                  'acceptedAt',
                  'acceptanceNote',
                  'closedAt',
                  'returnReason',
                  'returnCount',
                  'resolution',
                  'updatedAt',
                ]),
            ),
          )
          .grant(
            'shares',
            defineDatabasePermission((permission) =>
              permission
                .collection<ServiceOrderShareRow>('serviceOrderShares')
                .title('Order shares')
                .options(recordAccess.allRecords)
                .default(recordAccess.allRecords)
                .read('*')
                .create('*')
                .update(['revoked', 'expiresAt', 'updatedAt'])
                .delete(),
            ),
          ),
      )
      .action('attach', (action) =>
        action
          .title('Attach repair files')
          .grant(
            'orderFiles',
            defineDatabasePermission((permission) =>
              permission
                .collection<ServiceOrderFileRow>('serviceOrderFiles')
                .title('Order files')
                .options(recordAccess.allRecords)
                .default(recordAccess.allRecords)
                .read('*')
                .create('*')
                .delete(),
            ),
          )
          .grant(
            'files',
            defineDatabasePermission((permission) =>
              permission
                .collection<ServiceFileRow>('serviceFiles')
                .title('Service files')
                .options(recordAccess.allRecords)
                .default(recordAccess.allRecords)
                .read('*')
                .create('*')
                .delete(),
            ),
          ),
      ),
);

/** Repair knowledge: published articles for readers, drafts for supervisors. */
export const knowledgeResource = defineCompositeResource(
  'service.knowledge',
  (resource) =>
    resource
      .title('Repair knowledge')
      .action('read', (action) =>
        action.title('Read knowledge').grant(
          'articles',
          defineDatabasePermission((permission) =>
            permission
              .collection<KnowledgeArticleRow>('knowledgeArticles')
              .title('Knowledge articles')
              .options(recordAccess.allRecords, publishedOnlyAccess)
              .default(publishedOnlyAccess)
              .read('*'),
          ),
        ),
      )
      .action('manage', (action) =>
        action.title('Manage knowledge').grant(
          'articles',
          defineDatabasePermission((permission) =>
            permission
              .collection<KnowledgeArticleRow>('knowledgeArticles')
              .title('Knowledge articles')
              .options(recordAccess.allRecords)
              .default(recordAccess.allRecords)
              .read('*')
              .create('*')
              .update('*')
              .delete(),
          ),
        ),
      ),
);

/** Inspection plans and their completion. */
export const inspectionsResource = defineCompositeResource(
  'service.inspections',
  (resource) =>
    resource
      .title('Device inspections')
      .action('view', (action) =>
        action.title('View inspections').grant(
          'inspections',
          defineDatabasePermission((permission) =>
            permission
              .collection<InspectionRow>('inspections')
              .title('Inspections')
              .options(recordAccess.allRecords, assignedToMeAccess)
              .default(assignedToMeAccess)
              .read('*'),
          ),
        ),
      )
      .action('complete', (action) =>
        action.title('Complete inspections').grant(
          'inspections',
          defineDatabasePermission((permission) =>
            permission
              .collection<InspectionRow>('inspections')
              .title('Inspections')
              .options(recordAccess.allRecords, assignedToMeAccess)
              .default(assignedToMeAccess)
              .read('*')
              .update(['status', 'result', 'completedAt', 'updatedAt']),
          ),
        ),
      )
      .action('manage', (action) =>
        action.title('Manage inspections').grant(
          'inspections',
          defineDatabasePermission((permission) =>
            permission
              .collection<InspectionRow>('inspections')
              .title('Inspections')
              .options(recordAccess.allRecords)
              .default(recordAccess.allRecords)
              .read('*')
              .create('*')
              .update('*')
              .delete(),
          ),
        ),
      ),
);

/** External device report submission, used by the integration service account. */
export const deviceReportsResource = defineCompositeResource(
  'service.deviceReports',
  (resource) =>
    resource.title('External device reports').action('submit', (action) =>
      action.title('Submit device reports').grant(
        'orders',
        defineDatabasePermission((permission) =>
          permission
            .collection<ServiceOrderRow>('serviceOrders')
            .title('Service orders')
            .options(recordAccess.allRecords)
            .default(recordAccess.allRecords)
            .read('*')
            .create(orderWriteFields),
        ),
      ),
    ),
);

export const serviceResources: readonly CompositeResource[] = [
  ledgerResource.build(),
  ordersResource.build(),
  knowledgeResource.build(),
  inspectionsResource.build(),
  deviceReportsResource.build(),
];
