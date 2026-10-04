import { defineCompositeResource } from '@nocobase/authorization/core';
import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';
import type {
  Customer,
  Device,
  Inspection,
  KnowledgeArticle,
  Ticket,
} from './domain.js';

/**
 * Portable authorization declarations for the after-sales service feature.
 *
 * Nothing here registers or grants anything by itself: the owning provider
 * registers the collections and composites, and the provisioning step assigns
 * the resulting references to the business permission sets.
 */

const customerRead = defineDatabasePermission((permission) =>
  permission
    .collection<Customer>('customers')
    .title('客户')
    .read([
      'id',
      'code',
      'name',
      'contact',
      'phone',
      'level',
      'region',
      'createdAt',
      'updatedAt',
    ]),
);
const customerWrite = defineDatabasePermission((permission) =>
  permission
    .collection<Customer>('customers')
    .title('客户')
    .create([
      'code',
      'name',
      'contact',
      'phone',
      'level',
      'region',
      'createdAt',
      'updatedAt',
    ])
    .update(['name', 'contact', 'phone', 'level', 'region', 'updatedAt']),
);

const deviceRead = defineDatabasePermission((permission) =>
  permission
    .collection<Device>('devices')
    .title('设备')
    .read([
      'id',
      'deviceNo',
      'model',
      'serialNo',
      'customerId',
      'status',
      'installedAt',
      'warrantyUntil',
      'nextInspectionAt',
      'location',
      'notes',
      'createdAt',
      'updatedAt',
    ]),
);
const deviceWrite = defineDatabasePermission((permission) =>
  permission
    .collection<Device>('devices')
    .title('设备')
    .create([
      'deviceNo',
      'model',
      'serialNo',
      'customerId',
      'status',
      'installedAt',
      'warrantyUntil',
      'nextInspectionAt',
      'location',
      'notes',
      'createdAt',
      'updatedAt',
    ])
    .update([
      'model',
      'serialNo',
      'customerId',
      'status',
      'installedAt',
      'warrantyUntil',
      'nextInspectionAt',
      'location',
      'notes',
      'updatedAt',
    ]),
);

const ticketRead = defineDatabasePermission((permission) =>
  permission
    .collection<Ticket>('tickets')
    .title('工单')
    .read([
      'id',
      'ticketNo',
      'title',
      'description',
      'status',
      'priority',
      'confidential',
      'customerId',
      'deviceId',
      'assigneeId',
      'reporterId',
      'source',
      'externalEventNo',
      'acceptedAt',
      'startedAt',
      'submittedAt',
      'closedAt',
      'slaDueAt',
      'handling',
      'resolution',
      'acceptanceNote',
      'createdAt',
      'updatedAt',
    ]),
);
const ticketCreate = defineDatabasePermission((permission) =>
  permission
    .collection<Ticket>('tickets')
    .title('工单')
    .create([
      'ticketNo',
      'title',
      'description',
      'status',
      'priority',
      'confidential',
      'customerId',
      'deviceId',
      'assigneeId',
      'reporterId',
      'source',
      'externalEventNo',
      'slaDueAt',
      'createdAt',
      'updatedAt',
    ]),
);
const ticketUpdate = defineDatabasePermission((permission) =>
  permission
    .collection<Ticket>('tickets')
    .title('工单')
    .update([
      'title',
      'description',
      'priority',
      'confidential',
      'customerId',
      'deviceId',
      'assigneeId',
      'handling',
      'resolution',
      'updatedAt',
    ]),
);
const ticketIngest = defineDatabasePermission((permission) =>
  permission
    .collection<Ticket>('tickets')
    .title('工单')
    // Device-platform intake is deliberately narrower than ordinary creation:
    // the caller supplies the reported symptom, never the routing. An assignee,
    // the confidentiality flag and the SLA clock stay a supervisor decision, so
    // they are absent from the fields the ingest action may write.
    .create([
      'ticketNo',
      'title',
      'description',
      'status',
      'priority',
      'customerId',
      'deviceId',
      'reporterId',
      'source',
      'externalEventNo',
      'createdAt',
      'updatedAt',
    ]),
);
const ticketWorkflow = defineDatabasePermission((permission) =>
  permission
    .collection<Ticket>('tickets')
    .title('工单流转')
    .update([
      'status',
      'acceptedAt',
      'startedAt',
      'submittedAt',
      'closedAt',
      'handling',
      'resolution',
      'acceptanceNote',
      'assigneeId',
      'updatedAt',
    ]),
);
const inspectionRead = defineDatabasePermission((permission) =>
  permission
    .collection<Inspection>('inspections')
    .title('巡检')
    .read([
      'id',
      'deviceId',
      'plannedDate',
      'status',
      'assigneeId',
      'result',
      'notes',
      'ticketId',
      'completedAt',
      'createdAt',
      'updatedAt',
    ]),
);
const inspectionWrite = defineDatabasePermission((permission) =>
  permission
    .collection<Inspection>('inspections')
    .title('巡检')
    .create([
      'deviceId',
      'plannedDate',
      'status',
      'assigneeId',
      'result',
      'notes',
      'ticketId',
      'completedAt',
      'createdAt',
      'updatedAt',
    ])
    .update([
      'status',
      'assigneeId',
      'result',
      'notes',
      'ticketId',
      'completedAt',
      'updatedAt',
    ]),
);

