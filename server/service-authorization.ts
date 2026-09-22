import type { AuthorizationPlugin } from '@nocobase/authorization/core';
import type { PermissionGrant } from '@nocobase/authorization/permissions';

/**
 * The service module's authorization model.
 *
 * This module is the single source of truth for two things:
 *  - the business resources/actions the permission-sets UI can grant, registered into the
 *    Authorization instance at boot by `serviceAuthorization()`; and
 *  - the initial permission-set values seeded into the database, built here so the seed and
 *    the runtime never disagree about what an action means.
 *
 * Record-level scoping (region, assignee, explicit share, confidentiality, field visibility)
 * is a business rule enforced by the server services, not a backend-toggleable grant.
 */

export const SERVICE_GROUP = 'service';

export interface ServiceResourceDefinition {
  name: string;
  title: string;
  group: string;
  actions: readonly {
    name: string;
    title: string;
    grants: readonly PermissionGrant[];
  }[];
}

function collectionGrant(
  collection: string,
  actions: readonly string[],
): PermissionGrant {
  return {
    resource: { type: 'database.collection', id: collection },
    actions: actions.map((action) => ({ action })),
  };
}

function action(
  name: string,
  title: string,
  grants: readonly PermissionGrant[],
) {
  return { name, title, grants };
}

export const SERVICE_RESOURCES: readonly ServiceResourceDefinition[] = [
  {
    name: 'service.tickets',
    title: 'Service tickets',
    group: SERVICE_GROUP,
    actions: [
      action('view', 'View tickets', [
        collectionGrant('serviceTickets', ['read']),
        collectionGrant('serviceTicketLogs', ['read']),
        collectionGrant('serviceTicketShares', ['read']),
        collectionGrant('serviceTicketFiles', ['read']),
        collectionGrant('serviceCustomers', ['read']),
        collectionGrant('serviceDevices', ['read']),
      ]),
      action('create', 'Create ticket', [
        collectionGrant('serviceTickets', ['create']),
        collectionGrant('serviceTicketLogs', ['create']),
        collectionGrant('serviceTicketFiles', ['create']),
      ]),
      action('edit', 'Edit ticket', [
        collectionGrant('serviceTickets', ['update']),
        collectionGrant('serviceTicketLogs', ['create']),
      ]),
      action('assign', 'Assign ticket', [
        collectionGrant('serviceTickets', ['update']),
        collectionGrant('serviceTicketLogs', ['create']),
        collectionGrant('serviceMembers', ['read']),
      ]),
      action('process', 'Process ticket', [
        collectionGrant('serviceTickets', ['update']),
        collectionGrant('serviceTicketLogs', ['create']),
      ]),
      action('confirm', 'Confirm ticket', [
        collectionGrant('serviceTickets', ['update']),
        collectionGrant('serviceTicketLogs', ['create']),
        collectionGrant('serviceDevices', ['update']),
      ]),
      action('transfer', 'Transfer ticket', [
        collectionGrant('serviceTickets', ['update']),
        collectionGrant('serviceTicketLogs', ['create']),
      ]),
      action('share', 'Share ticket', [
        collectionGrant('serviceTicketShares', ['create', 'update']),
        collectionGrant('serviceTickets', ['read']),
      ]),
    ],
  },
  {
    name: 'service.customers',
    title: 'Customers',
    group: SERVICE_GROUP,
    actions: [
      action('view', 'View customers', [
        collectionGrant('serviceCustomers', ['read']),
        collectionGrant('serviceDevices', ['read']),
      ]),
      action('manage', 'Manage customers', [
        collectionGrant('serviceCustomers', ['create', 'update', 'delete']),
        collectionGrant('serviceDevices', ['create', 'update', 'delete']),
      ]),
    ],
  },
  {
    name: 'service.devices',
    title: 'Device ledger',
    group: SERVICE_GROUP,
    actions: [
      action('view', 'View devices', [
        collectionGrant('serviceDevices', ['read']),
        collectionGrant('serviceCustomers', ['read']),
      ]),
      action('manage', 'Manage devices', [
        collectionGrant('serviceDevices', ['create', 'update', 'delete']),
        collectionGrant('serviceCustomers', ['read']),
      ]),
    ],
  },
  {
    name: 'service.knowledge',
    title: 'Knowledge base',
    group: SERVICE_GROUP,
    actions: [
      action('view', 'View knowledge', [
        collectionGrant('serviceKnowledge', ['read']),
        collectionGrant('serviceKnowledgeFiles', ['read']),
      ]),
      action('manage', 'Manage knowledge', [
        collectionGrant('serviceKnowledge', ['create', 'update', 'delete']),
        collectionGrant('serviceKnowledgeFiles', ['create', 'delete']),
      ]),
    ],
  },
  {
    name: 'service.inspections',
    title: 'Inspections',
    group: SERVICE_GROUP,
    actions: [
      action('view', 'View inspections', [
        collectionGrant('serviceInspectionPlans', ['read']),
        collectionGrant('serviceInspectionTasks', ['read']),
      ]),
      action('manage', 'Manage inspections', [
        collectionGrant('serviceInspectionPlans', [
          'create',
          'update',
          'delete',
        ]),
        collectionGrant('serviceInspectionTasks', [
          'create',
          'update',
          'delete',
        ]),
      ]),
    ],
  },
  {
    name: 'service.dashboard',
    title: 'Operations dashboard',
    group: SERVICE_GROUP,
    actions: [
      action('view', 'View dashboard', [
        collectionGrant('serviceTickets', ['read']),
        collectionGrant('serviceInspectionTasks', ['read']),
        collectionGrant('serviceDevices', ['read']),
      ]),
    ],
  },
  {
    name: 'service.assistant',
    title: 'Service assistant',
    group: SERVICE_GROUP,
    actions: [
      action('use', 'Use service assistant', [
        collectionGrant('serviceKnowledge', ['read']),
        collectionGrant('serviceTickets', ['read']),
        collectionGrant('serviceAssistantConversations', ['create', 'read']),
        collectionGrant('serviceAssistantMessages', ['create', 'read']),
      ]),
    ],
  },
  {
    name: 'service.integration',
    title: 'Device platform integration',
    group: SERVICE_GROUP,
    actions: [
      action('consume', 'Report and read reported tickets', [
        collectionGrant('serviceTickets', ['create', 'read', 'update']),
        collectionGrant('serviceTicketLogs', ['create', 'read']),
        collectionGrant('serviceDevices', ['read']),
        collectionGrant('serviceCustomers', ['read']),
      ]),
    ],
  },
  {
    name: 'service.records',
    title: 'Cross-region record scope',
    group: SERVICE_GROUP,
    actions: [
      action('viewAll', 'Read records in every region', [
        collectionGrant('serviceTickets', ['read']),
        collectionGrant('serviceCustomers', ['read']),
        collectionGrant('serviceDevices', ['read']),
        collectionGrant('serviceInspectionPlans', ['read']),
        collectionGrant('serviceInspectionTasks', ['read']),
      ]),
    ],
  },
  {
    name: 'service.members',
    title: 'Service team',
    group: SERVICE_GROUP,
    actions: [
      action('view', 'View team membership', [
        collectionGrant('serviceMembers', ['read']),
      ]),
      action('manage', 'Manage team membership', [
        collectionGrant('serviceMembers', ['create', 'update', 'delete']),
      ]),
    ],
  },
];

