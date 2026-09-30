import {
  definePermissionSet,
  type PermissionSet,
} from '@nocobase/authorization/permission-sets';
import type { PermissionGrant } from '@nocobase/authorization/core';
import {
  serviceCustomers,
  serviceDashboard,
  serviceDevices,
  serviceInspections,
  serviceKnowledge,
  serviceManuals,
  serviceTickets,
  SERVICE_TEAM_SUBJECT,
} from '../../server/service-resources.ts';

/**
 * Initial permission values for the service jobs. These are ordinary,
 * editable configuration: an administrator can change every grant, scope and
 * assignment in the authorization backend after installation. `.build()` only
 * produces a value — the seed persists it.
 */

function page(id: string): PermissionGrant {
  return {
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  };
}

const SUPERVISOR_PAGES = [
  'service.dashboard',
  'service.customers',
  'service.devices',
  'service.tickets',
  'service.knowledge',
  'service.inspections',
  'service.manuals',
  'service.assistant',
  'api-keys',
] as const;

const ENGINEER_PAGES = [
  'service.dashboard',
  'service.customers',
  'service.devices',
  'service.tickets',
  'service.knowledge',
  'service.inspections',
  'service.manuals',
  'service.assistant',
] as const;

const OBSERVER_PAGES = [
  'service.dashboard',
  'service.customers',
  'service.devices',
  'service.tickets',
  'service.knowledge',
  'service.manuals',
] as const;

/** The after-sales supervisor: full configuration and all records. */
export const serviceSupervisor = definePermissionSet('service-supervisor')
  .title('Service supervisor')
  .grant(...SUPERVISOR_PAGES.map(page))
  .grant(
    serviceDashboard.reference().grant({
      view: {
        tickets: 'allRecords',
        inspections: 'allRecords',
        customers: 'allRecords',
        devices: 'allRecords',
      },
    }),
  )
  .grant(
    serviceCustomers.reference().grant({
      view: { customers: 'allRecords' },
      manage: { customers: 'allRecords' },
    }),
  )
  .grant(
    serviceDevices.reference().grant({
      view: { devices: 'allRecords' },
      manage: { devices: 'allRecords' },
    }),
  )
  .grant(
    serviceTickets.reference().grant({
      view: { tickets: 'allRecords', events: 'allRecords' },
      create: { tickets: 'allRecords', events: 'allRecords' },
      accept: { tickets: 'allRecords', events: 'allRecords' },
      return: { tickets: 'allRecords', events: 'allRecords' },
      close: { tickets: 'allRecords', events: 'allRecords' },
      share: { tickets: 'allRecords' },
      manage: { tickets: 'allRecords', events: 'allRecords' },
    }),
  )
  .grant(
    serviceKnowledge.reference().grant({
      view: { articles: 'allRecords' },
      manage: { articles: 'allRecords' },
    }),
  )
  .grant(
    serviceManuals.reference().grant({
      view: { manuals: 'allRecords' },
      manage: { manuals: 'allRecords' },
    }),
  )
  .grant(
    serviceInspections.reference().grant({
      view: { inspections: 'allRecords' },
      complete: { inspections: 'allRecords' },
      manage: { inspections: 'allRecords' },
    }),
  )
  .build();

/** The field engineer: works only the tickets and devices they are given. */
export const serviceEngineer = definePermissionSet('service-engineer')
  .title('Service engineer')
  .grant(...ENGINEER_PAGES.map(page))
  .grant(
    serviceDashboard.reference().grant({
      view: {
        tickets: 'service.readableTickets',
        inspections: 'service.myInspections',
        customers: 'service.myCustomers',
        devices: 'service.myDevices',
      },
    }),
  )
  .grant(
    serviceCustomers.reference().grant({
      view: { customers: 'service.myCustomers' },
    }),
  )
  .grant(
    serviceDevices.reference().grant({
      view: { devices: 'service.myDevices' },
    }),
  )
  .grant(
    serviceTickets.reference().grant({
      view: { tickets: 'service.readableTickets', events: 'allRecords' },
      create: { tickets: 'service.createdTickets', events: 'allRecords' },
      process: { tickets: 'service.readableTickets', events: 'allRecords' },
      submit: { tickets: 'service.readableTickets', events: 'allRecords' },
    }),
  )
  .grant(
    serviceKnowledge.reference().grant({
      view: { articles: 'service.publishedKnowledge' },
    }),
  )
  .grant(
    serviceManuals.reference().grant({
      view: { manuals: 'service.publishedManuals' },
    }),
  )
  .grant(
    serviceInspections.reference().grant({
      view: { inspections: 'service.myInspections' },
      complete: { inspections: 'service.myInspections' },
    }),
  )
  .build();

/** The read-only observer: everything except confidential tickets. */
export const serviceObserver = definePermissionSet('service-observer')
  .title('Read-only observer')
  .grant(...OBSERVER_PAGES.map(page))
  .grant(
    serviceDashboard.reference().grant({
      view: {
        tickets: 'service.nonConfidentialTickets',
        inspections: 'allRecords',
        customers: 'allRecords',
        devices: 'allRecords',
      },
    }),
  )
  .grant(
    serviceCustomers.reference().grant({
      view: { customers: 'allRecords' },
    }),
  )
  .grant(
    serviceDevices.reference().grant({
      view: { devices: 'allRecords' },
    }),
  )
  .grant(
    serviceTickets.reference().grant({
      view: {
        tickets: 'service.nonConfidentialTickets',
      },
    }),
  )
  .grant(
    serviceKnowledge.reference().grant({
      view: { articles: 'service.publishedKnowledge' },
    }),
  )
  .grant(
    serviceManuals.reference().grant({
      view: { manuals: 'service.publishedManuals' },
    }),
  )
  .grant(
    serviceInspections.reference().grant({
      view: { inspections: 'allRecords' },
    }),
  )
  .build();

/**
 * The external device platform. It signs in with an API key and may submit
 * repair events and read back only the tickets it created.
 */
export const serviceIntegration = definePermissionSet('service-integration')
  .title('External integration user')
  .grant(page('api-keys'))
  .grant(
    serviceTickets.reference().grant({
      view: { tickets: 'service.createdTickets', events: 'allRecords' },
      create: { tickets: 'service.createdTickets', events: 'allRecords' },
    }),
  )
  .build();

export const servicePermissionSets: readonly PermissionSet[] = [
  serviceSupervisor,
  serviceEngineer,
  serviceObserver,
  serviceIntegration,
];

/**
 * Permission-set key → the demo account/group it is assigned to. Engineer sets
 * are assigned to the group subject, so membership, not the account, carries
 * the access.
 */
export const serviceDemoAssignments = [
  {
    subject: { type: 'user', id: 'supervisor' },
    permissionSet: 'service-supervisor',
  },
  {
    subject: { type: 'user', id: 'observer' },
    permissionSet: 'service-observer',
  },
  {
    subject: { type: 'user', id: 'integration' },
    permissionSet: 'service-integration',
  },
  {
    subject: { type: SERVICE_TEAM_SUBJECT, id: 'A' },
    permissionSet: 'service-engineer',
  },
  {
    subject: { type: SERVICE_TEAM_SUBJECT, id: 'B' },
    permissionSet: 'service-engineer',
  },
] as const;
