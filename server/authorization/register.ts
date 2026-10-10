import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager } from '@nocobase/db';

import { registerServiceRecordAccess } from './record-access.js';
import { serviceResourceReferences, serviceResources } from './resources.js';

/**
 * Registers the after-sales collections, record scopes and composite resources.
 *
 * Collections are opt-in: a table the app did not add here is denied even to
 * unrestricted users, so every table the business routes read or write is
 * listed. Composite actions are declared in `resources.ts`; nothing on the
 * business side is widened (such as deleting an order) because the action
 * catalogue below does not offer it.
 */
const AUTHORIZED_COLLECTIONS: ReadonlyArray<{
  name: string;
  title: string;
  actions?: readonly string[];
}> = [
  { name: 'service_groups', title: 'Service groups' },
  { name: 'customers', title: 'Customers' },
  { name: 'devices', title: 'Devices' },
  { name: 'service_orders', title: 'Service orders' },
  { name: 'service_order_logs', title: 'Service order logs' },
  { name: 'service_order_shares', title: 'Service order shares' },
  { name: 'service_inspections', title: 'Service inspections' },
  { name: 'repair_knowledge', title: 'Repair knowledge' },
  { name: 'device_manuals', title: 'Device manuals' },
  { name: 'service_order_files', title: 'Service order files' },
];

export function registerServiceAuthorization(
  authz: AppAuthorization,
  database: DatabaseManager,
): void {
  registerServiceRecordAccess(authz, database);

  for (const collection of AUTHORIZED_COLLECTIONS) {
    authz.database.collections.add(collection);
  }

  // `serviceResources` is a heterogeneous tuple of builders whose action
  // generics differ, so the array element type no longer satisfies `define`'s
  // generic parameter. Register each builder's built definition instead; the
  // typed `reference()` used for grants is kept in `serviceResourceReferences`.
  for (const resource of serviceResources) {
    authz.compositeResources.define(resource.build());
  }

  // The permission workspace groups the composites under a subsection of
  // `business`, so an administrator sees them as one service module instead of
  // scattered under “Other”.
  authz.ui.sections.add({
    name: 'service',
    title: 'After-sales service',
    parent: 'business',
  });
  for (const reference of Object.values(serviceResourceReferences)) {
    authz.ui.place(reference, { section: 'service' });
  }
}
