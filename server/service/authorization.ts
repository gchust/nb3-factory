import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type {
  CompositeResourceActions,
  CompositeResourceReference,
  PermissionGrant,
} from '@nocobase/authorization/core';

import {
  customersResource,
  dashboardResource,
  devicesResource,
  inspectionsResource,
  knowledgeResource,
  SERVICE_COLLECTIONS,
  ticketsResource,
} from './resources.js';
import { ROLE_PERMISSION_SETS } from './access.js';

/**
 * The page ids the client routes declare for this module. Kept here as
 * literals because the server and the browser bundle are compiled separately;
 * a page grant with an id no route declares is simply never checked.
 */
export const SERVICE_PAGE_IDS = {
  dashboard: 'service-dashboard',
  customers: 'service-customers',
  devices: 'service-devices',
  tickets: 'service-tickets',
  inspections: 'service-inspections',
  knowledge: 'service-knowledge',
  assistant: 'service-assistant',
} as const;

/** The composite resources this module registers, as definition builders. */
export const SERVICE_COMPOSITES = [
  customersResource,
  devicesResource,
  ticketsResource,
  inspectionsResource,
  knowledgeResource,
  dashboardResource,
] as const;

/**
 * Registers the module's collections, composite resources and permission
 * workspace placement. Idempotent: within one registry a second call is a
 * no-op, because `define` rejects a re-definition and `sections.add` a
 * duplicate name.
 */
const registered = new WeakSet<AppAuthorization>();

export function registerServiceAuthorization(authz: AppAuthorization): void {
  if (registered.has(authz)) return;
  registered.add(authz);
  for (const name of SERVICE_COLLECTIONS) {
    if (!authz.database.collections.has(name)) {
      authz.database.collections.add({ name, title: name });
    }
  }
  if (!authz.ui.sections.has('service')) {
    authz.ui.sections.add({
      name: 'service',
      title: '售后服务',
      parent: 'business',
      order: 10,
    });
  }
  for (const composite of SERVICE_COMPOSITES) {
    const reference = authz.compositeResources.define(composite.build());
    authz.ui.place(reference, { section: 'service' });
  }
}

export interface PermissionSetSpec {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly grants: readonly PermissionGrant[];
}

/**
 * The four business roles this application ships, expressed as Permission
 * Sets. The grants describe an upper bound: the service layer narrows records
 * further for engineers and observers.
 */