/** Page resources declared by `client/routes.ts`, granted independently of business actions. */
export const SERVICE_PAGES: readonly { id: string; title: string }[] = [
  { id: 'service.dashboard', title: 'Operations dashboard' },
  { id: 'service.tickets', title: 'Service tickets' },
  { id: 'service.customers', title: 'Customers' },
  { id: 'service.devices', title: 'Device ledger' },
  { id: 'service.knowledge', title: 'Knowledge base' },
  { id: 'service.inspections', title: 'Inspections' },
  { id: 'service.automation', title: 'Automatic acceptance' },
  { id: 'service.assistant', title: 'Service assistant' },
  { id: 'service.members', title: 'Service team' },
];

export interface ServicePermissionSetDefinition {
  key: string;
  title: string;
  pages: readonly string[];
  actions: Readonly<Record<string, readonly string[]>>;
}

export const SERVICE_PERMISSION_SETS: readonly ServicePermissionSetDefinition[] =
  [
    {
      key: 'service-admin',
      title: 'Service administrator',
      pages: SERVICE_PAGES.map((page) => page.id),
      actions: {
        'service.tickets': [
          'view',
          'create',
          'edit',
          'assign',
          'process',
          'confirm',
          'transfer',
          'share',
        ],
        'service.customers': ['view', 'manage'],
        'service.devices': ['view', 'manage'],
        'service.knowledge': ['view', 'manage'],
        'service.inspections': ['view', 'manage'],
        'service.dashboard': ['view'],
        'service.assistant': ['use'],
        'service.members': ['view', 'manage'],
        'service.records': ['viewAll'],
      },
    },
    {
      key: 'service-manager',
      title: 'Service supervisor',
      pages: SERVICE_PAGES.filter((page) => page.id !== 'service.members').map(
        (page) => page.id,
      ),
      actions: {
        'service.tickets': [
          'view',
          'create',
          'edit',
          'assign',
          'process',
          'confirm',
          'transfer',
          'share',
        ],
        'service.customers': ['view', 'manage'],
        'service.devices': ['view', 'manage'],
        'service.knowledge': ['view', 'manage'],
        'service.inspections': ['view', 'manage'],
        'service.dashboard': ['view'],
        'service.assistant': ['use'],
        'service.members': ['view'],
        'service.records': ['viewAll'],
      },
    },
    {
      key: 'service-engineer',
      title: 'Regional service engineer',
      pages: [
        'service.dashboard',
        'service.tickets',
        'service.customers',
        'service.devices',
        'service.knowledge',
        'service.inspections',
        'service.automation',
        'service.assistant',
      ],
      actions: {
        'service.tickets': ['view', 'create', 'edit', 'process'],
        'service.customers': ['view'],
        'service.devices': ['view'],
        'service.knowledge': ['view'],
        'service.inspections': ['view'],
        'service.dashboard': ['view'],
        'service.assistant': ['use'],
        'service.members': ['view'],
      },
    },
    {
      key: 'service-collaborator',
      title: 'Cross-region collaboration engineer',
      pages: [
        'service.dashboard',
        'service.tickets',
        'service.knowledge',
        'service.automation',
        'service.assistant',
      ],
      actions: {
        'service.tickets': ['view', 'edit', 'process'],
        'service.knowledge': ['view'],
        'service.dashboard': ['view'],
        'service.assistant': ['use'],
      },
    },
    {
      key: 'service-observer',
      title: 'Read-only business observer',
      pages: [
        'service.dashboard',
        'service.tickets',
        'service.customers',
        'service.devices',
        'service.knowledge',
        'service.inspections',
        'service.automation',
      ],
      actions: {
        'service.tickets': ['view'],
        'service.customers': ['view'],
        'service.devices': ['view'],
        'service.knowledge': ['view'],
        'service.inspections': ['view'],
        'service.dashboard': ['view'],
        'service.records': ['viewAll'],
      },
    },
    {
      key: 'service-integration',
      title: 'External device platform account',
      pages: [],
      actions: {
        'service.tickets': ['view', 'create'],
        'service.integration': ['consume'],
      },
    },
  ];

