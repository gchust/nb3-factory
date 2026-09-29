import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';
import {
  condition,
  defineDatabasePermission,
  recordAccess,
  type DatabasePermissionBuilder,
} from '@nocobase/app-plugin-authorization/server';

/**
 * The after-sales authorization model.
 *
 * Code declares what each business operation can read and write. Permission
 * sets, page grants and record selections are initial configuration persisted
 * by the installation seeds, and administrators keep editing them afterwards.
 */

export const ORDER_FIELDS = [
  'id',
  'orderNo',
  'title',
  'description',
  'customerId',
  'deviceId',
  'priority',
  'status',
  'source',
  'confidential',
  'assigneeId',
  'acceptedById',
  'acceptedAt',
  'startedAt',
  'submittedAt',
  'closedAt',
  'dueAt',
  'resolution',
  'lastReturnReason',
  'returnCount',
  'externalEventId',
  'createdById',
  'createdAt',
  'updatedAt',
] as const;

export const ACTIVITY_FIELDS = [
  'id',
  'workOrderId',
  'action',
  'actorId',
  'note',
  'fromStatus',
  'toStatus',
  'detail',
  'createdAt',
  'updatedAt',
] as const;

export const ATTACHMENT_FIELDS = [
  'id',
  'workOrderId',
  'fileId',
  'category',
  'uploadedById',
  'createdAt',
  'updatedAt',
] as const;

export const DEVICE_FIELDS = [
  'id',
  'serialNumber',
  'name',
  'model',
  'customerId',
  'engineerId',
  'enabled',
  'installedAt',
  'nextInspectionDate',
  'location',
  'note',
  'createdAt',
  'updatedAt',
] as const;

export const CUSTOMER_FIELDS = [
  'id',
  'name',
  'contactName',
  'contactPhone',
  'contactEmail',
  'address',
  'note',
  'createdAt',
  'updatedAt',
] as const;

export const SHARE_FIELDS = [
  'id',
  'workOrderId',
  'sharedWithId',
  'sharedById',
  'revokedAt',
  'createdAt',
  'updatedAt',
] as const;

export const KNOWLEDGE_FIELDS = [
  'id',
  'title',
  'summary',
  'content',
  'status',
  'tags',
  'authorId',
  'publishedAt',
  'createdAt',
  'updatedAt',
] as const;

export const MANUAL_FIELDS = [
  'id',
  'title',
  'version',
  'deviceModel',
  'content',
  'status',
  'createdAt',
  'updatedAt',
] as const;

export const INSPECTION_FIELDS = [
  'id',
  'deviceId',
  'plannedDate',
  'assigneeId',
  'status',
  'result',
  'completedAt',
  'createdAt',
  'updatedAt',
] as const;

/** Orders currently assigned to the signed-in engineer. */
const orderAssignedToMeBuilder = defineRecordAccess(
  'service.orderAssignedToMe',
  (access) =>
    access
      .title('指派给我的工单')
      .collections('serviceWorkOrders')
      .resolver(({ principal }) =>
        condition('assigneeId', '$eq', principal.id),
      ),
);
export const orderAssignedToMe = orderAssignedToMeBuilder.reference();

/** Orders submitted through the device platform by the signed-in user. */
const orderCreatedByMeBuilder = defineRecordAccess(
  'service.orderCreatedByMe',
  (access) =>
    access
      .title('我提交的工单')
      .collections('serviceWorkOrders')
      .resolver(({ principal }) =>
        condition('createdById', '$eq', principal.id),
      ),
);
export const orderCreatedByMe = orderCreatedByMeBuilder.reference();

/** Orders that are not marked confidential. */
const orderNonConfidentialBuilder = defineRecordAccess(
  'service.orderNonConfidential',
  (access) =>
    access
      .title('非涉密工单')
      .collections('serviceWorkOrders')
      .resolver(() => condition('confidential', '$isFalsy')),
);
export const orderNonConfidential = orderNonConfidentialBuilder.reference();

/** Devices whose service engineer is the signed-in user. */
const deviceOfEngineerBuilder = defineRecordAccess(
  'service.deviceOfEngineer',
  (access) =>
    access
      .title('我负责的设备')
      .collections('serviceDevices')
      .resolver(({ principal }) =>
        condition('engineerId', '$eq', principal.id),
      ),
);
export const deviceOfEngineer = deviceOfEngineerBuilder.reference();