const knowledgeRead = defineDatabasePermission((permission) =>
  permission
    .collection<KnowledgeArticle>('knowledge_articles')
    .title('知识库')
    .read([
      'id',
      'title',
      'category',
      'deviceModel',
      'tags',
      'status',
      'summary',
      'content',
      'createdById',
      'createdAt',
      'updatedAt',
    ]),
);
const knowledgeWrite = defineDatabasePermission((permission) =>
  permission
    .collection<KnowledgeArticle>('knowledge_articles')
    .title('知识库')
    .create([
      'title',
      'category',
      'deviceModel',
      'tags',
      'status',
      'summary',
      'content',
      'createdById',
      'createdAt',
      'updatedAt',
    ])
    .update([
      'title',
      'category',
      'deviceModel',
      'tags',
      'status',
      'summary',
      'content',
      'updatedAt',
    ]),
);

export const customersResource = defineCompositeResource(
  'service.customers',
  (r) =>
    r
      .title('客户管理')
      .action('view', (a) => a.title('查看').grant('customers', customerRead))
      .action('create', (a) =>
        a.title('新建').grant('customers', customerWrite),
      )
      .action('update', (a) =>
        a.title('编辑').grant('customers', customerWrite),
      ),
);

export const devicesResource = defineCompositeResource('service.devices', (r) =>
  r
    .title('设备管理')
    .action('view', (a) => a.title('查看').grant('devices', deviceRead))
    .action('create', (a) => a.title('新建').grant('devices', deviceWrite))
    .action('update', (a) => a.title('编辑').grant('devices', deviceWrite)),
);

export const ticketsResource = defineCompositeResource('service.tickets', (r) =>
  r
    .title('服务工单')
    .action('view', (a) => a.title('查看').grant('tickets', ticketRead))
    .action('create', (a) => a.title('创建').grant('tickets', ticketCreate))
    .action('ingest', (a) =>
      a.title('外部平台受理').grant('tickets', ticketIngest),
    )
    .action('update', (a) => a.title('编辑').grant('tickets', ticketUpdate))
    .action('accept', (a) => a.title('受理').grant('tickets', ticketWorkflow))
    .action('start', (a) =>
      a.title('开始处理').grant('tickets', ticketWorkflow),
    )
    .action('submit', (a) =>
      a.title('提交确认').grant('tickets', ticketWorkflow),
    )
    .action('close', (a) => a.title('关闭').grant('tickets', ticketWorkflow))
    .action('return', (a) => a.title('退回').grant('tickets', ticketWorkflow))
    .action('share', (a) => a.title('临时共享').grant('tickets', ticketRead)),
);

export const inspectionsResource = defineCompositeResource(
  'service.inspections',
  (r) =>
    r
      .title('巡检协作')
      .action('view', (a) =>
        a.title('查看').grant('inspections', inspectionRead),
      )
      .action('create', (a) =>
        a.title('创建').grant('inspections', inspectionWrite),
      )
      .action('update', (a) =>
        a.title('编辑').grant('inspections', inspectionWrite),
      )
      .action('complete', (a) =>
        a.title('完成巡检').grant('inspections', inspectionWrite),
      ),
);

export const knowledgeResource = defineCompositeResource(
  'service.knowledge',
  (r) =>
    r
      .title('设备知识库')
      .action('view', (a) =>
        a.title('查看').grant('knowledge_articles', knowledgeRead),
      )
      .action('create', (a) =>
        a.title('新建').grant('knowledge_articles', knowledgeWrite),
      )
      .action('update', (a) =>
        a.title('编辑').grant('knowledge_articles', knowledgeWrite),
      )
      .action('delete', (a) =>
        a.title('删除').grant('knowledge_articles', knowledgeWrite),
      ),
);

export const dashboardResource = defineCompositeResource(
  'service.dashboard',
  (r) =>
    r
      .title('服务看板')
      .action('view', (a) =>
        a
          .title('查看')
          .grant('tickets', ticketRead)
          .grant('devices', deviceRead)
          .grant('inspections', inspectionRead),
      ),
);

/** Every collection the business feature authorizes. */
export const SERVICE_COLLECTIONS: readonly string[] = [
  'customers',
  'devices',
  'tickets',
  'ticket_events',
  'ticket_shares',
  'inspections',
  'knowledge_articles',
];

export const SERVICE_RESOURCES = [
  customersResource,
  devicesResource,
  ticketsResource,
  inspectionsResource,
  knowledgeResource,
  dashboardResource,
] as const;
