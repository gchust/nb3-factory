import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import type { PermissionSet } from '@nocobase/authorization/permission-sets';
import type { PermissionGrant } from '@nocobase/authorization/core';

import { SERVICE_NS, SERVICE_PERMISSION_SET } from './constants.js';
import { serviceRecordAccess } from './record-access.js';
import {
  serviceCustomers,
  serviceDirectory,
  serviceEquipment,
  serviceInspections,
  serviceIntegration,
  serviceKnowledge,
  serviceManuals,
  serviceWorkOrders,
} from './resources.js';

/**
 * The four business roles of the service desk, written as code-owned permission sets.
 *
 * These are complete definitions, not patches to the built-in `root` and `member` sets: a deployment review
 * should be able to read one function and know exactly what a service supervisor may do. The provisioning
 * routine creates each set only when it is missing, so an administrator's later edits to a set are never
 * overwritten, and assignment only happens for accounts the routine itself created.
 *
 * Record-access keys are written as strings because a stored grant is serialized anyway; the composite registry
 * validates them against the options each data scope declares when the set is created.
 */

function title(key: string): { key: string; ns: string } {
  return { key, ns: SERVICE_NS };
}

/**
 * The page ids used by `client/routes.ts` and by the permission sets below. They are the values the client route's
 * `authz.resource.id` checks, so a change here must be made on both sides together.
 */
export const SERVICE_PAGE = {
  DASHBOARD: 'service.dashboard',
  CUSTOMERS: 'service.customers',
  EQUIPMENT: 'service.equipment',
  WORK_ORDERS: 'service.workOrders',
  WORK_ORDER_DETAIL: 'service.workOrderDetail',
  INSPECTIONS: 'service.inspections',
  KNOWLEDGE: 'service.knowledge',
  MANUALS: 'service.manuals',
  NOTIFICATIONS: 'service.notifications',
} as const;

/**
 * Builds the page `access` grant the client route's `authz` checks. Written by hand because a permission-set
 * definition is built before an authorization service exists; `authz.pages.grant(id)` produces exactly this shape.
 */
function pageGrant(id: string): PermissionGrant {
  return {
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  };
}

function everyServicePage(): readonly PermissionGrant[] {
  return Object.values(SERVICE_PAGE).map(pageGrant);
}

/** The service supervisor: every work order, ledger, inspection and manual. */
function supervisor(): PermissionSet {
  return definePermissionSet(SERVICE_PERMISSION_SET.SUPERVISOR)
    .title(title('service.permissionSet.supervisor'))
    .grant(
      serviceWorkOrders.grant({
        view: {
          workOrders: serviceRecordAccess.allRecords.key,
          attachments: serviceRecordAccess.allRecords.key,
        },
        create: {},
        update: { workOrders: serviceRecordAccess.allRecords.key },
        accept: { workOrders: serviceRecordAccess.allRecords.key },
        start: { workOrders: serviceRecordAccess.allRecords.key },
        submit: { workOrders: serviceRecordAccess.allRecords.key },
        confirm: { workOrders: serviceRecordAccess.allRecords.key },
        return: { workOrders: serviceRecordAccess.allRecords.key },
        share: { shares: serviceRecordAccess.allRecords.key },
        attach: { attachments: serviceRecordAccess.allRecords.key },
        delete: { workOrders: serviceRecordAccess.allRecords.key },
      }),
      serviceCustomers.grant({
        view: { customers: serviceRecordAccess.allRecords.key },
        manage: { customers: serviceRecordAccess.allRecords.key },
      }),
      serviceEquipment.grant({
        view: {
          equipment: serviceRecordAccess.allRecords.key,
          manuals: serviceRecordAccess.allRecords.key,
        },
        manage: {
          equipment: serviceRecordAccess.allRecords.key,
          customers: serviceRecordAccess.allRecords.key,
        },
      }),
      serviceInspections.grant({
        view: { inspections: serviceRecordAccess.allRecords.key },
        create: {
          inspections: serviceRecordAccess.allRecords.key,
          equipment: serviceRecordAccess.allRecords.key,
        },
        complete: { inspections: serviceRecordAccess.allRecords.key },
      }),
      serviceKnowledge.grant({
        view: { knowledge: serviceRecordAccess.allRecords.key },
        manage: { knowledge: serviceRecordAccess.allRecords.key },
      }),
      serviceManuals.grant({
        view: { manuals: serviceRecordAccess.allRecords.key },
        manage: {
          manuals: serviceRecordAccess.allRecords.key,
          equipment: serviceRecordAccess.allRecords.key,
        },
      }),
      serviceIntegration.grant({
        read: {
          workOrders: serviceRecordAccess.allRecords.key,
          customers: serviceRecordAccess.allRecords.key,
          equipment: serviceRecordAccess.allRecords.key,
        },
      }),
      serviceDirectory.grant({ view: {} }),
      ...everyServicePage(),
    )
    .build();
}