/** Build the persisted permission-set rows for the seeded business configuration. */
export function buildServicePermissionSets(): readonly {
  key: string;
  title: string;
  grants: PermissionGrant[];
}[] {
  const resourceByName = new Map(
    SERVICE_RESOURCES.map((resource) => [resource.name, resource]),
  );
  return SERVICE_PERMISSION_SETS.map((definition) => {
    const grants: PermissionGrant[] = definition.pages.map((page) => ({
      resource: { type: 'page', id: page },
      actions: [{ action: 'access' }],
    }));
    for (const [resourceName, actions] of Object.entries(definition.actions)) {
      const resource = resourceByName.get(resourceName);
      if (!resource)
        throw new Error(`Unknown service resource: ${resourceName}`);
      grants.push({
        resource: { type: 'resource', id: resourceName },
        actions: actions.map((name) => {
          if (!resource.actions.some((item) => item.name === name))
            throw new Error(`Unknown service action: ${resourceName}.${name}`);
          return { action: name };
        }),
      });
    }
    return { key: definition.key, title: definition.title, grants };
  });
}

/** Register the business model into the application Authorization instance. */
export function serviceAuthorization(): AuthorizationPlugin {
  return {
    id: 'service-model',
    requiresGrants: true,
    setup(authz) {
      authz.resourceGroups.add({
        category: 'business',
        name: SERVICE_GROUP,
        title: 'Service operations',
      });
      for (const resource of SERVICE_RESOURCES) {
        authz.resources.add({
          name: resource.name,
          title: resource.title,
          group: resource.group,
          actions: resource.actions.map((item) => ({
            name: item.name,
            title: item.title,
            grants: [...item.grants],
          })),
        });
      }
    },
  };
}
