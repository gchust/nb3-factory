import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import type { PermissionGrant } from '@nocobase/authorization/core';

import {
  deviceReportsResource,
  inspectionsResource,
  knowledgeResource,
  ledgerResource,
  ordersResource,
} from '../../server/service/resources.ts';

/**
 * Initial business permission sets. They are written by the installation seed
 * and may afterwards be edited by an administrator; a later run never
 * overwrites an existing definition.
 */

const pageAccess = (id: string): PermissionGrant => ({
  resource: { type: 'page', id },
  actions: [{ action: 'access' }],
});

const settingsManage = (id: string): PermissionGrant => ({
  resource: { type: 'settings', id },
  actions: [{ action: 'manage' }],
});

const settingsRead = (id: string): PermissionGrant => ({
  resource: { type: 'settings', id },
  actions: [{ action: 'read' }],
});

const PAGES = {
  orders: 'service.orders',
  orderDetail: 'service.orders.detail',
  ledger: 'service.ledger',
  knowledge: 'service.knowledge',
  inspections: 'service.inspections',
  assistant: 'service.assistant',
  messages: 'service.messages',
  manuals: 'service.manuals',
} as const;

export const serviceSupervisor = definePermissionSet('service-supervisor')
  .title('Service supervisor')
  .grant(
    pageAccess(PAGES.orders),
    pageAccess(PAGES.orderDetail),
    pageAccess(PAGES.ledger),
    pageAccess(PAGES.knowledge),
    pageAccess(PAGES.inspections),
    pageAccess(PAGES.assistant),
    pageAccess(PAGES.messages),
    pageAccess(PAGES.manuals),
    // The AI settings pages own the knowledge base and vector database the
    // device-manual library is built on.
    pageAccess('ai.settings'),
  )
  .grant(settingsManage('workflow'))
  // The supervisor watches inspection/overdue schedules and can trigger a
  // controlled immediate run from the Scheduler page.
  .grant(settingsRead('scheduler.schedules'))
  .grant(
    ledgerResource.reference().grant({
      view: { customers: 'allRecords', devices: 'allRecords' },
      manage: { customers: 'allRecords', devices: 'allRecords' },
    }),
  )
  .grant(
    ordersResource.reference().grant({
      view: { orders: 'allRecords' },
      viewSummary: { orders: 'allRecords' },
      create: { orders: 'allRecords' },
      process: { orders: 'allRecords' },
      supervise: { orders: 'allRecords', shares: 'allRecords' },
      attach: { orderFiles: 'allRecords', files: 'allRecords' },
    }),
  )
  .grant(
    knowledgeResource.reference().grant({
      read: { articles: 'allRecords' },
      manage: { articles: 'allRecords' },
    }),
  )
  .grant(
    inspectionsResource.reference().grant({
      view: { inspections: 'allRecords' },
      complete: { inspections: 'allRecords' },
      manage: { inspections: 'allRecords' },
    }),
  )
  .build();

export const serviceEngineer = definePermissionSet('service-engineer')
  .title('Service engineer')
  .grant(
    pageAccess(PAGES.orders),
    pageAccess(PAGES.orderDetail),
    pageAccess(PAGES.knowledge),
    pageAccess(PAGES.inspections),
    pageAccess(PAGES.assistant),
    pageAccess(PAGES.messages),
    pageAccess(PAGES.manuals),
  )
  .grant(
    ordersResource.reference().grant({
      view: { orders: 'service.assignedToMe' },
      viewSummary: { orders: 'service.assignedToMe' },
      process: { orders: 'service.assignedToMe' },
      attach: { orderFiles: 'allRecords', files: 'allRecords' },
    }),
  )
  .grant(
    knowledgeResource
      .reference()
      .grant({ read: { articles: 'service.publishedOnly' } }),
  )
  .grant(
    inspectionsResource.reference().grant({
      view: { inspections: 'service.assignedToMe' },
      complete: { inspections: 'service.assignedToMe' },
    }),
  )
  .build();

export const serviceObserver = definePermissionSet('service-observer')
  .title('Service observer')
  .grant(
    pageAccess(PAGES.orders),
    pageAccess(PAGES.assistant),
    pageAccess(PAGES.messages),
  )
  // Selects nothing by itself: an observer sees a normal order only after an
  // explicit share is granted for that order.
  .grant(
    ordersResource
      .reference()
      .grant({ viewSummary: { orders: 'service.noRecords' } }),
  )
  .build();

export const serviceIntegration = definePermissionSet('service-integration')
  .title('External integration')
  .grant(
    deviceReportsResource
      .reference()
      .grant({ submit: { orders: 'allRecords' } }),
  )
  .build();

export const servicePermissionSets = [
  serviceSupervisor,
  serviceEngineer,
  serviceObserver,
  serviceIntegration,
];

/** Permission sets keyed by the demo profile role they are assigned to. */
export const permissionSetByRole: Readonly<Record<string, string>> = {
  supervisor: serviceSupervisor.key,
  engineer: serviceEngineer.key,
  observer: serviceObserver.key,
  integration: serviceIntegration.key,
};
