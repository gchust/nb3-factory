import { definePermissionSet } from '@nocobase/authorization/permission-sets';

import {
  serviceAssistant,
  serviceCustomers,
  serviceDashboard,
  serviceDeviceReports,
  serviceDevices,
  serviceInspections,
  serviceKnowledge,
  serviceManuals,
  serviceWorkOrders,
} from '../../server/service/resources.ts';
import { SERVICE_PAGE_IDS } from '../../server/service/constants.ts';

/**
 * Initial permission sets for the after-sales service system.
 *
 * These are ordinary configuration persisted by an installation seed. An
 * administrator may keep editing the pages, actions and data scopes in
 * Settings -> Authorization; the code above only declares what exists.
 */

const page = (id: string) => ({
  resource: { type: 'page' as const, id },
  actions: [{ action: 'access' }],
});

const myOrderScopes = { orders: 'service.orderAssignedToMe' } as const;
const nonConfidentialOrders = {
  orders: 'service.orderNonConfidential',
} as const;
const allDevices = { devices: 'allRecords' } as const;

export const supervisor = definePermissionSet('service-supervisor')
  .title('售后服务主管')
  .grant(
    page(SERVICE_PAGE_IDS.dashboard),
    page(SERVICE_PAGE_IDS.customers),
    page(SERVICE_PAGE_IDS.devices),
    page(SERVICE_PAGE_IDS.workOrders),
    page(SERVICE_PAGE_IDS.inspections),
    page(SERVICE_PAGE_IDS.knowledge),
    page(SERVICE_PAGE_IDS.manuals),
    page(SERVICE_PAGE_IDS.assistant),
    // The supervisor owns the two business schedules and checks their run
    // history, so the Scheduler settings page (resource
    // `scheduler.schedules`) belongs to the role.
    page('scheduler.schedules'),
  )
  .grant(
    serviceDashboard.reference().grant({
      view: { orders: 'allRecords' },
    }),
    serviceCustomers.reference().grant({ view: {}, manage: {} }),
    serviceDevices.reference().grant({ view: allDevices, manage: {} }),
    serviceWorkOrders.reference().grant({
      view: {
        orders: 'allRecords',
        activities: 'allRecords',
        attachments: 'allRecords',
        devices: 'allRecords',
        customers: 'allRecords',
        shares: 'allRecords',
      },
      create: { orders: 'allRecords', activities: 'allRecords' },
      accept: { orders: 'allRecords', activities: 'allRecords' },
      start: { orders: 'allRecords', activities: 'allRecords' },
      submit: { orders: 'allRecords', activities: 'allRecords' },
      confirm: { orders: 'allRecords', activities: 'allRecords' },
      return: { orders: 'allRecords', activities: 'allRecords' },
      comment: { activities: 'allRecords' },
      attach: { attachments: 'allRecords' },
      detach: { attachments: 'allRecords' },
      share: { orders: 'allRecords', shares: 'allRecords' },
      unshare: { shares: 'allRecords' },
    }),
    serviceInspections.reference().grant({
      view: { inspections: 'allRecords' },
      manage: {},
      complete: { inspections: 'allRecords' },
    }),
    serviceKnowledge.reference().grant({
      view: { articles: 'allRecords' },
      manage: {},
    }),
    serviceManuals.reference().grant({ view: {}, manage: {} }),
    serviceAssistant.reference().grant({ query: {}, confirm: {} }),
  )
  .build();

export const engineer = definePermissionSet('service-engineer')
  .title('售后服务工程师')
  .grant(
    page(SERVICE_PAGE_IDS.dashboard),
    page(SERVICE_PAGE_IDS.devices),
    page(SERVICE_PAGE_IDS.workOrders),
    page(SERVICE_PAGE_IDS.inspections),
    page(SERVICE_PAGE_IDS.knowledge),
    page(SERVICE_PAGE_IDS.manuals),
    page(SERVICE_PAGE_IDS.assistant),
  )
  .grant(
    serviceDashboard.reference().grant({ view: myOrderScopes }),
    serviceCustomers.reference().grant({ view: {} }),
    serviceDevices.reference().grant({ view: {} }),
    serviceWorkOrders.reference().grant({
      view: myOrderScopes,
      start: myOrderScopes,
      submit: myOrderScopes,
      comment: {},
      attach: {},
      detach: {},
      share: myOrderScopes,
      unshare: {},
    }),
    serviceInspections.reference().grant({
      view: {},
      complete: {},
    }),
    serviceKnowledge.reference().grant({ view: {} }),
    serviceManuals.reference().grant({ view: {} }),
    serviceAssistant.reference().grant({ query: {}, confirm: {} }),
  )
  .build();

export const observer = definePermissionSet('service-observer')
  .title('售后服务观察员')
  .grant(
    page(SERVICE_PAGE_IDS.dashboard),
    page(SERVICE_PAGE_IDS.customers),
    page(SERVICE_PAGE_IDS.devices),
    page(SERVICE_PAGE_IDS.workOrders),
    page(SERVICE_PAGE_IDS.knowledge),
    page(SERVICE_PAGE_IDS.manuals),
  )
  .grant(
    serviceDashboard.reference().grant({ view: nonConfidentialOrders }),
    serviceCustomers.reference().grant({ view: {} }),
    serviceDevices.reference().grant({ view: allDevices }),
    serviceWorkOrders.reference().grant({ view: nonConfidentialOrders }),
    serviceKnowledge.reference().grant({ view: {} }),
    serviceManuals.reference().grant({ view: {} }),
  )
  .build();

export const integration = definePermissionSet('service-integration')
  .title('设备平台集成账号')
  .grant(
    page(SERVICE_PAGE_IDS.integration),
    // The integration owner manages its own API keys from Settings, so it needs
    // the api-keys settings page grant the same way staff roles get theirs.
    page('api-keys'),
  )
  .grant(
    // The report form lists devices to choose from; without this view grant the
    // dropdown is empty and a report cannot be submitted.
    serviceDevices.reference().grant({ view: {} }),
    serviceDeviceReports.reference().grant({
      submit: { orders: 'service.orderCreatedByMe' },
      viewOwn: { orders: 'service.orderCreatedByMe' },
    }),
  )
  .build();

export const servicePermissionSets = [
  supervisor,
  engineer,
  observer,
  integration,
] as const;