/** Published repair knowledge. */
const publishedKnowledgeBuilder = defineRecordAccess(
  'service.publishedKnowledge',
  (access) =>
    access
      .title('已发布知识')
      .collections('serviceKnowledgeArticles')
      .resolver(() => condition('status', '$eq', 'published')),
);
export const publishedKnowledge = publishedKnowledgeBuilder.reference();

/** Inspection tasks assigned to the signed-in engineer. */
const inspectionAssignedToMeBuilder = defineRecordAccess(
  'service.inspectionAssignedToMe',
  (access) =>
    access
      .title('指派给我的巡检')
      .collections('serviceInspections')
      .resolver(({ principal }) =>
        condition('assigneeId', '$eq', principal.id),
      ),
);
export const inspectionAssignedToMe = inspectionAssignedToMeBuilder.reference();

const orderRead = () =>
  defineDatabasePermission((p) =>
    p.collection('serviceWorkOrders').title('工单').read(ORDER_FIELDS),
  );

const orderWrite = (fields: readonly string[]) =>
  defineDatabasePermission((p) =>
    p.collection('serviceWorkOrders').title('工单').update(fields),
  );

const orderCreate = () =>
  defineDatabasePermission((p) =>
    p.collection('serviceWorkOrders').title('工单').create(ORDER_FIELDS),
  );

const activityRead = () =>
  defineDatabasePermission((p) =>
    p
      .collection('serviceWorkOrderActivities')
      .title('工单动态')
      .read(ACTIVITY_FIELDS),
  );

const activityCreate = () =>
  defineDatabasePermission((p) =>
    p
      .collection('serviceWorkOrderActivities')
      .title('工单动态')
      .create(ACTIVITY_FIELDS),
  );

const attachmentRead = () =>
  defineDatabasePermission((p) =>
    p
      .collection('serviceWorkOrderAttachments')
      .title('工单附件')
      .read(ATTACHMENT_FIELDS),
  );

const attachmentCreate = () =>
  defineDatabasePermission((p) =>
    p
      .collection('serviceWorkOrderAttachments')
      .title('工单附件')
      .create(ATTACHMENT_FIELDS),
  );

const attachmentDelete = () =>
  defineDatabasePermission((p) =>
    p.collection('serviceWorkOrderAttachments').title('工单附件').delete(),
  );

const deviceRead = () =>
  defineDatabasePermission((p) =>
    p.collection('serviceDevices').title('设备').read(DEVICE_FIELDS),
  );

const deviceWrite = () =>
  defineDatabasePermission((p) =>
    p
      .collection('serviceDevices')
      .title('设备')
      .create(DEVICE_FIELDS)
      .update(DEVICE_FIELDS)
      .delete(),
  );

const customerRead = () =>
  defineDatabasePermission((p) =>
    p.collection('serviceCustomers').title('客户').read(CUSTOMER_FIELDS),
  );

const customerWrite = () =>
  defineDatabasePermission((p) =>
    p
      .collection('serviceCustomers')
      .title('客户')
      .create(CUSTOMER_FIELDS)
      .update(CUSTOMER_FIELDS)
      .delete(),
  );

const shareRead = () =>
  defineDatabasePermission((p) =>
    p.collection('serviceWorkOrderShares').title('工单共享').read(SHARE_FIELDS),
  );

const shareCreate = () =>
  defineDatabasePermission((p) =>
    p
      .collection('serviceWorkOrderShares')
      .title('工单共享')
      .create(SHARE_FIELDS),
  );

const shareUpdate = () =>
  defineDatabasePermission((p) =>
    p
      .collection('serviceWorkOrderShares')
      .title('工单共享')
      .update(['revokedAt']),
  );

const knowledgeRead = () =>
  defineDatabasePermission((p) =>
    p
      .collection('serviceKnowledgeArticles')
      .title('维修知识')
      .read(KNOWLEDGE_FIELDS),
  );

const knowledgeWrite = () =>
  defineDatabasePermission((p) =>
    p
      .collection('serviceKnowledgeArticles')
      .title('维修知识')
      .create(KNOWLEDGE_FIELDS)
      .update(KNOWLEDGE_FIELDS)
      .delete(),
  );

const manualRead = () =>
  defineDatabasePermission((p) =>
    p.collection('serviceManuals').title('设备手册').read(MANUAL_FIELDS),
  );