/** The service engineer: own, same-group and shared work orders plus the equipment they serve. */
function engineer(): PermissionSet {
  return definePermissionSet(SERVICE_PERMISSION_SET.ENGINEER)
    .title(title('service.permissionSet.engineer'))
    .grant(
      serviceWorkOrders.grant({
        view: {
          workOrders: serviceRecordAccess.workOrdersForEngineer.key,
          attachments: serviceRecordAccess.allRecords.key,
        },
        create: {},
        update: { workOrders: serviceRecordAccess.workOrdersForEngineer.key },
        accept: { workOrders: serviceRecordAccess.assignedToMe.key },
        start: { workOrders: serviceRecordAccess.assignedToMe.key },
        submit: { workOrders: serviceRecordAccess.assignedToMe.key },
        return: { workOrders: serviceRecordAccess.assignedToMe.key },
        share: { shares: serviceRecordAccess.allRecords.key },
        attach: { attachments: serviceRecordAccess.allRecords.key },
      }),
      serviceCustomers.grant({
        view: { customers: serviceRecordAccess.customersForEngineer.key },
      }),
      serviceEquipment.grant({
        view: {
          equipment: serviceRecordAccess.equipmentSameGroup.key,
          manuals: serviceRecordAccess.manualsForEngineer.key,
        },
      }),
      serviceInspections.grant({
        view: { inspections: serviceRecordAccess.assignedToMe.key },
        complete: { inspections: serviceRecordAccess.assignedToMe.key },
      }),
      serviceKnowledge.grant({
        view: { knowledge: serviceRecordAccess.publishedKnowledge.key },
      }),
      serviceManuals.grant({
        view: { manuals: serviceRecordAccess.manualsForEngineer.key },
      }),
      serviceDirectory.grant({ view: {} }),
      ...everyServicePage(),
    )
    .build();
}

/** The read-only observer: non-confidential work orders and published material. */
function observer(): PermissionSet {
  return definePermissionSet(SERVICE_PERMISSION_SET.OBSERVER)
    .title(title('service.permissionSet.observer'))
    .grant(
      serviceWorkOrders.grant({
        view: {
          workOrders: serviceRecordAccess.nonConfidentialWorkOrders.key,
          attachments: serviceRecordAccess.allRecords.key,
        },
      }),
      serviceCustomers.grant({
        view: { customers: serviceRecordAccess.allRecords.key },
      }),
      serviceEquipment.grant({
        view: {
          equipment: serviceRecordAccess.allRecords.key,
          manuals: serviceRecordAccess.publishedManuals.key,
        },
      }),
      serviceInspections.grant({
        view: { inspections: serviceRecordAccess.allRecords.key },
      }),
      serviceKnowledge.grant({
        view: { knowledge: serviceRecordAccess.publishedKnowledge.key },
      }),
      serviceManuals.grant({
        view: { manuals: serviceRecordAccess.publishedManuals.key },
      }),
      serviceDirectory.grant({ view: {} }),
      ...everyServicePage(),
    )
    .build();
}

/** The external equipment platform: read its own orders and ingest new events. */
function integrator(): PermissionSet {
  return definePermissionSet(SERVICE_PERMISSION_SET.INTEGRATOR)
    .title(title('service.permissionSet.integrator'))
    .grant(
      serviceIntegration.grant({
        read: {
          workOrders: serviceRecordAccess.allRecords.key,
          customers: serviceRecordAccess.allRecords.key,
          equipment: serviceRecordAccess.allRecords.key,
        },
        ingest: {},
      }),
    )
    .build();
}

/** Every code-owned permission set, in review order. */
export const servicePermissionSetDefinitions: readonly (() => PermissionSet)[] =
  [supervisor, engineer, observer, integrator];
