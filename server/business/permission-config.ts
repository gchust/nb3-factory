import {
  selection,
  type DataScopeValue,
  type PermissionGrant,
} from '@nocobase/authorization/core';
import { definePermissionSet } from '@nocobase/authorization/permission-sets';

import { SERVICE_ROLE, type ServiceRole } from '../services/access.js';

// The initial permission configuration for the service desk. It is ordinary,
// editable configuration: an administrator can change grants, rename a set or
// reassign it from the Permission Sets workspace, and nothing here runs again to
// undo that. This module only *declares* what a fresh installation starts with.
//
// The business operations themselves (state machine, record scopes) are enforced
// in `server/services/service-desk-impl.ts`, so this configuration documents the
// intended responsibility model and keeps the workspace meaningful.

const PAGE_IDS = {
  dashboard: 'service-dashboard',
  customers: 'service-customers',
  devices: 'service-devices',
  workOrders: 'service-work-orders',
  inspections: 'service-inspections',
  knowledge: 'service-knowledge',
  manuals: 'service-manuals',
  assistant: 'service-assistant',
  notifications: 'service-notifications',
} as const;

const ALL_PAGE_IDS: readonly string[] = Object.values(PAGE_IDS);

interface CompositeScopeMap {
  readonly [scopeKey: string]: DataScopeValue;
}

function compositeGrant(
  id: string,
  action: string,
  scopes: CompositeScopeMap,
): PermissionGrant {
  return {
    resource: { type: 'composite', id },
    actions: [
      {
        action,
        policy: { type: 'composite', scopes },
      },
    ],
  };
}

function pageGrant(id: string): PermissionGrant {
  return {
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  };
}

/** A grant on a plugin-owned settings page, whose authz uses a `settings` resource. */
function settingsGrant(
  id: string,
  ...actions: readonly string[]
): PermissionGrant {
  return {
    resource: { type: 'settings', id },
    actions: actions.map((action) => ({ action })),
  };
}

function pages(...ids: readonly string[]): PermissionGrant[] {
  return ids.map(pageGrant);
}

/** The workOrders scope of every composite carries the record scope; the rest reach all records. */
function workOrderScopes(scope: string): CompositeScopeMap {
  return {
    workOrders: scope,
    events: selection.all(),
    attachments: selection.all(),
    files: selection.all(),
    customers: selection.all(),
    devices: selection.all(),
    shares: selection.all(),
  };
}

/** The scopes of workOrders create/edit/transition actions, which do not read shares or files. */
function workOrderActionScopes(scope: string): CompositeScopeMap {
  return {
    workOrders: scope,
    events: selection.all(),
  };
}

function workOrderCreateScopes(scope: string): CompositeScopeMap {
  return {
    workOrders: scope,
    events: selection.all(),
    customers: selection.all(),
    devices: selection.all(),
  };
}

function single(scopeKey: string): CompositeScopeMap {
  return { [scopeKey]: selection.all() };
}

function supervisorGrants(): PermissionGrant[] {
  return [
    compositeGrant(
      'service.workOrders',
      'view',
      workOrderScopes('service.all'),
    ),
    compositeGrant(
      'service.workOrders',
      'create',
      workOrderCreateScopes('service.all'),
    ),
    compositeGrant(
      'service.workOrders',
      'edit',
      workOrderActionScopes('service.all'),
    ),
    compositeGrant(
      'service.workOrders',
      'accept',
      workOrderActionScopes('service.all'),
    ),
    compositeGrant(
      'service.workOrders',
      'start',
      workOrderActionScopes('service.all'),
    ),
    compositeGrant(
      'service.workOrders',
      'submit',
      workOrderActionScopes('service.all'),
    ),
    compositeGrant(
      'service.workOrders',
      'reject',
      workOrderActionScopes('service.all'),
    ),
    compositeGrant(
      'service.workOrders',
      'close',
      workOrderActionScopes('service.all'),
    ),
    compositeGrant('service.workOrders', 'attach', {
      workOrders: 'service.all',
      attachments: selection.all(),
      files: selection.all(),
    }),
    compositeGrant('service.workOrders', 'share', {
      workOrders: 'service.all',
      shares: selection.all(),
    }),
    compositeGrant('service.customers', 'view', single('customers')),
    compositeGrant('service.customers', 'manage', single('customers')),
    compositeGrant('service.devices', 'view', single('devices')),
    compositeGrant('service.devices', 'manage', single('devices')),
    compositeGrant('service.inspections', 'view', single('inspections')),
    compositeGrant('service.inspections', 'complete', single('inspections')),
    compositeGrant('service.inspections', 'manage', single('inspections')),
    compositeGrant('service.knowledge', 'view', single('articles')),
    compositeGrant('service.knowledge', 'manage', single('articles')),
    compositeGrant('service.manuals', 'view', single('manuals')),
    compositeGrant('service.manuals', 'manage', single('manuals')),
    compositeGrant('service.external', 'submitFault', {
      workOrders: selection.all(),
      events: selection.all(),
      integrationEvents: selection.all(),
      customers: selection.all(),
      devices: selection.all(),
    }),
    compositeGrant('service.external', 'queryOrder', {
      workOrders: selection.all(),
      events: selection.all(),
      integrationEvents: selection.all(),
    }),
    ...pages(...ALL_PAGE_IDS),
    // Administration surfaces a supervisor uses to run and inspect the
    // automation the service desk depends on. These are plugin-owned settings
    // pages, so the grant names their `settings` resource rather than a page.
    settingsGrant('workflow', 'manage'),
    settingsGrant('scheduler.schedules', 'read'),
    // The scheduler's server routes authorize against a `page` resource even
    // though its settings page uses a `settings` resource, so a supervisor who
    // may open the schedule list also needs the page grant.
    pageGrant('scheduler.schedules'),
    pageGrant('notification.logs'),
    pageGrant('ai.settings'),
    pageGrant('api-keys'),
  ];
}