const manualWrite = () =>
  defineDatabasePermission((p) =>
    p
      .collection('serviceManuals')
      .title('设备手册')
      .create(MANUAL_FIELDS)
      .update(MANUAL_FIELDS)
      .delete(),
  );

const inspectionRead = () =>
  defineDatabasePermission((p) =>
    p
      .collection('serviceInspections')
      .title('巡检任务')
      .read(INSPECTION_FIELDS),
  );

const inspectionWrite = () =>
  defineDatabasePermission((p) =>
    p
      .collection('serviceInspections')
      .title('巡检任务')
      .create(INSPECTION_FIELDS)
      .update(INSPECTION_FIELDS)
      .delete(),
  );

const orderScope = <
  T extends DatabasePermissionBuilder<Record<string, unknown>, string>,
>(
  builder: T,
) =>
  builder
    .options(
      recordAccess.allRecords,
      orderAssignedToMe,
      orderCreatedByMe,
      orderNonConfidential,
    )
    .default(orderNonConfidential);

/** Read a work order with the facts its detail view and timeline need. */
export const serviceWorkOrders = defineCompositeResource(
  'service.workOrders',
  (resource) =>
    resource
      .title('工单处理')
      .action('view', (action) =>
        action
          .title('查看工单')
          .grant('orders', orderScope(orderRead()))
          .grant('activities', activityRead())
          .grant('attachments', attachmentRead())
          .grant('devices', deviceRead())
          .grant('customers', customerRead())
          .grant('shares', shareRead()),
      )
      .action('create', (action) =>
        action
          .title('创建工单')
          .grant('orders', orderScope(orderCreate()))
          .grant('activities', activityCreate()),
      )
      .action('accept', (action) =>
        action
          .title('受理工单')
          .grant(
            'orders',
            orderScope(
              orderWrite([
                'status',
                'assigneeId',
                'acceptedAt',
                'acceptedById',
              ]),
            ),
          )
          .grant('activities', activityCreate()),
      )
      .action('start', (action) =>
        action
          .title('开始处理')
          .grant('orders', orderScope(orderWrite(['status', 'startedAt'])))
          .grant('activities', activityCreate()),
      )
      .action('submit', (action) =>
        action
          .title('提交处理结果')
          .grant(
            'orders',
            orderScope(orderWrite(['status', 'resolution', 'submittedAt'])),
          )
          .grant('activities', activityCreate()),
      )
      .action('confirm', (action) =>
        action
          .title('确认关闭')
          .grant('orders', orderScope(orderWrite(['status', 'closedAt'])))
          .grant('activities', activityCreate()),
      )
      .action('return', (action) =>
        action
          .title('退回工单')
          .grant(
            'orders',
            orderScope(
              orderWrite(['status', 'lastReturnReason', 'returnCount']),
            ),
          )
          .grant('activities', activityCreate()),
      )
      .action('comment', (action) =>
        action.title('添加备注').grant('activities', activityCreate()),
      )
      .action('attach', (action) =>
        action.title('上传附件').grant('attachments', attachmentCreate()),
      )
      .action('detach', (action) =>
        action.title('删除附件').grant('attachments', attachmentDelete()),
      )
      .action('share', (action) =>
        action
          .title('共享工单')
          .grant('shares', shareCreate())
          .grant('orders', orderRead()),
      )
      .action('unshare', (action) =>
        action.title('取消共享').grant('shares', shareUpdate()),
      ),
);

/** Master data: customers and their devices. */
export const serviceCustomers = defineCompositeResource(
  'service.customers',
  (resource) =>
    resource
      .title('客户管理')
      .action('view', (action) =>
        action.title('查看客户').grant('customers', customerRead()),
      )
      .action('manage', (action) =>
        action.title('维护客户').grant('customers', customerWrite()),
      ),
);

export const serviceDevices = defineCompositeResource(
  'service.devices',
  (resource) =>
    resource
      .title('设备管理')
      .action('view', (action) =>
        action
          .title('查看设备')
          .grant(
            'devices',
            deviceRead()
              .options(recordAccess.allRecords, deviceOfEngineer)
              .default(deviceOfEngineer),
          )
          .grant('customers', customerRead()),
      )
      .action('manage', (action) =>
        action.title('维护设备').grant('devices', deviceWrite()),
      ),
);