export function buildPermissionSetSpecs(
  authz: AppAuthorization,
): PermissionSetSpec[] {
  // The declarations carry precise per-action scope types, which is what makes
  // the grant assignments below type-check. Narrowing them to the erased
  // reference shape is only possible once, here, after the assignments exist.
  const ref = <A extends CompositeResourceActions>(
    builder: CompositeResourceReference<A>,
  ): CompositeResourceReference<CompositeResourceActions> => builder;
  const customers = ref(customersResource.reference());
  const devices = ref(devicesResource.reference());
  const tickets = ref(ticketsResource.reference());
  const inspections = ref(inspectionsResource.reference());
  const knowledge = ref(knowledgeResource.reference());
  const dashboard = ref(dashboardResource.reference());

  const supervisorGrants: PermissionGrant[] = [
    customers.grant({
      view: { customers: 'allRecords' },
      create: { customers: 'allRecords' },
      update: { customers: 'allRecords' },
    }),
    devices.grant({
      view: { devices: 'allRecords' },
      create: { devices: 'allRecords' },
      update: { devices: 'allRecords' },
    }),
    tickets.grant({
      view: { tickets: 'allRecords' },
      create: { tickets: 'allRecords' },
      ingest: { tickets: 'allRecords' },
      update: { tickets: 'allRecords' },
      accept: { tickets: 'allRecords' },
      start: { tickets: 'allRecords' },
      submit: { tickets: 'allRecords' },
      close: { tickets: 'allRecords' },
      return: { tickets: 'allRecords' },
      share: { tickets: 'allRecords' },
    }),
    inspections.grant({
      view: { inspections: 'allRecords' },
      create: { inspections: 'allRecords' },
      update: { inspections: 'allRecords' },
      complete: { inspections: 'allRecords' },
    }),
    knowledge.grant({
      view: { knowledge_articles: 'allRecords' },
      create: { knowledge_articles: 'allRecords' },
      update: { knowledge_articles: 'allRecords' },
      delete: { knowledge_articles: 'allRecords' },
    }),
    dashboard.grant({
      view: {
        tickets: 'allRecords',
        devices: 'allRecords',
        inspections: 'allRecords',
      },
    }),
    ...Object.values(SERVICE_PAGE_IDS).map((id) => authz.pages.grant(id)),
    // The supervisor owns the scheduled maintenance work, so the installed
    // Scheduler settings page (计划名称/时区/启停/执行结果) is part of the role.
    authz.pages.grant('scheduler.schedules'),
    // Maintaining the equipment manuals means maintaining the AI knowledge
    // base, so the installed AI settings group (knowledge bases, vector
    // databases, LLM services, employees) belongs to the same role. Engineers
    // and observers read the manuals through the business pages instead.
    authz.pages.grant('ai.settings'),
  ];

  const engineerGrants: PermissionGrant[] = [
    customers.grant({ view: { customers: 'allRecords' } }),
    devices.grant({ view: { devices: 'allRecords' } }),
    tickets.grant({
      view: { tickets: 'allRecords' },
      update: { tickets: 'allRecords' },
      start: { tickets: 'allRecords' },
      submit: { tickets: 'allRecords' },
    }),
    inspections.grant({
      view: { inspections: 'allRecords' },
      update: { inspections: 'allRecords' },
      complete: { inspections: 'allRecords' },
    }),
    knowledge.grant({ view: { knowledge_articles: 'allRecords' } }),
    dashboard.grant({
      view: {
        tickets: 'allRecords',
        devices: 'allRecords',
        inspections: 'allRecords',
      },
    }),
    authz.pages.grant(SERVICE_PAGE_IDS.dashboard),
    authz.pages.grant(SERVICE_PAGE_IDS.devices),
    authz.pages.grant(SERVICE_PAGE_IDS.tickets),
    authz.pages.grant(SERVICE_PAGE_IDS.inspections),
    authz.pages.grant(SERVICE_PAGE_IDS.knowledge),
    authz.pages.grant(SERVICE_PAGE_IDS.assistant),
  ];

  const observerGrants: PermissionGrant[] = [
    tickets.grant({ view: { tickets: 'allRecords' } }),
    knowledge.grant({ view: { knowledge_articles: 'allRecords' } }),
    authz.pages.grant(SERVICE_PAGE_IDS.tickets),
    authz.pages.grant(SERVICE_PAGE_IDS.knowledge),
    authz.pages.grant(SERVICE_PAGE_IDS.assistant),
  ];

  // The integration account is an external device platform, not a service
  // employee. Its key may report a ticket through the intake action and replay
  // its own event, but it holds no view or create grant, so it cannot read the
  // service ledger or seed work through the internal creation endpoint.
  const integrationGrants: PermissionGrant[] = [
    tickets.grant({ ingest: { tickets: 'allRecords' } }),
  ];

  return [
    {
      key: ROLE_PERMISSION_SETS.supervisor,
      title: '售后服务主管',
      description: '客户、设备、工单、巡检与知识库的完整管理权限',
      grants: supervisorGrants,
    },
    {
      key: ROLE_PERMISSION_SETS.engineer,
      title: '服务工程师',
      description: '处理分配给自己的工单并完成设备巡检',
      grants: engineerGrants,
    },
    {
      key: ROLE_PERMISSION_SETS.observer,
      title: '服务观察员',
      description: '只读查看明确共享给本人的工单摘要',
      grants: observerGrants,
    },
    {
      key: ROLE_PERMISSION_SETS.integration,
      title: '外部平台集成',
      description: '设备平台通过 API Key 上报并查询工单',
      grants: integrationGrants,
    },
  ];
}
