import type { AppAuthorization } from '@nocobase/app-plugin-authorization';

import {
  INSPECTOR_ROLE,
  SUPERVISOR_ROLE,
  TEAM_LEADER_ROLE,
} from './production-domain.js';

type PermissionSetsApi = AppAuthorization['permissionSets'];
type PermissionSetInput = Parameters<PermissionSetsApi['update']>[1];
type PermissionGrants = PermissionSetInput['grants'];
type PermissionGrant = PermissionGrants[number];

/**
 * The client route names that gate access to the production pages. A page route without an explicit
 * `access` rule is checked as `{ resource: route.name, action: 'access' }`, so a role needs a page grant
 * for every page it may open. Admin has a wildcard page grant; these roles get an explicit list.
 */
const WORK_ORDER_PAGES = [
  'productionWorkOrders',
  'productionWorkOrderDetail',
] as const;

/** The three application roles this feature adds, with the pages each role may open. */
export const APPLICATION_ROLES: readonly {
  key: string;
  title: string;
  pages: readonly string[];
}[] = [
  {
    key: SUPERVISOR_ROLE,
    title: 'Production supervisor',
    pages: [
      ...WORK_ORDER_PAGES,
      'productionProducts',
      'productionDefects',
      'productionStatistics',
    ],
  },
  {
    key: TEAM_LEADER_ROLE,
    title: 'Team leader',
    pages: [...WORK_ORDER_PAGES],
  },
  {
    key: INSPECTOR_ROLE,
    title: 'Quality inspector',
    pages: [...WORK_ORDER_PAGES, 'productionDefects'],
  },
];

function pageAccessGrant(pageId: string): PermissionGrant {
  return {
    resource: { type: 'page', id: pageId },
    actions: [{ action: 'access' }],
  };
}

/**
 * Adds the required grants to a permission set without dropping anything an administrator configured.
 * An action already present for the same resource is left untouched.
 */
function mergeGrants(
  current: PermissionGrants,
  required: PermissionGrants,
): PermissionGrant[] {
  const merged: PermissionGrant[] = current.map((grant) => ({
    ...grant,
    actions: [...grant.actions],
  }));
  for (const grant of required) {
    const index = merged.findIndex(
      (candidate) =>
        candidate.resource.type === grant.resource.type &&
        candidate.resource.id === grant.resource.id,
    );
    if (index === -1) {
      merged.push({ ...grant, actions: [...grant.actions] });
      continue;
    }
    const actions = merged[index].actions;
    const existing = new Set(actions.map(({ action }) => action));
    const missing = grant.actions.filter(({ action }) => !existing.has(action));
    if (missing.length > 0) {
      merged[index] = { ...merged[index], actions: [...actions, ...missing] };
    }
  }
  return merged;
}

/**
 * Creates the application Permission Sets if they are missing and ensures each carries the page grants
 * its role needs. They are the role source the Users page lists and the server resolves, so both startup
 * and self-registration call this before an assignment is written. Idempotent, and it repairs the empty
 * grants an older release created.
 */
export async function ensureApplicationRoles(
  authorization: Pick<AppAuthorization, 'permissionSets'>,
): Promise<void> {
  for (const role of APPLICATION_ROLES) {
    const required = role.pages.map(pageAccessGrant);
    const existing = await authorization.permissionSets.get(role.key);
    if (!existing) {
      await authorization.permissionSets.create({
        key: role.key,
        title: role.title,
        grants: required,
      });
      continue;
    }
    const grants = mergeGrants(existing.grants, required);
    if (JSON.stringify(grants) === JSON.stringify(existing.grants)) continue;
    await authorization.permissionSets.update(role.key, {
      key: role.key,
      title: existing.title?.trim() || role.title,
      grants,
    });
  }
}