/** Repair knowledge with a published/draft split. */
export const serviceKnowledge = defineCompositeResource(
  'service.knowledge',
  (resource) =>
    resource
      .title('维修知识')
      .action('view', (action) =>
        action
          .title('查看知识')
          .grant(
            'articles',
            knowledgeRead()
              .options(recordAccess.allRecords, publishedKnowledge)
              .default(publishedKnowledge),
          ),
      )
      .action('manage', (action) =>
        action.title('维护知识').grant('articles', knowledgeWrite()),
      ),
);

/** Equipment manuals, readable by qualified engineers. */
export const serviceManuals = defineCompositeResource(
  'service.manuals',
  (resource) =>
    resource
      .title('设备手册')
      .action('view', (action) =>
        action.title('查看手册').grant('manuals', manualRead()),
      )
      .action('manage', (action) =>
        action.title('维护手册').grant('manuals', manualWrite()),
      ),
);

/** Inspection tasks. */
export const serviceInspections = defineCompositeResource(
  'service.inspections',
  (resource) =>
    resource
      .title('设备巡检')
      .action('view', (action) =>
        action
          .title('查看巡检')
          .grant(
            'inspections',
            inspectionRead()
              .options(recordAccess.allRecords, inspectionAssignedToMe)
              .default(inspectionAssignedToMe),
          )
          .grant('devices', deviceRead()),
      )
      .action('manage', (action) =>
        action.title('维护巡检').grant('inspections', inspectionWrite()),
      )
      .action('complete', (action) =>
        action
          .title('完成巡检')
          .grant(
            'inspections',
            inspectionWrite()
              .options(recordAccess.allRecords, inspectionAssignedToMe)
              .default(inspectionAssignedToMe),
          ),
      ),
);

/** Device-platform report submission and own-report reading. */
export const serviceDeviceReports = defineCompositeResource(
  'service.deviceReports',
  (resource) =>
    resource
      .title('设备平台上报')
      .action('submit', (action) =>
        action
          .title('提交设备上报')
          .grant('orders', orderScope(orderCreate()))
          .grant('activities', activityCreate()),
      )
      .action('viewOwn', (action) =>
        action
          .title('查看我的上报')
          .grant(
            'orders',
            orderRead()
              .options(recordAccess.allRecords, orderCreatedByMe)
              .default(orderCreatedByMe),
          ),
      ),
);

/** Dashboard counters. */
export const serviceDashboard = defineCompositeResource(
  'service.dashboard',
  (resource) =>
    resource
      .title('服务看板')
      .action('view', (action) =>
        action
          .title('查看看板')
          .grant('orders', orderScope(orderRead()))
          .grant('inspections', inspectionRead()),
      ),
);

/** The read-only service assistant. */
export const serviceAssistant = defineCompositeResource(
  'service.assistant',
  (resource) =>
    resource
      .title('服务助手')
      .action('query', (action) =>
        action
          .title('咨询助手')
          .grant('knowledge', knowledgeRead())
          .grant('manuals', manualRead())
          .grant('orders', orderScope(orderRead())),
      )
      .action('confirm', (action) =>
        action
          .title('确认助手动作')
          .grant('orders', orderScope(orderCreate()))
          .grant('activities', activityCreate()),
      ),
);

export const serviceComposites = [
  serviceWorkOrders,
  serviceCustomers,
  serviceDevices,
  serviceKnowledge,
  serviceManuals,
  serviceInspections,
  serviceDeviceReports,
  serviceDashboard,
  serviceAssistant,
] as const;

export const serviceRecordAccess = [
  orderAssignedToMeBuilder,
  orderCreatedByMeBuilder,
  orderNonConfidentialBuilder,
  deviceOfEngineerBuilder,
  publishedKnowledgeBuilder,
  inspectionAssignedToMeBuilder,
] as const;

export const serviceCollections = [
  'serviceCustomers',
  'serviceDevices',
  'serviceTeamMembers',
  'serviceWorkOrders',
  'serviceWorkOrderActivities',
  'serviceWorkOrderShares',
  'serviceKnowledgeArticles',
  'serviceManuals',
  'serviceInspections',
  'serviceWorkOrderFiles',
  'serviceWorkOrderAttachments',
  'serviceAssistantConversations',
  'serviceExternalEvents',
] as const;