function engineerGrants(): PermissionGrant[] {
  return [
    compositeGrant(
      'service.workOrders',
      'view',
      workOrderScopes('service.visible'),
    ),
    compositeGrant(
      'service.workOrders',
      'create',
      workOrderCreateScopes('service.assigned'),
    ),
    compositeGrant(
      'service.workOrders',
      'edit',
      workOrderActionScopes('service.assigned'),
    ),
    compositeGrant(
      'service.workOrders',
      'accept',
      workOrderActionScopes('service.assigned'),
    ),
    compositeGrant(
      'service.workOrders',
      'start',
      workOrderActionScopes('service.assigned'),
    ),
    compositeGrant(
      'service.workOrders',
      'submit',
      workOrderActionScopes('service.assigned'),
    ),
    compositeGrant('service.workOrders', 'attach', {
      workOrders: 'service.assigned',
      attachments: selection.all(),
      files: selection.all(),
    }),
    compositeGrant('service.customers', 'view', single('customers')),
    compositeGrant('service.devices', 'view', single('devices')),
    compositeGrant('service.inspections', 'view', single('inspections')),
    compositeGrant('service.inspections', 'complete', single('inspections')),
    compositeGrant('service.knowledge', 'view', single('articles')),
    compositeGrant('service.manuals', 'view', single('manuals')),
    ...pages(...ALL_PAGE_IDS),
  ];
}

function observerGrants(): PermissionGrant[] {
  return [
    compositeGrant(
      'service.workOrders',
      'view',
      workOrderScopes('service.visible'),
    ),
    compositeGrant('service.customers', 'view', single('customers')),
    compositeGrant('service.devices', 'view', single('devices')),
    compositeGrant('service.inspections', 'view', single('inspections')),
    compositeGrant('service.knowledge', 'view', single('articles')),
    compositeGrant('service.manuals', 'view', single('manuals')),
    ...pages(...ALL_PAGE_IDS),
  ];
}

function integratorGrants(): PermissionGrant[] {
  return [
    compositeGrant('service.external', 'submitFault', {
      workOrders: selection.all(),
      events: selection.all(),
      integrationEvents: selection.all(),
      customers: selection.all(),
      devices: selection.all(),
    }),
    compositeGrant('service.external', 'queryOrder', {
      workOrders: selection.all(),
      events: selection.all(),
      integrationEvents: selection.all(),
    }),
    // The dedicated integration account issues and revokes its own API keys
    // through the plugin's self-service Settings page. Without the page grant it
    // sees "No settings available" and cannot obtain a key at all.
    pageGrant('api-keys'),
  ];
}

export interface RoleDefinition {
  readonly key: ServiceRole;
  readonly title: string;
  readonly grants: readonly PermissionGrant[];
}

export const SERVICE_ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    key: SERVICE_ROLE.supervisor,
    title: '服务主管',
    grants: supervisorGrants(),
  },
  { key: SERVICE_ROLE.engineer, title: '服务工程师', grants: engineerGrants() },
  { key: SERVICE_ROLE.observer, title: '服务观察员', grants: observerGrants() },
  {
    key: SERVICE_ROLE.integrator,
    title: '外部集成账号',
    grants: integratorGrants(),
  },
];

export function buildPermissionSet(definition: RoleDefinition) {
  return definePermissionSet(definition.key)
    .title(definition.title)
    .grant(...definition.grants)
    .build();
}
