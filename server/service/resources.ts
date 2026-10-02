import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';
import {
  defineCompositeResource,
  type CompositeResourceApi,
} from '@nocobase/authorization/core';

import { SERVICE_NS } from './constants.js';
import { serviceRecordAccess } from './record-access.js';

/**
 * The business capability model for the equipment after-sales service desk.
 *
 * This module is pure declaration: it never registers anything, reads a database or grants access. The service
 * authorization provider registers the resources at boot and the permission-set seed chooses the data scopes an
 * initial job receives; an administrator can keep editing those choices in the backend afterwards.
 */

interface WorkOrderRow {
  id: number;
  code: string;
  title: string;
  description: string | null;
  customerId: number;
  equipmentId: number;
  priority: string;
  status: string;
  confidential: boolean;
  deadline: string | null;
  assigneeId: string | null;
  supervisorId: string | null;
  reporterId: string | null;
  source: string;
  acceptanceNote: string | null;
  resolutionNote: string | null;
  returnReason: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  closedAt: string | null;
  externalEventId: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CustomerRow {
  id: number;
  name: string;
  code: string | null;
  level: string | null;
  contact: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EquipmentRow {
  id: number;
  code: string;
  name: string;
  model: string | null;
  serialNumber: string | null;
  location: string | null;
  status: string;
  customerId: number;
  engineerId: string | null;
  enabled: boolean;
  nextInspectionDate: string | null;
  warrantyUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

interface InspectionRow {
  id: number;
  code: string | null;
  equipmentId: number;
  planDate: string;
  dueDate: string | null;
  assigneeId: string | null;
  status: string;
  result: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface KnowledgeRow {
  id: number;
  title: string;
  category: string | null;
  tags: string | null;
  symptom: string | null;
  content: string | null;
  published: boolean;
  viewCount: number;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ManualRow {
  id: number;
  title: string;
  version: string;
  equipmentId: number;
  summary: string | null;
  content: string | null;
  driveKey: string | null;
  filename: string | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ShareRow {
  id: number;
  workOrderId: number;
  engineerId: string;
  grantedById: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AttachmentRow {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  workOrderId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface ExternalEventRow {
  id: number;
  externalEventId: string;
  source: string | null;
  eventType: string | null;
  status: string;
  message: string | null;
  workOrderId: number | null;
  createdAt: string;
}

interface EngineerGroupRow {
  id: number;
  code: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface EngineerProfileRow {
  id: number;
  userId: string;
  groupId: number | null;
  createdAt: string;
  updatedAt: string;
}

function title(key: string): { key: string; ns: string } {
  return { key, ns: SERVICE_NS };
}

/** Read access to the work-order board, with every scope an engineer or supervisor may be given. */
const workOrderRead = defineDatabasePermission((permission) =>
  permission
    .collection<WorkOrderRow>('serviceWorkOrders')
    .title(title('service.permission.workOrderRead'))
    .read('*')
    .options(
      serviceRecordAccess.allRecords,
      serviceRecordAccess.workOrdersForEngineer,
      serviceRecordAccess.assignedToMe,
      serviceRecordAccess.createdByMe,
      serviceRecordAccess.sharedWithMe,
      serviceRecordAccess.nonConfidentialWorkOrders,
    )
    .default(serviceRecordAccess.workOrdersForEngineer),
);

const workOrderCreate = defineDatabasePermission((permission) =>
  permission
    .collection<WorkOrderRow>('serviceWorkOrders')
    .title(title('service.permission.workOrderCreate'))
    .read('*')
    .create([
      'title',
      'description',
      'customerId',
      'equipmentId',
      'priority',
      'confidential',
      'deadline',
      'assigneeId',
      'reporterId',
      'source',
      'createdById',
      'externalEventId',
    ]),
);

const workOrderUpdate = defineDatabasePermission((permission) =>
  permission
    .collection<WorkOrderRow>('serviceWorkOrders')
    .title(title('service.permission.workOrderUpdate'))
    .read('*')
    .update([
      'title',
      'description',
      'priority',
      'confidential',
      'deadline',
      'assigneeId',
      'supervisorId',
      'resolutionNote',
    ])
    // Update runs through a scoped connection, so the bound data scope needs a default:
    // a grant that chooses no scope would otherwise deny every row.
    .options(
      serviceRecordAccess.allRecords,
      serviceRecordAccess.workOrdersForEngineer,
      serviceRecordAccess.assignedToMe,
      serviceRecordAccess.createdByMe,
      serviceRecordAccess.sharedWithMe,
      serviceRecordAccess.nonConfidentialWorkOrders,
    )
    .default(serviceRecordAccess.workOrdersForEngineer),
);

/** The status transition an accepted, started, submitted, confirmed or returned work order performs. */
const workOrderProgress = defineDatabasePermission((permission) =>
  permission
    .collection<WorkOrderRow>('serviceWorkOrders')
    .title(title('service.permission.workOrderProgress'))
    .read('*')
    .update([
      'status',
      'acceptanceNote',
      'resolutionNote',
      'returnReason',
      'acceptedAt',
      'startedAt',
      'submittedAt',
      'closedAt',
    ])
    .options(
      serviceRecordAccess.allRecords,
      serviceRecordAccess.workOrdersForEngineer,
      serviceRecordAccess.assignedToMe,
      serviceRecordAccess.createdByMe,
      serviceRecordAccess.sharedWithMe,
      serviceRecordAccess.nonConfidentialWorkOrders,
    )
    .default(serviceRecordAccess.workOrdersForEngineer),
);

const workOrderDelete = defineDatabasePermission((permission) =>
  permission
    .collection<WorkOrderRow>('serviceWorkOrders')
    .title(title('service.permission.workOrderDelete'))
    .read('*')
    .delete()
    .options(
      serviceRecordAccess.allRecords,
      serviceRecordAccess.workOrdersForEngineer,
      serviceRecordAccess.assignedToMe,
      serviceRecordAccess.createdByMe,
      serviceRecordAccess.sharedWithMe,
    )
    .default(serviceRecordAccess.allRecords),
);

const customerRead = defineDatabasePermission((permission) =>
  permission
    .collection<CustomerRow>('serviceCustomers')
    .title(title('service.permission.customerRead'))
    .read('*')
    .options(
      serviceRecordAccess.allRecords,
      serviceRecordAccess.customersForEngineer,
    )
    .default(serviceRecordAccess.allRecords),
);

const customerManage = defineDatabasePermission((permission) =>
  permission
    .collection<CustomerRow>('serviceCustomers')
    .title(title('service.permission.customerManage'))
    .read('*')
    .create([
      'name',
      'code',
      'level',
      'contact',
      'phone',
      'address',
      'createdAt',
      'updatedAt',
    ])
    .update([
      'name',
      'code',
      'level',
      'contact',
      'phone',
      'address',
      'updatedAt',
    ])
    .delete()
    .options(
      serviceRecordAccess.allRecords,
      serviceRecordAccess.customersForEngineer,
    )
    .default(serviceRecordAccess.allRecords),
);

const equipmentRead = defineDatabasePermission((permission) =>
  permission
    .collection<EquipmentRow>('serviceEquipment')
    .title(title('service.permission.equipmentRead'))
    .read('*')
    .options(
      serviceRecordAccess.allRecords,
      serviceRecordAccess.equipmentSameGroup,
      serviceRecordAccess.equipmentByCustomer,
    )
    .default(serviceRecordAccess.allRecords),
);

const equipmentManage = defineDatabasePermission((permission) =>
  permission
    .collection<EquipmentRow>('serviceEquipment')
    .title(title('service.permission.equipmentManage'))
    .read('*')
    .create([
      'code',
      'name',
      'model',
      'serialNumber',
      'location',
      'status',
      'customerId',
      'engineerId',
      'enabled',
      'nextInspectionDate',
      'warrantyUntil',
      'createdAt',
      'updatedAt',
    ])
    .update([
      'name',
      'model',
      'serialNumber',
      'location',
      'status',
      'customerId',
      'engineerId',
      'enabled',
      'nextInspectionDate',
      'warrantyUntil',
      'updatedAt',
    ])
    .delete()
    .options(
      serviceRecordAccess.allRecords,
      serviceRecordAccess.equipmentSameGroup,
      serviceRecordAccess.equipmentByCustomer,
    )
    .default(serviceRecordAccess.allRecords),
);

const inspectionRead = defineDatabasePermission((permission) =>
  permission
    .collection<InspectionRow>('serviceInspections')
    .title(title('service.permission.inspectionRead'))
    .read('*')
    .options(
      serviceRecordAccess.allRecords,
      serviceRecordAccess.assignedToMe,
      serviceRecordAccess.inspectionsSameGroup,
    )
    .default(serviceRecordAccess.assignedToMe),
);

const inspectionManage = defineDatabasePermission((permission) =>
  permission
    .collection<InspectionRow>('serviceInspections')
    .title(title('service.permission.inspectionManage'))
    .read('*')
    .create([
      'code',
      'equipmentId',
      'planDate',
      'dueDate',
      'assigneeId',
      'status',
      'result',
      'completedAt',
      'createdAt',
      'updatedAt',
    ])
    .update([
      'assigneeId',
      'status',
      'result',
      'completedAt',
      'dueDate',
      'updatedAt',
    ])
    .delete()
    .options(
      serviceRecordAccess.allRecords,
      serviceRecordAccess.assignedToMe,
      serviceRecordAccess.inspectionsSameGroup,
    )
    .default(serviceRecordAccess.allRecords),
);

const knowledgeRead = defineDatabasePermission((permission) =>
  permission
    .collection<KnowledgeRow>('serviceRepairKnowledge')
    .title(title('service.permission.knowledgeRead'))
    .read('*')
    .options(
      serviceRecordAccess.allRecords,
      serviceRecordAccess.publishedKnowledge,
      serviceRecordAccess.createdByMe,
    )
    .default(serviceRecordAccess.publishedKnowledge),
);

const knowledgeManage = defineDatabasePermission((permission) =>
  permission
    .collection<KnowledgeRow>('serviceRepairKnowledge')
    .title(title('service.permission.knowledgeManage'))
    .read('*')
    .create([
      'title',
      'category',
      'tags',
      'symptom',
      'content',
      'published',
      'createdById',
      'createdAt',
      'updatedAt',
    ])
    .update([
      'title',
      'category',
      'tags',
      'symptom',
      'content',
      'published',
      'viewCount',
      'updatedAt',
    ])
    .delete()
    .options(
      serviceRecordAccess.allRecords,
      serviceRecordAccess.publishedKnowledge,
      serviceRecordAccess.createdByMe,
    )
    .default(serviceRecordAccess.allRecords),
);

const manualRead = defineDatabasePermission((permission) =>
  permission
    .collection<ManualRow>('serviceManuals')
    .title(title('service.permission.manualRead'))
    .read('*')
    .options(
      serviceRecordAccess.allRecords,
      serviceRecordAccess.publishedManuals,
      serviceRecordAccess.manualsForEngineer,
    )
    .default(serviceRecordAccess.publishedManuals),
);

const manualManage = defineDatabasePermission((permission) =>
  permission
    .collection<ManualRow>('serviceManuals')
    .title(title('service.permission.manualManage'))
    .read('*')
    .create([
      'title',
      'version',
      'equipmentId',
      'summary',
      'content',
      'driveKey',
      'filename',
      'published',
      'createdAt',
      'updatedAt',
    ])
    .update([
      'title',
      'version',
      'equipmentId',
      'summary',
      'content',
      'driveKey',
      'filename',
      'published',
      'updatedAt',
    ])
    .delete()
    .options(
      serviceRecordAccess.allRecords,
      serviceRecordAccess.publishedManuals,
      serviceRecordAccess.manualsForEngineer,
    )
    .default(serviceRecordAccess.allRecords),
);

const shareCreate = defineDatabasePermission((permission) =>
  permission
    .collection<ShareRow>('serviceWorkOrderShares')
    .title(title('service.permission.shareCreate'))
    .read('*')
    .create(['workOrderId', 'engineerId', 'grantedById'])
    .update(['revokedAt'])
    .options(serviceRecordAccess.allRecords)
    .default(serviceRecordAccess.allRecords),
);

const attachmentRead = defineDatabasePermission((permission) =>
  permission
    .collection<AttachmentRow>('serviceAttachments')
    .title(title('service.permission.attachmentRead'))
    .read('*')
    .options(serviceRecordAccess.allRecords)
    .default(serviceRecordAccess.allRecords),
);

const attachmentCreate = defineDatabasePermission((permission) =>
  permission
    .collection<AttachmentRow>('serviceAttachments')
    .title(title('service.permission.attachmentCreate'))
    .read('*')
    .create([
      'workOrderId',
      'disk',
      'key',
      'filename',
      'ext',
      'mimeType',
      'size',
    ])
    .delete()
    .options(serviceRecordAccess.allRecords)
    .default(serviceRecordAccess.allRecords),
);

const externalEventCreate = defineDatabasePermission((permission) =>
  permission
    .collection<ExternalEventRow>('serviceExternalEvents')
    .title(title('service.permission.externalEventCreate'))
    .read('*')
    .create([
      'externalEventId',
      'source',
      'eventType',
      'status',
      'message',
      'workOrderId',
    ])
    .options(serviceRecordAccess.allRecords)
    .default(serviceRecordAccess.allRecords),
);

const engineerGroupRead = defineDatabasePermission((permission) =>
  permission
    .collection<EngineerGroupRow>('serviceEngineerGroups')
    .title(title('service.permission.engineerGroupRead'))
    .read('*')
    .options(serviceRecordAccess.allRecords)
    .default(serviceRecordAccess.allRecords),
);

const engineerProfileRead = defineDatabasePermission((permission) =>
  permission
    .collection<EngineerProfileRow>('serviceEngineerProfiles')
    .title(title('service.permission.engineerProfileRead'))
    .read('*')
    .options(serviceRecordAccess.allRecords)
    .default(serviceRecordAccess.allRecords),
);

/**
 * The work-order closed loop. Each transition is a separate business action so an engineer may be allowed to
 * progress a work order without also being allowed to accept, share or delete it.
 */
const serviceWorkOrdersBuilder = defineCompositeResource(
  'service.workOrders',
  (resource) =>
    resource
      .title(title('service.resource.workOrders'))
      .action('view', (action) =>
        action
          .title(title('service.action.workOrderView'))
          .grant('workOrders', workOrderRead, {
            title: title('service.scope.workOrders'),
          })
          .grant('attachments', attachmentRead, {
            title: title('service.scope.attachments'),
          }),
      )
      .action('create', (action) =>
        action
          .title(title('service.action.workOrderCreate'))
          .grant('workOrders', workOrderCreate, {
            title: title('service.scope.workOrders'),
          })
          .grant('customers', customerRead, {
            title: title('service.scope.customers'),
          })
          .grant('equipment', equipmentRead, {
            title: title('service.scope.equipment'),
          }),
      )
      .action('update', (action) =>
        action
          .title(title('service.action.workOrderUpdate'))
          .grant('workOrders', workOrderUpdate, {
            title: title('service.scope.workOrders'),
          }),
      )
      .action('accept', (action) =>
        action
          .title(title('service.action.workOrderAccept'))
          .grant('workOrders', workOrderProgress, {
            title: title('service.scope.workOrders'),
          }),
      )
      .action('start', (action) =>
        action
          .title(title('service.action.workOrderStart'))
          .grant('workOrders', workOrderProgress, {
            title: title('service.scope.workOrders'),
          }),
      )
      .action('submit', (action) =>
        action
          .title(title('service.action.workOrderSubmit'))
          .grant('workOrders', workOrderProgress, {
            title: title('service.scope.workOrders'),
          }),
      )
      .action('confirm', (action) =>
        action
          .title(title('service.action.workOrderConfirm'))
          .grant('workOrders', workOrderProgress, {
            title: title('service.scope.workOrders'),
          }),
      )
      .action('return', (action) =>
        action
          .title(title('service.action.workOrderReturn'))
          .grant('workOrders', workOrderProgress, {
            title: title('service.scope.workOrders'),
          }),
      )
      .action('share', (action) =>
        action
          .title(title('service.action.workOrderShare'))
          .grant('shares', shareCreate, {
            title: title('service.scope.shares'),
          }),
      )
      .action('attach', (action) =>
        action
          .title(title('service.action.workOrderAttach'))
          .grant('attachments', attachmentCreate, {
            title: title('service.scope.attachments'),
          }),
      )
      .action('delete', (action) =>
        action
          .title(title('service.action.workOrderDelete'))
          .grant('workOrders', workOrderDelete, {
            title: title('service.scope.workOrders'),
          }),
      ),
);

export const serviceWorkOrders = serviceWorkOrdersBuilder.reference();

const serviceCustomersBuilder = defineCompositeResource(
  'service.customers',
  (resource) =>
    resource
      .title(title('service.resource.customers'))
      .action('view', (action) =>
        action
          .title(title('service.action.customerView'))
          .grant('customers', customerRead, {
            title: title('service.scope.customers'),
          }),
      )
      .action('manage', (action) =>
        action
          .title(title('service.action.customerManage'))
          .grant('customers', customerManage, {
            title: title('service.scope.customers'),
          }),
      ),
);

export const serviceCustomers = serviceCustomersBuilder.reference();

const serviceEquipmentBuilder = defineCompositeResource(
  'service.equipment',
  (resource) =>
    resource
      .title(title('service.resource.equipment'))
      .action('view', (action) =>
        action
          .title(title('service.action.equipmentView'))
          .grant('equipment', equipmentRead, {
            title: title('service.scope.equipment'),
          })
          .grant('manuals', manualRead, {
            title: title('service.scope.manuals'),
          }),
      )
      .action('manage', (action) =>
        action
          .title(title('service.action.equipmentManage'))
          .grant('equipment', equipmentManage, {
            title: title('service.scope.equipment'),
          })
          .grant('customers', customerRead, {
            title: title('service.scope.customers'),
          }),
      ),
);

export const serviceEquipment = serviceEquipmentBuilder.reference();

const serviceInspectionsBuilder = defineCompositeResource(
  'service.inspections',
  (resource) =>
    resource
      .title(title('service.resource.inspections'))
      .action('view', (action) =>
        action
          .title(title('service.action.inspectionView'))
          .grant('inspections', inspectionRead, {
            title: title('service.scope.inspections'),
          }),
      )
      .action('create', (action) =>
        action
          .title(title('service.action.inspectionCreate'))
          .grant('inspections', inspectionManage, {
            title: title('service.scope.inspections'),
          })
          .grant('equipment', equipmentRead, {
            title: title('service.scope.equipment'),
          }),
      )
      .action('complete', (action) =>
        action
          .title(title('service.action.inspectionComplete'))
          .grant('inspections', inspectionManage, {
            title: title('service.scope.inspections'),
          }),
      ),
);

export const serviceInspections = serviceInspectionsBuilder.reference();

const serviceKnowledgeBuilder = defineCompositeResource(
  'service.knowledge',
  (resource) =>
    resource
      .title(title('service.resource.knowledge'))
      .action('view', (action) =>
        action
          .title(title('service.action.knowledgeView'))
          .grant('knowledge', knowledgeRead, {
            title: title('service.scope.knowledge'),
          }),
      )
      .action('manage', (action) =>
        action
          .title(title('service.action.knowledgeManage'))
          .grant('knowledge', knowledgeManage, {
            title: title('service.scope.knowledge'),
          }),
      ),
);

export const serviceKnowledge = serviceKnowledgeBuilder.reference();

const serviceManualsBuilder = defineCompositeResource(
  'service.manuals',
  (resource) =>
    resource
      .title(title('service.resource.manuals'))
      .action('view', (action) =>
        action
          .title(title('service.action.manualView'))
          .grant('manuals', manualRead, {
            title: title('service.scope.manuals'),
          }),
      )
      .action('manage', (action) =>
        action
          .title(title('service.action.manualManage'))
          .grant('manuals', manualManage, {
            title: title('service.scope.manuals'),
          })
          .grant('equipment', equipmentRead, {
            title: title('service.scope.equipment'),
          }),
      ),
);

export const serviceManuals = serviceManualsBuilder.reference();

/**
 * The external equipment platform. Reading is one action and ingesting an event is another, so an API key can
 * be granted the first and refused the second.
 */
const serviceIntegrationBuilder = defineCompositeResource(
  'service.integration',
  (resource) =>
    resource
      .title(title('service.resource.integration'))
      .action('read', (action) =>
        action
          .title(title('service.action.integrationRead'))
          .grant('workOrders', workOrderRead, {
            title: title('service.scope.workOrders'),
          })
          .grant('customers', customerRead, {
            title: title('service.scope.customers'),
          })
          .grant('equipment', equipmentRead, {
            title: title('service.scope.equipment'),
          }),
      )
      .action('ingest', (action) =>
        action
          .title(title('service.action.integrationIngest'))
          .grant('workOrders', workOrderCreate, {
            title: title('service.scope.workOrders'),
          })
          .grant('externalEvents', externalEventCreate, {
            title: title('service.scope.externalEvents'),
          }),
      ),
);

export const serviceIntegration = serviceIntegrationBuilder.reference();

/**
 * The engineer directory. Supervisors use it to see team membership; every registered business user may read it
 * so the work-order board can resolve an assignee's display name.
 */
const serviceDirectoryBuilder = defineCompositeResource(
  'service.directory',
  (resource) =>
    resource
      .title(title('service.resource.directory'))
      .action('view', (action) =>
        action
          .title(title('service.action.directoryView'))
          .grant('groups', engineerGroupRead, {
            title: title('service.scope.engineerGroups'),
          })
          .grant('profiles', engineerProfileRead, {
            title: title('service.scope.engineerProfiles'),
          }),
      ),
);

export const serviceDirectory = serviceDirectoryBuilder.reference();

/**
 * Registers every composite resource with an authorization registry.
 *
 * Each builder is registered separately: the builders carry different data-scope value types, and passing the
 * tuple as a whole would collapse them into one union the registry cannot infer. The provider calls this once at
 * boot; the module itself stays declaration-only.
 */
export function registerServiceCompositeResources(
  registry: CompositeResourceApi,
): void {
  registry.define(serviceWorkOrdersBuilder);
  registry.define(serviceCustomersBuilder);
  registry.define(serviceEquipmentBuilder);
  registry.define(serviceInspectionsBuilder);
  registry.define(serviceKnowledgeBuilder);
  registry.define(serviceManualsBuilder);
  registry.define(serviceIntegrationBuilder);
  registry.define(serviceDirectoryBuilder);
}

/** Every database collection the application opts into authorization. */
export const serviceCollections = [
  'serviceWorkOrders',
  'serviceCustomers',
  'serviceEquipment',
  'serviceInspections',
  'serviceRepairKnowledge',
  'serviceManuals',
  'serviceWorkOrderShares',
  'serviceAttachments',
  'serviceExternalEvents',
  'serviceEngineerGroups',
  'serviceEngineerProfiles',
] as const;
