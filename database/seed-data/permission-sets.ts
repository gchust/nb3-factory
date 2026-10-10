import type { PermissionGrant } from '@nocobase/authorization/core';
import { definePermissionSet } from '@nocobase/authorization/permission-sets';

import { serviceResourceReferences } from '../../server/authorization/resources.ts';

/**
 * Initial permission sets for the after-sales service jobs.
 *
 * These are ordinary persisted configuration: the seed writes them once for a
 * fresh install, and an administrator may edit the sets, their scopes or their
 * assignments afterwards without touching this file. The declarations only
 * describe the intended job responsibilities from the delivery requirements.
 */

const pageGrant = (id: string): PermissionGrant => ({
  resource: { type: 'page', id },
  actions: [{ action: 'access' }],
});

/**
 * Reading the user directory.
 *
 * The order form offers an assignee and the sharing form offers a colleague, and
 * both lists come from the users plugin's own `user` record type. Without this
 * grant an engineer can still process the orders they are assigned but cannot
 * see who to hand one to, so the read action is part of the job.
 */
const userDirectoryRead: PermissionGrant = {
  resource: { type: 'user', id: '*' },
  actions: [{ action: 'read' }],
};

const supervisorPages = [
  'service.dashboard',
  'service.orders',
  'service.customers',
  'service.devices',
  'service.knowledge',
  'service.inspections',
  'service.manuals',
  // Administration of the external platform's machine-account API keys. The
  // page is a supervisor capability, so the keys stay issued by a person
  // rather than by the machine account itself.
  'service.integrationKeys',
].map(pageGrant);

export const serviceSupervisor = definePermissionSet('service.supervisor')
  .title('Service supervisor')
  .grant(...supervisorPages)
  .grant(userDirectoryRead)
  .grant(
    serviceResourceReferences.orders.grant({
      view: { orders: 'allRecords' },
      viewSummary: { orders: 'allRecords' },
      create: { orders: 'allRecords' },
      process: { orders: 'allRecords' },
      assign: { orders: 'allRecords' },
      confirm: { orders: 'allRecords' },
      share: { orders: 'allRecords', shares: 'allRecords' },
      viewShares: { shares: 'allRecords' },
    }),
    serviceResourceReferences.ledger.grant({
      view: { devices: 'allRecords', customers: 'allRecords' },
      manage: { devices: 'allRecords', customers: 'allRecords' },
    }),
    serviceResourceReferences.knowledge.grant({
      view: { knowledge: 'allRecords' },
      manage: { knowledge: 'allRecords' },
    }),
    serviceResourceReferences.inspections.grant({
      view: { inspections: 'allRecords' },
      complete: { inspections: 'allRecords' },
    }),
    serviceResourceReferences.manuals.grant({
      view: { manuals: 'allRecords' },
      manage: { manuals: 'allRecords' },
    }),
    serviceResourceReferences.dashboard.grant({
      view: { orders: 'allRecords' },
    }),
  )
  .build();

export const serviceEngineer = definePermissionSet('service.engineer')
  .title('Service engineer')
  .grant(
    pageGrant('service.dashboard'),
    pageGrant('service.orders'),
    pageGrant('service.devices'),
    pageGrant('service.knowledge'),
    pageGrant('service.inspections'),
    pageGrant('service.manuals'),
    userDirectoryRead,
    serviceResourceReferences.orders.grant({
      // Reading includes what a supervisor temporarily shared: a share is a
      // read-only collaboration, so it widens `view` only. Processing and
      // confirming stay pinned to the orders the engineer is assigned.
      view: { orders: 'service.order.assignedOrShared' },
      create: { orders: 'allRecords' },
      process: { orders: 'service.order.assigned' },
      confirm: { orders: 'service.order.assigned' },
    }),
    serviceResourceReferences.ledger.grant({
      view: { devices: 'allRecords', customers: 'allRecords' },
    }),
    serviceResourceReferences.knowledge.grant({
      view: { knowledge: 'service.knowledge.published' },
    }),
    serviceResourceReferences.inspections.grant({
      view: { inspections: 'allRecords' },
      complete: { inspections: 'allRecords' },
    }),
    serviceResourceReferences.manuals.grant({
      view: { manuals: 'allRecords' },
    }),
    serviceResourceReferences.dashboard.grant({
      view: { orders: 'service.order.assignedOrShared' },
    }),
  )
  .build();

/**
 * A read-only observer. Only the summary action is granted, so internal
 * processing notes (description, acceptance note, resolution, return reason)
 * are not in the readable field set even for a released order. Access is
 * limited to orders a supervisor explicitly released with `observerVisible`
 * and that are not confidential; publishing knowledge never grants access by
 * itself, the `view` action does.
 */
export const serviceObserver = definePermissionSet('service.observer')
  .title('Read-only observer')
  .grant(
    pageGrant('service.dashboard'),
    pageGrant('service.orders'),
    pageGrant('service.knowledge'),
    pageGrant('service.manuals'),
    serviceResourceReferences.orders.grant({
      viewSummary: { orders: 'service.order.observer' },
    }),
    serviceResourceReferences.knowledge.grant({
      view: { knowledge: 'service.knowledge.published' },
    }),
    serviceResourceReferences.manuals.grant({
      view: { manuals: 'allRecords' },
    }),
    serviceResourceReferences.dashboard.grant({
      view: { orders: 'service.order.observer' },
    }),
  )
  .build();

/** A machine account: only the device platform event interface, no pages. */
export const serviceIntegrator = definePermissionSet('service.integrator')
  .title('External platform integrator')
  .grant(
    serviceResourceReferences.integration.grant({
      submit: {
        orders: 'allRecords',
        devices: 'allRecords',
        customers: 'allRecords',
      },
    }),
  )
  .build();

export const servicePermissionSets = [
  serviceSupervisor,
  serviceEngineer,
  serviceObserver,
  serviceIntegrator,
] as const;
