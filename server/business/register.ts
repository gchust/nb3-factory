import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';

import {
  customers,
  devices,
  external,
  inspections,
  knowledge,
  manuals,
  workOrders,
} from './resources.js';

// Opt every collection the business operations touch into the permission model. Registration is independent of
// grants: it declares what exists so a grant, a rule and the workspace can name it. Re-running with the same actions
// is a no-op.
export const SERVICE_COLLECTIONS: readonly { name: string; title: unknown }[] =
  [
    {
      name: 'workOrders',
      title: { key: 'service.collections.workOrders', ns: 'service' },
    },
    {
      name: 'workOrderEvents',
      title: { key: 'service.collections.workOrderEvents', ns: 'service' },
    },
    {
      name: 'workOrderAttachments',
      title: { key: 'service.collections.workOrderAttachments', ns: 'service' },
    },
    {
      name: 'workOrderFiles',
      title: { key: 'service.collections.workOrderFiles', ns: 'service' },
    },
    {
      name: 'workOrderShares',
      title: { key: 'service.collections.workOrderShares', ns: 'service' },
    },
    {
      name: 'customers',
      title: { key: 'service.collections.customers', ns: 'service' },
    },
    {
      name: 'devices',
      title: { key: 'service.collections.devices', ns: 'service' },
    },
    {
      name: 'inspections',
      title: { key: 'service.collections.inspections', ns: 'service' },
    },
    {
      name: 'knowledgeArticles',
      title: { key: 'service.collections.knowledgeArticles', ns: 'service' },
    },
    {
      name: 'deviceManuals',
      title: { key: 'service.collections.deviceManuals', ns: 'service' },
    },
    {
      name: 'deviceIntegrationEvents',
      title: {
        key: 'service.collections.deviceIntegrationEvents',
        ns: 'service',
      },
    },
  ];

export function registerServiceResources(authz: AppAuthorization): void {
  for (const collection of SERVICE_COLLECTIONS) {
    authz.database.collections.add(collection as never);
  }

  const workOrderReference = authz.compositeResources.define(workOrders);
  const customerReference = authz.compositeResources.define(customers);
  const deviceReference = authz.compositeResources.define(devices);
  const inspectionReference = authz.compositeResources.define(inspections);
  const knowledgeReference = authz.compositeResources.define(knowledge);
  const manualReference = authz.compositeResources.define(manuals);
  const externalReference = authz.compositeResources.define(external);

  authz.ui.sections.add({
    name: 'service',
    title: { key: 'service.workspace.title', ns: 'service' },
    parent: 'business',
    order: 10,
  });
  authz.ui.place(workOrderReference, { section: 'service' });
  authz.ui.place(customerReference, { section: 'service' });
  authz.ui.place(deviceReference, { section: 'service' });
  authz.ui.place(inspectionReference, { section: 'service' });
  authz.ui.place(knowledgeReference, { section: 'service' });
  authz.ui.place(manualReference, { section: 'service' });
  authz.ui.place(externalReference, { section: 'service' });
}
